"use client";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import { LessonTask, QuestionType } from "@/types";

type Props = {
  qt: QuestionType;
  taskData: Partial<LessonTask>;
  isEditing: boolean;
  editingField: string | null;
  updateTempTask: (updates: Partial<LessonTask>) => void;
  setEditingField: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function MatchingAnswerFields({ qt, taskData, isEditing, editingField, updateTempTask, setEditingField }: Props) {
  return (
    <>
      {qt === "select" && (
        <div className="space-y-3">
          {/* Options for select type */}
          <div className="mb-4">
            <div className="text-sm font-semibold text-gray-700 mb-2">Жауап нұсқалары:</div>
            <div className="grid grid-cols-1 gap-2">
              {["A", "B", "C", "D"].map((label) => {
                const option = taskData.options?.find((o: any) => o.label === label);
                const optionText = option?.text || "";
                const isEditingOption = isEditing && editingField === `select-option-${label}`;

                return (
                  <div key={label}>
                    {isEditingOption ? (
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
                        className="w-full border-2 border-purple-500 rounded px-2 py-1"
                        placeholder={`Нұсқа ${label}`}
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={() => {
                          if (isEditing) {
                            setEditingField(`select-option-${label}`);
                          }
                        }}
                        className={`border rounded px-2 py-1 text-sm ${isEditing ? "cursor-pointer hover:bg-gray-100 border-gray-300" : "border-gray-200"
                          }`}
                      >
                        <span className="font-bold">{label}:</span> {optionText ? (
                          <MathRender latex={optionText} inline />
                        ) : (
                          isEditing ? "Өңдеу үшін басыңыз" : ""
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subquestions */}
          {[0, 1].map((idx) => {
            const subquestion = taskData.subquestions?.[idx];
            const subText = subquestion?.text || "";
            const correctAnswer = subquestion?.correct || "A";
            const isEditingSub = isEditing && editingField === `subquestion-${idx}`;

            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-6 text-gray-700 font-semibold">{idx === 0 ? "A)" : "B)"}</div>
                <div className="flex-1">
                  {isEditingSub ? (
                    <div className="space-y-2">
                      <MathFieldInput
                        value={subText}
                        onChange={(value) => {
                          const newSubquestions = [...(taskData.subquestions || [])];
                          newSubquestions[idx] = { text: value, correct: correctAnswer };
                          updateTempTask({ subquestions: newSubquestions });
                        }}
                        onBlur={() => setEditingField(null)}
                        className="w-full border-2 border-purple-500 rounded-lg px-3 py-2"
                        placeholder="Қосымша сұрақ мәтіні"
                        autoFocus
                      />
                      <select
                        value={correctAnswer}
                        onChange={(e) => {
                          const newSubquestions = [...(taskData.subquestions || [])];
                          newSubquestions[idx] = { text: subText, correct: e.target.value };
                          updateTempTask({ subquestions: newSubquestions });
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <div
                        onClick={() => {
                          if (isEditing) {
                            setEditingField(`subquestion-${idx}`);
                          }
                        }}
                        className={`text-gray-900 mb-2 ${isEditing ? "cursor-pointer hover:bg-gray-100 rounded p-2" : ""
                          }`}
                      >
                        {subText ? (
                          <MathRender latex={subText} inline />
                        ) : (
                          isEditing ? "Қосымша сұрақты өңдеу үшін басыңыз" : ""
                        )}
                      </div>
                      <select
                        value={correctAnswer}
                        onChange={(e) => {
                          if (isEditing) {
                            const newSubquestions = [...(taskData.subquestions || [])];
                            newSubquestions[idx] = { text: subText, correct: e.target.value };
                            updateTempTask({ subquestions: newSubquestions });
                          }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white"
                        disabled={!isEditing}
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
