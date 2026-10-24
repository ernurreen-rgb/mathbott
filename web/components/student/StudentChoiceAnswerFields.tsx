"use client";

import MathRender from "@/components/ui/MathRender";
import Icon from "@/components/ui/Icon";
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
  layout?: "grid" | "stack";
  isAnswered?: boolean;
  isCorrect?: boolean;
  correctAnswer?: string;
  selectedAnswer?: string;
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
  layout = "grid",
  isAnswered = false,
  isCorrect = false,
  correctAnswer,
  selectedAnswer,
}: StudentChoiceAnswerFieldsProps) {
  const options = task.options || [];
  const optionLayoutClass = layout === "stack"
    ? "grid grid-cols-1 gap-2"
    : "grid grid-cols-1 gap-2 sm:grid-cols-2";

  if (task.question_type === "select") {
    const effectiveSelectValue = value || selectedAnswer || "";
    const selected = parseSelectAnswer(effectiveSelectValue);
    const correctArr = parseSelectAnswer(
      correctAnswer || (isCorrect && effectiveSelectValue ? effectiveSelectValue : task.answer || "")
    );
    return (
      <div className="space-y-4">
        {[0, 1].map((index) => {
          const subqCorrect = task.subquestions?.[index]?.correct || correctArr[index];
          return (
            <div key={`${task.id}-select-${index}`} className="space-y-2">
              <div className="font-semibold text-gray-800">
                {String.fromCharCode(65 + index)}){" "}
                <MathRender inline latex={task.subquestions?.[index]?.text || `Қосымша сұрақ ${index + 1}`} />
              </div>
              <div className={optionLayoutClass}>
                {options.map((option) => {
                  const isSelected = selected[index] === option.label;
                  const isCorrectOption = Boolean(subqCorrect && subqCorrect.toUpperCase() === option.label.toUpperCase());

                  let buttonStyle = "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50";

                  if (isAnswered) {
                    if (isSelected && (isCorrect || isCorrectOption)) {
                      buttonStyle = "border-green-600 bg-green-500 text-white font-bold ring-2 ring-green-300 shadow-sm";
                    } else if (isSelected && !isCorrectOption && !isCorrect) {
                      buttonStyle = "border-red-600 bg-red-500 text-white font-bold ring-2 ring-red-300 shadow-sm";
                    } else if (!isSelected && isCorrectOption) {
                      buttonStyle = "border-green-500 bg-green-50 text-green-800 font-bold border-2 ring-1 ring-green-400";
                    } else {
                      buttonStyle = "border-gray-200 bg-gray-50/60 text-gray-400";
                    }
                  } else if (isSelected) {
                    buttonStyle = "border-purple-700 bg-purple-600 text-white";
                  }

                  return (
                    <button
                      key={`${task.id}-${index}-${option.label}`}
                      type="button"
                      disabled={disabled || isAnswered}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isAnswered) return;
                        const next = [...selected];
                        next[index] = option.label;
                        onChange(JSON.stringify(next));
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors flex items-center justify-between ${
                        disabled || isAnswered ? "cursor-default" : ""
                      } ${buttonStyle}`}
                    >
                      <div className="flex items-center">
                        <span className="mr-2 font-bold">{option.label}</span>
                        <MathRender
                          inline
                          latex={option.text}
                          className={
                            isAnswered
                              ? isSelected
                                ? "text-white"
                                : isCorrectOption
                                ? "text-green-800"
                                : "text-gray-400"
                              : isSelected
                              ? "text-white"
                              : "text-gray-700"
                          }
                        />
                      </div>
                      {isAnswered && isSelected && (isCorrect || isCorrectOption) && (
                        <Icon name="check" className="w-4 h-4 text-white shrink-0 ml-2" />
                      )}
                      {isAnswered && isSelected && !isCorrectOption && !isCorrect && (
                        <Icon name="close" className="w-4 h-4 text-white shrink-0 ml-2" />
                      )}
                      {isAnswered && !isSelected && isCorrectOption && (
                        <span className="text-xs text-green-700 font-bold shrink-0 ml-2 flex items-center gap-1">
                          <Icon name="check" className="w-3.5 h-3.5" /> Дұрыс
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const requiredCount = getTaskMcqCorrectCount(task);
  const effectiveSelected = value || selectedAnswer || "";
  const selectedLabels = parseMcqAnswerLabels(effectiveSelected);
  const effectiveCorrect =
    correctAnswer || (isCorrect && effectiveSelected ? effectiveSelected : task.answer || "");
  const correctLabels = parseMcqAnswerLabels(effectiveCorrect);

  return (
    <div className="space-y-2">
      {requiredCount > 1 && <p className="text-sm text-gray-600">{requiredCount} жауап таңдаңыз</p>}
      <div className={optionLayoutClass}>
        {options.map((option) => {
          const label = option.label.toUpperCase() as McqOptionLabel;
          const isSelected = selectedLabels.includes(label);
          const isCorrectOption = correctLabels.includes(label);

          let buttonStyle = "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50";

          if (isAnswered) {
            if (isSelected && (isCorrect || isCorrectOption)) {
              buttonStyle = "border-green-600 bg-green-500 text-white font-bold ring-2 ring-green-300 shadow-sm";
            } else if (isSelected && !isCorrectOption && !isCorrect) {
              buttonStyle = "border-red-600 bg-red-500 text-white font-bold ring-2 ring-red-300 shadow-sm";
            } else if (!isSelected && isCorrectOption) {
              buttonStyle = "border-green-500 bg-green-50 text-green-800 font-bold border-2 ring-1 ring-green-400";
            } else {
              buttonStyle = "border-gray-200 bg-gray-50/60 text-gray-400";
            }
          } else if (isSelected) {
            buttonStyle = "border-purple-700 bg-purple-600 text-white";
          }

          return (
            <button
              key={`${task.id}-${option.label}`}
              type="button"
              disabled={disabled || isAnswered}
              aria-pressed={isSelected}
              onClick={() => {
                if (isAnswered) return;
                onChange(toggleMcqAnswerLabel(value, label, requiredCount));
              }}
              className={`rounded-lg border p-3 text-left transition-colors flex items-center justify-between ${
                disabled || isAnswered ? "cursor-default" : ""
              } ${buttonStyle}`}
            >
              <div className="flex items-center">
                <span className="mr-2 font-bold">{option.label}</span>
                <MathRender
                  inline
                  latex={option.text}
                  className={
                    isAnswered
                      ? isSelected
                        ? "text-white"
                        : isCorrectOption
                        ? "text-green-800"
                        : "text-gray-400"
                      : isSelected
                      ? "text-white"
                      : "text-gray-700"
                  }
                />
              </div>
              {isAnswered && isSelected && (isCorrect || isCorrectOption) && (
                <Icon name="check" className="w-4 h-4 text-white shrink-0 ml-2" />
              )}
              {isAnswered && isSelected && !isCorrectOption && !isCorrect && (
                <Icon name="close" className="w-4 h-4 text-white shrink-0 ml-2" />
              )}
              {isAnswered && !isSelected && isCorrectOption && (
                <span className="text-xs text-green-700 font-bold shrink-0 ml-2 flex items-center gap-1">
                  <Icon name="check" className="w-3.5 h-3.5" /> Дұрыс
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
