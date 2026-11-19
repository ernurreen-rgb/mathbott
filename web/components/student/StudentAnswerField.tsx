"use client";

import StudentChoiceAnswerFields from "./StudentChoiceAnswerFields";
import StudentMathAnswerInput from "./StudentMathAnswerInput";
import StudentWrittenAnswerFields, { type WrittenAnswerLabel } from "./StudentWrittenAnswerFields";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { getTaskMcqCorrectCount } from "@/lib/question-options";
import type { LessonTask } from "@/types";

/** The checked answer: the controls lock and show what was right. */
export type StudentAnswerResult = {
  correct: boolean;
  /** The graded key; when the answer is correct, the student's own answer stands in for it. */
  correctAnswer?: string | null;
};

interface StudentAnswerFieldProps {
  task: LessonTask;
  value: string;
  onChange: (value: string) => void;
  /** Practice screens pass the checked result; the trial test and the admin preview never do. */
  result?: StudentAnswerResult | null;
  /** True/false is answered with one tap: given this, the tap also checks it (lesson, review). */
  onSubmit?: (value: string) => void;
  /** A check is running: the true/false buttons wait for it. */
  checking?: boolean;
}

const TF_CHOICES = [
  { value: "true", label: "Дұрыс", idle: "bg-green-600 hover:bg-green-700 text-white", focus: "focus:ring-green-500" },
  { value: "false", label: "Жалған", idle: "bg-red-600 hover:bg-red-700 text-white", focus: "focus:ring-red-500" },
] as const;

const normalizeTf = (value?: string | null) => {
  const normalized = value?.toLowerCase().trim();
  if (normalized === "true" || normalized === "1") return "true";
  if (normalized === "false" || normalized === "0") return "false";
  return "";
};

const selectLabels = (task: LessonTask): WrittenAnswerLabel[] =>
  [0, 1].map((index) => ({
    prefix: `${String.fromCharCode(65 + index)})`,
    text: task.subquestions?.[index]?.text || `Қосымша сұрақ ${index + 1}`,
  }));

/**
 * The answer controls of one task, picked by its type and answer mode. The lesson, the mistake
 * review, the trial test and the admin preview all use it, so a student sees the same field
 * everywhere and the admin preview shows exactly that.
 */
export default function StudentAnswerField({ task, value, onChange, result, onSubmit, checking = false }: StudentAnswerFieldProps) {
  const answered = !!result;
  const correct = !!result?.correct;
  const key = result ? result.correctAnswer || (correct ? value : "") : "";
  const questionType = task.question_type || "input";

  if (questionType === "tf") {
    const selected = normalizeTf(value);
    const keyTf = normalizeTf(key);
    // A tap that checks straight away shows no separate "selected" state before the result.
    const showSelection = !onSubmit;
    return (
      <div className="flex gap-2" role="group" aria-label="Жауап таңдау">
        {TF_CHOICES.map((choice) => {
          const isSelected = selected === choice.value;
          const isKey = keyTf === choice.value;
          const style = answered
            ? isSelected
              ? isKey ? "bg-green-600 text-white ring-2 ring-green-300 shadow-sm" : "bg-red-600 text-white ring-2 ring-red-300 shadow-sm"
              : isKey ? "bg-green-100 border-2 border-green-500 text-green-800" : "bg-gray-100 text-gray-400"
            : isSelected && showSelection
              ? "bg-purple-600 text-white ring-2 ring-purple-300"
              : choice.idle;
          return (
            <button
              key={choice.value}
              type="button"
              disabled={checking || answered}
              aria-label={`${choice.label} деп таңдау`}
              aria-pressed={isSelected && (answered || showSelection)}
              onClick={() => {
                onChange(choice.value);
                onSubmit?.(choice.value);
              }}
              className={`flex-1 rounded-lg px-3 py-2 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-default ${choice.focus} ${style}`}
            >
              {choice.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (questionType === "select" || questionType === "mcq" || questionType === "mcq6") {
    const isSelect = questionType === "select";
    const count = isSelect ? 2 : getTaskMcqCorrectCount(task);

    if (getTaskAnswerMode(task) === "choices") {
      return (
        <StudentChoiceAnswerFields
          task={task}
          value={value}
          onChange={onChange}
          disabled={answered || checking}
          isAnswered={answered}
          isCorrect={correct}
          correctAnswer={key || undefined}
          selectedAnswer={value}
        />
      );
    }

    return (
      <div className="space-y-3">
        {!isSelect && count > 1 && <p className="text-sm text-gray-600">{count} жауап жазыңыз</p>}
        <div className={answered ? `rounded-xl border p-1 ${correct ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}` : ""}>
          <StudentWrittenAnswerFields
            value={value}
            onChange={onChange}
            count={count}
            disabled={answered || checking}
            labels={isSelect ? selectLabels(task) : []}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={answered ? `rounded-xl p-0.5 ring-2 ${correct ? "bg-green-50 ring-green-500" : "bg-red-50 ring-red-500"}` : ""}>
      <StudentMathAnswerInput value={value} onChange={onChange} disabled={answered || checking} placeholder="Жауапты жазыңыз" />
    </div>
  );
}
