"use client";

import { useId, useRef } from "react";

import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  McqOptionLabel,
  getMcqEditorLabels,
  isMcqQuestionType,
  parseMcqAnswerLabels,
  toggleMcqAnswerLabel,
} from "@/lib/question-options";
import { LessonTask, QuestionType } from "@/types";

type Props = {
  qt: QuestionType;
  isEditing: boolean;
  taskData: Partial<LessonTask>;
  editingField: string | null;
  updateTempTask: (updates: Partial<LessonTask>) => void;
  setEditingField: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function McqAnswerFields({ qt, isEditing, taskData, editingField, updateTempTask, setEditingField }: Props) {
  const instructionsId = useId();
  const firstClick = useRef<{ label: string; answer: string } | null>(null);

  return (
    <>
      {isMcqQuestionType(qt) && (
        <div className="grid grid-cols-1 gap-2">
          {isEditing && <p id={instructionsId} className="mb-1 text-xs text-gray-500">
            Дұрыс жауапты бір рет басып белгілеңіз. Мәтінін өңдеу үшін екі рет басыңыз (F2).
            {" "}1–{MAX_MCQ_CORRECT_OPTIONS} дұрыс жауап таңдауға болады.
          </p>}
          {(isEditing
            ? getMcqEditorLabels(qt)
            : (taskData.options || []).map((option: any) => option.label).filter(Boolean)
          ).map((label: string) => {
            const option = taskData.options?.find((o: any) => o.label === label);
            const optionText = option?.text || "";
            const correctLabels = parseMcqAnswerLabels(String(taskData.answer || ""));
            const isCorrect = correctLabels.includes(label as McqOptionLabel);
            const isEditingOption = isEditing && editingField === `option-${label}`;
            const toggleCorrectAnswer = () => {
              const current = String(taskData.answer || "");
              updateTempTask({
                answer: toggleMcqAnswerLabel(current, label as McqOptionLabel, MAX_MCQ_CORRECT_OPTIONS),
              });
            };

            return (
              <div key={label}>
                {isEditingOption ? (
                  <div className="border-2 border-purple-500 rounded-lg p-3 bg-white">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-bold text-gray-900">{label}</span>
                      <button type="button" onClick={() => setEditingField(null)}
                        aria-label={`${label} нұсқасын өңдеуді аяқтау`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        Дайын
                      </button>
                    </div>
                    <MathFieldInput
                      ariaLabel={`${label} жауап нұсқасы`}
                      value={optionText}
                      onChange={(value) => {
                        const newOptions = [...(taskData.options || [])];
                        const existingIndex = newOptions.findIndex((o: any) => o.label === label);
                        if (existingIndex >= 0) {
                          newOptions[existingIndex] = { label, text: value };
                        } else {
                          newOptions.push({ label, text: value });
                        }
                        updateTempTask({ options: newOptions });
                      }}
                      className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
                      placeholder="Жауап нұсқасы"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-pressed={isEditing ? isCorrect : undefined}
                    aria-describedby={isEditing ? instructionsId : undefined}
                    aria-keyshortcuts={isEditing ? "F2" : undefined}
                    onClick={(event) => {
                      if (!isEditing || event.detail > 1) return;
                      firstClick.current = event.detail === 1 ? { label, answer: String(taskData.answer || "") } : null;
                      toggleCorrectAnswer();
                    }}
                    onDoubleClick={() => {
                      if (!isEditing) return;
                      // A double click also fires a first click; restore its selection before editing.
                      if (firstClick.current?.label === label) {
                        updateTempTask({ answer: firstClick.current.answer });
                      }
                      firstClick.current = null;
                      setEditingField(`option-${label}`);
                    }}
                    onKeyDown={(event) => {
                      if (!isEditing || event.key !== "F2") return;
                      event.preventDefault();
                      firstClick.current = null;
                      setEditingField(`option-${label}`);
                    }}
                    className={`text-left border-2 rounded-lg p-3 transition-colors w-full ${isCorrect
                      ? "bg-purple-600 border-purple-700 text-white"
                      : isEditing
                        ? "border-gray-200 hover:border-purple-300 hover:bg-purple-50 cursor-pointer"
                        : "border-gray-200"
                      }`}
                  >
                    <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 ${isCorrect ? "text-white" : "text-gray-700"}`}>
                      <span className={`font-bold shrink-0 ${isCorrect ? "text-white" : "text-gray-900"}`}>
                        {label}
                      </span>
                      <div className="min-w-0 break-words whitespace-normal">
                        {optionText ? (
                          <MathRender latex={optionText} inline className={isCorrect ? "text-white" : "text-gray-700"} />
                        ) : (
                          isEditing ? "Мәтінін енгізу үшін екі рет басыңыз" : ""
                        )}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
