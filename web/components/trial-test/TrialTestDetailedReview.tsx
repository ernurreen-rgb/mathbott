"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import MathRender from "@/components/ui/MathRender";
import { apiPath } from "@/lib/api";
import { normalizeFactorGridRows, parseFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { TrialTestDetails } from "@/types";

type QuestionType = "input" | "tf" | "mcq" | "mcq6" | "select" | "factor_grid";
type AccentColor = "purple" | "red" | "blue" | "neutral";

export type TrialTestReviewAnswer = {
  answer?: string;
  correct?: boolean;
  correct_answer?: string;
};

type TrialTestDetailedReviewProps = {
  tasks: TrialTestDetails["tasks"];
  answers?: Record<number, TrialTestReviewAnswer> | null;
  title?: string;
  accentColor?: AccentColor;
  emptyStateLabel?: string;
  defaultTaskIndex?: number;
  className?: string;
};

const parseSelectAnswerPair = (value?: string): [string, string] => {
  if (!value) return ["", ""];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return [String(parsed[0] || ""), String(parsed[1] || "")];
    }
  } catch {
    // Ignore malformed historic payloads.
  }
  return ["", ""];
};

const getSelectedTaskButtonClass = (accentColor: AccentColor, isActive: boolean): string => {
  if (!isActive) {
    return "bg-white/90 border-gray-200 text-gray-800 hover:border-purple-300";
  }
  if (accentColor === "red") return "bg-red-600 border-red-700 text-white";
  if (accentColor === "blue") return "bg-blue-600 border-blue-700 text-white";
  if (accentColor === "neutral") return "bg-gray-700 border-gray-800 text-white";
  return "bg-purple-600 border-purple-700 text-white";
};

const renderMathOrText = (value: string, emptyLabel = "Жауап берілмеді") => {
  if (!value) return <span>{emptyLabel}</span>;
  return <MathRender inline latex={value} />;
};

const renderFactorGridCell = (cell: string) => {
  const trimmed = cell.trim();
  if (!trimmed) {
    return <span className="text-gray-400">-</span>;
  }

  const looksSimple = /^[a-z0-9+\-*/=().\s]+$/i.test(trimmed);
  if (looksSimple) {
    return <span className="text-gray-900 font-semibold">{trimmed}</span>;
  }

  return <MathRender inline latex={trimmed} className="text-gray-900 font-semibold" />;
};

const renderFactorGrid = (value: string, tone: "neutral" | "success" | "error") => {
  const cells = parseFactorGridAnswer(value);
  const palette =
    tone === "success"
      ? "border-green-400 bg-green-50"
      : tone === "error"
      ? "border-red-400 bg-red-50"
      : "border-gray-200 bg-white/80";

  return (
    <div className="grid grid-cols-2 gap-2">
      {cells.map((cell, idx) => (
        <div key={`${tone}-${idx}`} className={`rounded-lg border p-2 ${palette}`}>
          <div className="min-h-6 text-gray-900">{renderFactorGridCell(cell)}</div>
        </div>
      ))}
    </div>
  );
};

const isFactorGridEquivalent = (left: string, right: string) => {
  if (!left || !right) return false;
  return (
    JSON.stringify(normalizeFactorGridRows(parseFactorGridAnswer(left))) ===
    JSON.stringify(normalizeFactorGridRows(parseFactorGridAnswer(right)))
  );
};

export const isReviewResultActuallyCorrect = (
  task: TrialTestDetails["tasks"][number],
  result?: TrialTestReviewAnswer | null
) => {
  const storedIsCorrect = result?.correct ?? false;
  if (storedIsCorrect) return true;
  if ((task.question_type || "input") !== "factor_grid") return false;
  return isFactorGridEquivalent(result?.answer ?? "", result?.correct_answer ?? "");
};

