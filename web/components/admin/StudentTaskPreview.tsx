"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import StudentChoiceAnswerFields from "@/components/student/StudentChoiceAnswerFields";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import StudentWrittenAnswerFields from "@/components/student/StudentWrittenAnswerFields";
import MathRender from "@/components/ui/MathRender";
import { apiPath, checkAdminTaskAnswerPreview } from "@/lib/api";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskMcqCorrectCount } from "@/lib/question-options";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { isTrialTaskAnswerComplete } from "@/lib/trial-test-answer";
import type { LessonTask } from "@/types";

interface StudentTaskPreviewProps {
  task: Partial<LessonTask>;
  imageSrc?: string | null;
  className?: string;
}

type PreviewViewport = "mobile" | "desktop";
type PreviewFeedback = { kind: "correct" | "incorrect" | "error"; message: string };

const asPreviewTask = (task: Partial<LessonTask>): LessonTask => ({
  id: task.id ?? -1,
  text: task.text || "",
  question_type: task.question_type || "input",
  answer_mode: task.answer_mode,
  answer: task.answer || "",
  accepted_answers: Array.isArray(task.accepted_answers) ? task.accepted_answers : [],
  correct_count: task.correct_count,
  text_scale: task.text_scale || "md",
  options: Array.isArray(task.options) ? task.options : [],
  subquestions: Array.isArray(task.subquestions) ? task.subquestions : [],
  image_filename: task.image_filename || null,
  sort_order: task.sort_order ?? 0,
});

