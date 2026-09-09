"use client";

import MathRender from "@/components/ui/MathRender";
import {
  getTaskMcqCorrectCount,
  parseMcqAnswerLabels,
  toggleMcqAnswerLabel,
  type McqOptionLabel,
} from "@/lib/question-options";
import type { LessonTask } from "@/types";

interface StudentChoiceAnswerFieldsProps {
  task: LessonTask;
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const parseSelectAnswer = (value?: string): string[] => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? [String(parsed[0] || ""), String(parsed[1] || "")] : ["", ""];
  } catch {
    return ["", ""];
  }
};

export default function StudentChoiceAnswerFields({
  task,
  value,
  onChange,
  disabled = false,
}: StudentChoiceAnswerFieldsProps) {
  const options = task.options || [];

  if (task.question_type === "select") {
    const selected = parseSelectAnswer(value);
    return (
      <div className="space-y-4">
        {[0, 1].map((index) => (
          <div key={`${task.id}-select-${index}`} className="space-y-2">
            <div className="font-semibold text-gray-800">
              {String.fromCharCode(65 + index)}){" "}
              <MathRender inline latex={task.subquestions?.[index]?.text || `Қосымша сұрақ ${index + 1}`} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const isSelected = selected[index] === option.label;
                return (
                  <button
                    key={`${task.id}-${index}-${option.label}`}
                    type="button"
                    disabled={disabled}
                    aria-pressed={isSelected}
                    onClick={() => {
                      const next = [...selected];
                      next[index] = option.label;
                      onChange(JSON.stringify(next));
                    }}
                    className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                      isSelected
                        ? "border-purple-700 bg-purple-600 text-white"
                        : "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                    }`}
                  >
                    <span className="mr-2 font-bold">{option.label}</span>
                    <MathRender inline latex={option.text} className={isSelected ? "text-white" : "text-gray-700"} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const requiredCount = getTaskMcqCorrectCount(task);
  const selectedLabels = parseMcqAnswerLabels(value);
  return (
    <div className="space-y-2">
      {requiredCount > 1 && <p className="text-sm text-gray-600">{requiredCount} жауап таңдаңыз</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const label = option.label.toUpperCase() as McqOptionLabel;
          const isSelected = selectedLabels.includes(label);
          return (
            <button
              key={`${task.id}-${option.label}`}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => onChange(toggleMcqAnswerLabel(value, label, requiredCount))}
              className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                isSelected
                  ? "border-purple-700 bg-purple-600 text-white"
                  : "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50"
              }`}
            >
              <span className="mr-2 font-bold">{option.label}</span>
              <MathRender inline latex={option.text} className={isSelected ? "text-white" : "text-gray-700"} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