const renderSelectChoice = (
  options: NonNullable<TrialTestDetails["tasks"][number]["options"]>,
  label: string
) => {
  const upper = label.trim().toUpperCase();
  if (!upper) return <span>Жауап берілмеді</span>;
  const option = options.find((item) => (item.label || "").trim().toUpperCase() === upper);
  if (!option) return <span>{upper}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold">{option.label}</span>
      <MathRender inline latex={option.text} />
    </span>
  );
};

export default function TrialTestDetailedReview({
  tasks,
  answers,
  title,
  accentColor = "purple",
  emptyStateLabel = "Тапсырмалар табылмады",
  defaultTaskIndex = 0,
  className = "",
}: TrialTestDetailedReviewProps) {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(defaultTaskIndex);

  useEffect(() => {
    setCurrentTaskIndex(defaultTaskIndex);
  }, [defaultTaskIndex, tasks]);

  useEffect(() => {
    if (tasks.length === 0) {
      setCurrentTaskIndex(0);
      return;
    }
    setCurrentTaskIndex((prev) => Math.min(Math.max(prev, 0), tasks.length - 1));
  }, [tasks.length]);

  const safeAnswers = useMemo(() => answers || {}, [answers]);
  const task = tasks[currentTaskIndex];

  if (!tasks.length) {
    return (
      <div className={`rounded-xl border border-dashed border-gray-300 bg-white/50 p-4 text-sm text-gray-600 ${className}`}>
        {emptyStateLabel}
      </div>
    );
  }

  if (!task) {
    return null;
  }

  const result = safeAnswers[task.id];
  const resultAnswer = result && typeof result === "object" ? result : undefined;
  const userAnswerRaw = resultAnswer?.answer ?? "";
  const userAnswer = userAnswerRaw || "Жауап берілмеді";
  const correctAnswer = resultAnswer?.correct_answer ?? task.answer ?? "";
  const qt: QuestionType = (task.question_type || "input") as QuestionType;
  const isCorrect = isReviewResultActuallyCorrect(task, resultAnswer);
  const userUpper = String(userAnswerRaw).trim().toUpperCase();
  const correctUpper = String(correctAnswer).trim().toUpperCase();

  const renderAnswerBlock = () => {
    if (qt === "mcq" || qt === "mcq6") {
      const options = task.options || [];
      return (
        <div className="grid grid-cols-1 gap-2 mt-2">
          {options.map((option) => {
            const labelUpper = (option.label || "").trim().toUpperCase();
            const isUserChoice = labelUpper === userUpper;
            const isCorrectOption = labelUpper === correctUpper;
            let style = "bg-gray-50 border-gray-200";
            if (isUserChoice && isCorrect) style = "bg-green-100 border-green-500";
            else if (isUserChoice && !isCorrect) style = "bg-red-100 border-red-500";
            else if (!isCorrect && isCorrectOption) style = "bg-green-100 border-green-400";

            return (
              <div key={option.label} className={`border-2 rounded-lg p-3 text-left ${style}`}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                  <span className="font-bold text-gray-900 shrink-0">{option.label}</span>
                  <div className="min-w-0 break-words whitespace-normal">
                    <MathRender inline latex={option.text} className="text-gray-700" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "tf") {
      const options = [
        { label: "Дұрыс", value: "true" },
        { label: "Жалған", value: "false" },
      ];
      return (
        <div className="flex gap-2 mt-2">
          {options.map((option) => {
            const isUserChoice = userAnswerRaw === option.value || userUpper === option.value.toUpperCase();
            const isCorrectOption = correctAnswer === option.value || correctUpper === option.value.toUpperCase();
            let style = "flex-1 border-2 rounded-lg p-3 text-center font-bold border-gray-200 bg-gray-50";
            if (isUserChoice && isCorrect) {
              style = "flex-1 border-2 border-green-500 rounded-lg p-3 text-center font-bold bg-green-100 text-green-800";
            } else if (isUserChoice && !isCorrect) {
              style = "flex-1 border-2 border-red-500 rounded-lg p-3 text-center font-bold bg-red-100 text-red-800";
            } else if (!isCorrect && isCorrectOption) {
              style = "flex-1 border-2 border-green-400 rounded-lg p-3 text-center font-bold bg-green-100 text-green-800";
            }
            return (
              <div key={option.value} className={style}>
                {option.label}
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "select") {
      const options = task.options || [];
      const subquestions = task.subquestions || [];
      const userChoices = parseSelectAnswerPair(userAnswerRaw);
      const correctChoices = parseSelectAnswerPair(correctAnswer);

      return (
        <div className="mt-2 space-y-3">
          {[0, 1].map((index) => {
            const subquestion = subquestions[index];
            const userChoice = userChoices[index];
            const correctChoice = correctChoices[index];
            const rowCorrect =
              userChoice.trim().toUpperCase() &&
              userChoice.trim().toUpperCase() === correctChoice.trim().toUpperCase();

            return (
              <div key={`select-${task.id}-${index}`} className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  {String.fromCharCode(65 + index)}.{" "}
                  {subquestion?.text ? <MathRender inline latex={subquestion.text} /> : `${index + 1}-сұрақ`}
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-gray-700">Жауабыңыз: </span>
                  <span className={rowCorrect ? "text-green-700" : "text-red-700"}>
                    {renderSelectChoice(options, userChoice)}
                  </span>
                </div>
                {!rowCorrect && correctChoice && (
                  <div className="text-sm mt-1">
                    <span className="font-semibold text-gray-700">Дұрыс жауап: </span>
                    <span className="text-green-700">{renderSelectChoice(options, correctChoice)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "factor_grid") {
      return (
        <div className="mt-2 space-y-3">
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Жауабыңыз</div>
            {renderFactorGrid(userAnswerRaw, isCorrect ? "success" : "error")}
          </div>
          {!isCorrect && correctAnswer && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Дұрыс жауап</div>
              {renderFactorGrid(correctAnswer, "success")}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-1">
        <div
          className={`rounded-lg p-3 border-2 ${
            isCorrect ? "bg-green-100 border-green-500 text-green-800" : "bg-red-100 border-red-500 text-red-800"
          }`}
        >
          <span className="font-semibold">Жауабыңыз: </span>
          {renderMathOrText(userAnswerRaw, userAnswer)}
        </div>
        {!isCorrect && correctAnswer && (
          <div className="rounded-lg p-3 border-2 bg-green-100 border-green-400 text-green-800">
            <span className="font-semibold">Дұрыс жауап: </span>
            {renderMathOrText(correctAnswer)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {title && <h2 className="text-xl font-bold text-gray-900">{title}</h2>}

      <div className="flex flex-wrap gap-2 justify-center">
        {tasks.map((_, index) => (
          <button
            key={`review-nav-${index}`}
            type="button"
            onClick={() => setCurrentTaskIndex(index)}
            className={`w-11 h-11 rounded-xl font-bold text-lg border-2 transition-colors ${getSelectedTaskButtonClass(
              accentColor,
              currentTaskIndex === index
            )}`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      <div
        key={`review-task-${task.id}`}
        className={`bg-white/70 rounded-xl p-4 border-2 ${isCorrect ? "border-green-300" : "border-red-300"}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className={`font-semibold text-gray-900 min-w-0 max-w-full break-words ${getTaskTextScaleClass(normalizeTaskTextScale(task.text_scale))}`}>
              Тапсырма {currentTaskIndex + 1}:{" "}
              {task.text ? <MathRender inline latex={task.text} /> : "Мәтіні жоқ есеп"}
            </div>
          </div>
          <div className={`text-2xl ${isCorrect ? "text-green-600" : "text-red-600"}`}>{isCorrect ? "OK" : "X"}</div>
        </div>

        {task.image_filename && (
          <div className="mb-2">
            <Image
              src={apiPath(`images/${task.image_filename}`)}
              alt="Task"
              width={1280}
              height={720}
              unoptimized
              className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200"
            />
          </div>
        )}

        {renderAnswerBlock()}
      </div>
    </div>
  );
}

