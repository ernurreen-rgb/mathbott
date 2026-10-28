"use client";

import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
  getMcqEditorLabels,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { getTaskTextScaleClass } from "@/lib/task-text-scale";
import { AnswerMode } from "@/types";
import type { Dispatch, SetStateAction } from "react";
import type { EditTaskFormState } from "./model";
import { TASK_TEXT_SCALE_OPTIONS } from "./model";
import styles from "../CmsWorkspace.module.css";

type Props = {
  updateMiniLessonTask: (e: React.FormEvent) => Promise<void>;
  handlePasteImageEdit: (e: React.ClipboardEvent) => void;
  editTaskForm: EditTaskFormState;
  setEditTaskForm: Dispatch<SetStateAction<EditTaskFormState>>;
  editHasLinkedBankTask: boolean;
  setEditTaskAnswerMode: Dispatch<SetStateAction<AnswerMode>>;
  editTaskAnswerMode: AnswerMode;
  cancelEditMiniLessonTask: () => void;
};

export default function EditTaskForm({
  updateMiniLessonTask,
  handlePasteImageEdit,
  editTaskForm,
  setEditTaskForm,
  editHasLinkedBankTask,
  setEditTaskAnswerMode,
  editTaskAnswerMode,
  cancelEditMiniLessonTask,
}: Props) {
  return (
    <>
      <form onSubmit={updateMiniLessonTask} onPaste={handlePasteImageEdit} className={`${styles.taskForm} space-y-3`}>
        <MathFieldInput
          value={editTaskForm.text}
          onChange={(text) => setEditTaskForm((prev) => ({ ...prev, text }))}
          className={styles.taskTextInput}
          ariaLabel="Тапсырма мәтіні"
          placeholder={String.raw`\text{Тапсырма мәтіні}`}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={editTaskForm.bank_task_id ?? ""}
            className="p-2 rounded border text-sm bg-gray-100 text-gray-600"
            placeholder="БАНК тапсырма ID"
            readOnly
          />
          <select
            value={editTaskForm.bank_difficulty}
            onChange={(e) => setEditTaskForm({ ...editTaskForm, bank_difficulty: e.target.value as any })}
            className="p-2 rounded border text-sm disabled:bg-gray-100 disabled:text-gray-500"
            disabled={!editHasLinkedBankTask}
          >
            <option value="A">A (оңай)</option>
            <option value="B">B (орташа)</option>
            <option value="C">C (қиын)</option>
          </select>
          <input
            value={editTaskForm.bank_topics_raw}
            onChange={(e) => setEditTaskForm({ ...editTaskForm, bank_topics_raw: e.target.value })}
            className="p-2 rounded border text-sm disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="Тақырыптар (үтір арқылы)"
            disabled={!editHasLinkedBankTask}
          />
        </div>
        {!editHasLinkedBankTask && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            ����-��� ��������� ��? ��� ��������: ������������ ����������� ?�����.
          </div>
        )}
        <div className={styles.taskSettings}>
          <div className={styles.field}>Мәтін өлшемі</div>
          <div className="mt-2 flex gap-2">
            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
              const active = editTaskForm.text_scale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEditTaskForm({ ...editTaskForm, text_scale: option.value })}
                  aria-pressed={active}
                  className={`${styles.choiceButton} ${active ? styles.choiceButtonActive : ""}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {editTaskForm.text.trim() && (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <div
                className={`text-gray-900 ${getTaskTextScaleClass(editTaskForm.text_scale)}`}
              >
                <MathRender latex={editTaskForm.text} />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={editTaskForm.question_type}
            aria-label="Тапсырма түрі"
            onChange={(e) => {
              const questionType = e.target.value as any;
              setEditTaskForm({ ...editTaskForm, question_type: questionType, correctOptions: editTaskForm.correctOptions.filter((label) => getMcqEditorLabels(questionType).includes(label)) });
              setEditTaskAnswerMode(getTaskAnswerMode({ question_type: questionType }));
            }}
            className="p-2 rounded border text-sm"
          >
            <option value="input">Енгізу</option>
            <option value="tf">Ш/Ж</option>
            <option value="mcq">Көп таңдаулы (4 жауап)</option>
            <option value="mcq6">Көп таңдаулы (6 жауап)</option>
            <option value="select">Сәйкестендіру</option>
          </select>
          {supportsAnswerModeSwitch(editTaskForm.question_type) && (
            <select
              value={editTaskAnswerMode}
              onChange={(e) => setEditTaskAnswerMode(e.target.value as AnswerMode)}
              className="p-2 rounded border text-sm"
              aria-label="Оқушының жауап беру тәсілі"
            >
              <option value="choices">Нұсқаларды таңдайды</option>
              <option value="written">Жауапты өзі жазады</option>
            </select>
          )}
          <input
            type="number"
            value={editTaskForm.sort_order}
            onChange={(e) => setEditTaskForm({ ...editTaskForm, sort_order: parseInt(e.target.value) || 0 })}
            className="p-2 rounded border text-sm"
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setEditTaskForm({ ...editTaskForm, imageFile: e.target.files?.[0] || null })}
            className="p-2 rounded border text-sm"
          />
          {editTaskForm.question_type === "tf" ? (
            <select
              value={editTaskForm.correctTf}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, correctTf: e.target.value as any })}
              className="p-2 rounded border text-sm"
            >
              <option value="true">Дұрыс</option>
              <option value="false">Жалған</option>
            </select>
          ) : editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6" ? (
            <div className="flex flex-wrap gap-2">
              {MCQ_OPTION_LABELS.slice(0, editTaskForm.question_type === "mcq6" ? 6 : 4).map((label) => {
                const isSelected = editTaskForm.correctOptions.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setEditTaskForm((prev) => {
                        if (prev.correctOptions.includes(label) && prev.correctOptions.length <= 1) return prev;
                        return {
                          ...prev,
                          correctOptions: parseMcqAnswerLabels(
                            toggleMcqAnswerLabel(
                              serializeMcqAnswerLabels(prev.correctOptions),
                              label,
                              MAX_MCQ_CORRECT_OPTIONS
                            )
                          ),
                        };
                      })
                    }
                    aria-pressed={isSelected}
                    className={`${styles.choiceButton} ${isSelected ? styles.choiceButtonActive : ""}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <MathFieldInput
              value={editTaskForm.answer}
              onChange={(answer) => setEditTaskForm((prev) => ({ ...prev, answer }))}
              ariaLabel="Дұрыс жауап"
              placeholder={String.raw`\text{Дұрыс жауап}`}
              defaultMode="math"
              smartMode={false}
            />
          )}
        </div>

        {editTaskForm.question_type === "input" && (
          <AcceptedAnswersEditor
            value={editTaskForm.accepted_answers}
            onChange={(accepted_answers) =>
              setEditTaskForm((prev) => ({ ...prev, accepted_answers }))
            }
          />
        )}

        {(editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6" || editTaskForm.question_type === "select") && (
          <div className="grid grid-cols-1 gap-2">
            <MathFieldInput
              value={editTaskForm.optionA}
              onChange={(optionA) => setEditTaskForm((prev) => ({ ...prev, optionA }))}
              ariaLabel="A жауап нұсқасы"
              placeholder="A"
            />
            <MathFieldInput
              value={editTaskForm.optionB}
              onChange={(optionB) => setEditTaskForm((prev) => ({ ...prev, optionB }))}
              ariaLabel="B жауап нұсқасы"
              placeholder="B"
            />
            <MathFieldInput
              value={editTaskForm.optionC}
              onChange={(optionC) => setEditTaskForm((prev) => ({ ...prev, optionC }))}
              ariaLabel="C жауап нұсқасы"
              placeholder="C"
            />
            <MathFieldInput
              value={editTaskForm.optionD}
              onChange={(optionD) => setEditTaskForm((prev) => ({ ...prev, optionD }))}
              ariaLabel="D жауап нұсқасы"
              placeholder="D"
            />
            {editTaskForm.question_type === "mcq6" && (
              <>
                <MathFieldInput
                  value={editTaskForm.optionE}
                  onChange={(optionE) => setEditTaskForm((prev) => ({ ...prev, optionE }))}
                  ariaLabel="E жауап нұсқасы"
                  placeholder="E"
                />
                <MathFieldInput
                  value={editTaskForm.optionF}
                  onChange={(optionF) => setEditTaskForm((prev) => ({ ...prev, optionF }))}
                  ariaLabel="F жауап нұсқасы"
                  placeholder="F"
                />
              </>
            )}
          </div>
        )}

        {editTaskForm.question_type === "select" && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <MathFieldInput
                value={editTaskForm.subQuestion1}
                onChange={(subQuestion1) => setEditTaskForm((prev) => ({ ...prev, subQuestion1 }))}
                ariaLabel="1-қосымша сұрақ"
                placeholder={String.raw`\text{1-қосымша сұрақ}`}
              />
              <select
                value={editTaskForm.correctSub1}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, correctSub1: e.target.value as any })}
                className="p-2 rounded border text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <MathFieldInput
                value={editTaskForm.subQuestion2}
                onChange={(subQuestion2) => setEditTaskForm((prev) => ({ ...prev, subQuestion2 }))}
                ariaLabel="2-қосымша сұрақ"
                placeholder={String.raw`\text{2-қосымша сұрақ}`}
              />
              <select
                value={editTaskForm.correctSub2}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, correctSub2: e.target.value as any })}
                className="p-2 rounded border text-sm"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            className={styles.primaryButton}
          >
            Сақтау
          </button>
          <button
            type="button"
            onClick={cancelEditMiniLessonTask}
            className={styles.secondaryButton}
          >
            Бас тарту
          </button>
        </div>
      </form>
    </>
  );
}
