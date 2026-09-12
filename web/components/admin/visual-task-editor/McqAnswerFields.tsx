"use client";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
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
  return (
    <>
      {isMcqQuestionType(qt) && (
        <div className="grid grid-cols-1 gap-2">
          {(isEditing
            ? MCQ_OPTION_LABELS
            : (taskData.options || []).map((option: any) => option.label).filter(Boolean)
          ).map((label: string) => {
            const option = taskData.options?.find((o: any) => o.label === label);
            const optionText = option?.text || "";
            const correctLabels = parseMcqAnswerLabels(String(taskData.answer || ""));
            const isCorrect = correctLabels.includes(label as any);
            const isEditingOption = isEditing && editingField === `option-${label}`;
            const toggleCorrectAnswer = () => {
              const current = String(taskData.answer || "");
              if (isCorrect && correctLabels.length <= 1) return;
              updateTempTask({
                answer: toggleMcqAnswerLabel(current, label as any, MAX_MCQ_CORRECT_OPTIONS),
              });
            };

            return (
              <div key={label}>
                {isEditingOption ? (
                  <div className="border-2 border-purple-500 rounded-lg p-3 bg-white">
                    <div className="font-bold text-gray-900 mb-2">{label}</div>
                    <MathFieldInput
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
                      onBlur={() => setEditingField(null)}
                      className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
                      placeholder="Жауап нұсқасы"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        toggleCorrectAnswer();
                        setEditingField(null);
                      }}
                      className={`w-full text-xs px-2 py-1 rounded ${isCorrect
                        ? "bg-purple-600 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                    >
                      {isCorrect ? "✓ Дұрыс жауап" : "Дұрыс қылу"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (isEditing) {
                        if (editingField === null) {
                          setEditingField(`option-${label}`);
                        } else {
                          toggleCorrectAnswer();
                        }
                      }
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
                          isEditing ? "Өңдеу үшін басыңыз" : ""
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
