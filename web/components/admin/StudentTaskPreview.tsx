"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import StudentChoiceAnswerFields from "@/components/student/StudentChoiceAnswerFields";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import StudentWrittenAnswerFields from "@/components/student/StudentWrittenAnswerFields";
import TaskStatement from "@/components/student/TaskStatement";
import { checkAdminTaskAnswerPreview } from "@/lib/api";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { getTaskMcqCorrectCount } from "@/lib/question-options";
import {
  MAX_TASK_FONT_SIZE,
  MIN_TASK_FONT_SIZE,
  WORD_FONT_SIZES,
  formatTaskTextScalePair,
  getTaskFontSizes,
  getTaskTextScaleFontSizePx,
  normalizeTaskTextScale,
} from "@/lib/task-text-scale";
import { isTrialTaskAnswerComplete } from "@/lib/trial-test-answer";
import type { LessonTask, TaskTextScale } from "@/types";

interface StudentTaskPreviewProps {
  task: Partial<LessonTask>;
  imageSrc?: string | null;
  className?: string;
  onTextScaleChange?: (scale: TaskTextScale) => void;
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
  text_scale: normalizeTaskTextScale(task.text_scale),
  options: Array.isArray(task.options) ? task.options : [],
  subquestions: Array.isArray(task.subquestions) ? task.subquestions : [],
  image_filename: task.image_filename || null,
  sort_order: task.sort_order ?? 0,
});

export default function StudentTaskPreview({
  task,
  imageSrc,
  className = "",
  onTextScaleChange,
}: StudentTaskPreviewProps) {
  const [viewport, setViewport] = useState<PreviewViewport>("mobile");
  const [localTextScale, setLocalTextScale] = useState<TaskTextScale>(() =>
    normalizeTaskTextScale(task.text_scale)
  );
  const [fontSizeDraft, setFontSizeDraft] = useState<string>(() =>
    String(getTaskTextScaleFontSizePx(normalizeTaskTextScale(task.text_scale), "mobile"))
  );
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<PreviewFeedback | null>(null);
  const checkRequestId = useRef(0);

  useEffect(() => {
    setLocalTextScale(normalizeTaskTextScale(task.text_scale));
  }, [task.text_scale]);

  useEffect(() => {
    setFontSizeDraft(String(getTaskTextScaleFontSizePx(localTextScale, viewport)));
  }, [localTextScale, viewport]);

  const applyFontSizeForViewport = (nextPx: number, targetViewport: PreviewViewport = viewport) => {
    const currentSizes = getTaskFontSizes(localTextScale);
    const clamped = Math.min(MAX_TASK_FONT_SIZE, Math.max(MIN_TASK_FONT_SIZE, Math.round(nextPx)));
    const nextScale =
      targetViewport === "mobile"
        ? formatTaskTextScalePair(clamped, currentSizes.desktop)
        : formatTaskTextScalePair(currentSizes.mobile, clamped);
    setLocalTextScale(nextScale);
    setFontSizeDraft(String(clamped));
    onTextScaleChange?.(nextScale);
  };

  const previewTask = useMemo(
    () => asPreviewTask({ ...task, text_scale: localTextScale }),
    [task, localTextScale]
  );
  const activeViewportFontSize = getTaskTextScaleFontSizePx(previewTask.text_scale, viewport);
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white p-1" aria-label="Қаріп өлшемі">
            <span className="px-1.5 text-[11px] font-semibold text-purple-700">
              {viewport === "mobile" ? "Тел:" : "Комп:"}
            </span>
            <button
              type="button"
              onClick={() => applyFontSizeForViewport(activeViewportFontSize - 1)}
              disabled={activeViewportFontSize <= MIN_TASK_FONT_SIZE}
              aria-label="Қаріп өлшемін кішірейту"
              className="rounded-md px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Қаріп өлшемі (px)"
              value={fontSizeDraft}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, "");
                setFontSizeDraft(raw);
                const parsed = Number(raw);
                if (raw !== "" && Number.isFinite(parsed) && parsed >= MIN_TASK_FONT_SIZE && parsed <= MAX_TASK_FONT_SIZE) {
                  applyFontSizeForViewport(parsed);
                }
              }}
              onBlur={() => {
                const parsed = Number(fontSizeDraft);
                if (Number.isFinite(parsed) && fontSizeDraft.trim() !== "") {
                  applyFontSizeForViewport(parsed);
                } else {
                  setFontSizeDraft(String(activeViewportFontSize));
                }
              }}
              className="w-12 rounded-md border border-gray-200 px-2 py-1 text-center text-xs font-bold text-gray-900 focus:border-purple-500 focus:outline-none"
            />
            <select
              aria-label="Стандартты қаріп өлшемдері"
              value={
                WORD_FONT_SIZES.includes(activeViewportFontSize as (typeof WORD_FONT_SIZES)[number])
                  ? String(activeViewportFontSize)
                  : ""
              }
              onChange={(e) => {
                if (e.target.value) {
                  applyFontSizeForViewport(Number(e.target.value));
                }
              }}
              className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:border-purple-500 focus:outline-none"
            >
              {!WORD_FONT_SIZES.includes(activeViewportFontSize as (typeof WORD_FONT_SIZES)[number]) && (
                <option value="">{activeViewportFontSize} px</option>
              )}
              {WORD_FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => applyFontSizeForViewport(activeViewportFontSize + 1)}
              disabled={activeViewportFontSize >= MAX_TASK_FONT_SIZE}
              aria-label="Қаріп өлшемін үлкейту"
              className="rounded-md px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-40"
            >
              +
            </button>
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
      </div>

      <div
        data-testid="student-task-preview-viewport"
        data-viewport={viewport}
        className={`mx-auto transition-[max-width] ${viewport === "mobile" ? "max-w-[390px]" : "max-w-4xl"}`}
      >
        <div className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-white shadow-lg">
          <div className="h-1.5 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-500" />
          <div className="space-y-4 p-4 sm:p-6">
            <TaskStatement task={previewTask} imageSrc={imageSrc} viewport={viewport} />

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