export default function StudentTaskPreview({
  task,
  imageSrc,
  className = "",
}: StudentTaskPreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("mobile");
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<PreviewFeedback | null>(null);
  const checkRequestId = useRef(0);
  const previewTask = useMemo(() => asPreviewTask(task), [task]);
  const answerMode = getTaskAnswerMode(previewTask);
  const answerDefinitionSignature = JSON.stringify({
    questionType: previewTask.question_type,
    answerMode,
    answer: previewTask.answer,
    acceptedAnswers: previewTask.accepted_answers,
    options: previewTask.options,
    subquestions: previewTask.subquestions,
  });

  useEffect(() => {
    checkRequestId.current += 1;
    setAnswer("");
    setChecking(false);
    setFeedback(null);
  }, [answerDefinitionSignature]);

  const resolvedImageSrc =
    imageSrc === undefined && previewTask.image_filename
      ? apiPath(`images/${previewTask.image_filename}`)
      : imageSrc;
  const answerComplete = isTrialTaskAnswerComplete(previewTask, answer);
  const updateAnswer = (value: string) => {
    setAnswer(value);
    setFeedback(null);
  };

  const checkAnswer = async () => {
    if (!answerComplete || checking) return;
    const requestId = checkRequestId.current + 1;
    checkRequestId.current = requestId;
    setChecking(true);
    setFeedback(null);

    const { data, error } = await checkAdminTaskAnswerPreview(previewTask, answer);
    if (checkRequestId.current !== requestId) return;
    setChecking(false);
    if (error || !data) {
      setFeedback({
        kind: "error",
        message: error || "Жауапты тексеру мүмкін болмады",
      });
      return;
    }
    setFeedback(
      data.correct
        ? { kind: "correct", message: "Жауап дұрыс" }
        : { kind: "incorrect", message: "Жауап дұрыс емес" }
    );
  };

  const renderAnswerFields = () => {
    const questionType = previewTask.question_type;

    if (questionType === "tf") {
      return (
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "true", label: "Дұрыс", color: "green" },
            { value: "false", label: "Жалған", color: "red" },
          ].map((option) => {
            const selected = answer === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => updateAnswer(option.value)}
                className={`rounded-lg px-4 py-3 font-bold text-white transition-colors ${
                  selected
                    ? option.color === "green"
                      ? "bg-green-700 ring-2 ring-green-300"
                      : "bg-red-700 ring-2 ring-red-300"
                    : option.color === "green"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (questionType === "factor_grid") {
      const cells = parseFactorGridAnswer(answer);
      return (
        <div className="mx-auto flex w-fit max-w-full flex-col gap-3">
          {[0, 1].map((row) => (
            <div key={`preview-factor-row-${row}`} className="flex items-center gap-10 sm:gap-14">
              {[0, 1].map((column) => {
                const index = row * 2 + column;
                return (
                  <div key={`preview-factor-${index}`} className="w-[5.5rem]">
                    <StudentMathAnswerInput
                      value={cells[index]}
                      onChange={(value) => {
                        const next = [...cells] as typeof cells;
                        next[index] = value;
                        updateAnswer(serializeFactorGridAnswer(next));
                      }}
                      compact
                      ariaLabel={`Жауап ${index + 1}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      );
    }

    if (questionType === "mcq" || questionType === "mcq6" || questionType === "select") {
      if (answerMode === "choices") {
        return (
          <StudentChoiceAnswerFields
            task={previewTask}
            value={answer}
            onChange={updateAnswer}
          />
        );
      }

      const count = questionType === "select" ? 2 : getTaskMcqCorrectCount(previewTask);
      const labels =
        questionType === "select"
          ? [0, 1].map(
              (index) =>
                `${String.fromCharCode(65 + index)}) ${
                  previewTask.subquestions?.[index]?.text || `Қосымша сұрақ ${index + 1}`
                }`
            )
          : [];
      return (
        <StudentWrittenAnswerFields
          value={answer}
          onChange={updateAnswer}
          count={count}
          labels={labels}
        />
      );
    }

    return <StudentWrittenAnswerFields value={answer} onChange={updateAnswer} />;
  };

  return (
    <section className={`rounded-2xl border border-purple-200 bg-purple-50/70 p-4 ${className}`.trim()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900">Оқушы көрінісі</h3>
          <p className="text-xs text-gray-600">Өзгерістер сақтамай-ақ бірден көрсетіледі</p>
        </div>
        <div className="flex rounded-lg border border-gray-300 bg-white p-1" aria-label="Алдын ала қарау өлшемі">
          {[
            { value: "mobile", label: "Телефон" },
            { value: "desktop", label: "Компьютер" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setViewport(option.value as PreviewViewport)}
              aria-pressed={viewport === option.value}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewport === option.value
                  ? "bg-purple-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        data-testid="student-task-preview-viewport"
        data-viewport={viewport}
        className={`mx-auto transition-[max-width] ${viewport === "mobile" ? "max-w-[390px]" : "max-w-4xl"}`}
      >
        <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-lg">
          <div className="h-1.5 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-500" />
          <div className="space-y-4 p-4 sm:p-6">
            <div
              className={`min-w-0 break-words font-semibold text-gray-900 ${getTaskTextScaleClass(
                normalizeTaskTextScale(previewTask.text_scale)
              )}`}
            >
              {previewTask.text ? (
                <MathRender latex={previewTask.text} />
              ) : (
                <span className="text-gray-400">Тапсырма мәтіні осы жерде көрсетіледі</span>
              )}
            </div>

            {resolvedImageSrc && (
              <Image
                src={resolvedImageSrc}
                alt="Тапсырма"
                width={1280}
                height={720}
                unoptimized
                className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200 object-contain"
              />
            )}

            {renderAnswerFields()}

            <div className="border-t border-gray-100 pt-4">
              {feedback && (
                <div
                  role="status"
                  className={`mb-3 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    feedback.kind === "correct"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : feedback.kind === "incorrect"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  {feedback.message}
                </div>
              )}
              <div className="flex justify-end">
              <button
                type="button"
                onClick={checkAnswer}
                disabled={!answerComplete || checking}
                className="rounded-lg bg-purple-600 px-5 py-2.5 font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {checking ? "Тексерілуде..." : "Жауапты тексеру"}
              </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
