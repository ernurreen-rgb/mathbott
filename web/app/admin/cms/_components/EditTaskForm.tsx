"use client";

import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import MathRender from "@/components/ui/MathRender";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { getTaskTextScaleClass } from "@/lib/task-text-scale";
import { AnswerMode } from "@/types";
import type { Dispatch, SetStateAction } from "react";
import type { EditTaskFormState } from "./model";
import { TASK_TEXT_SCALE_OPTIONS } from "./model";

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
      <form onSubmit={updateMiniLessonTask} onPaste={handlePasteImageEdit} className="space-y-2">
        <textarea
          value={editTaskForm.text}
          onChange={(e) => setEditTaskForm({ ...editTaskForm, text: e.target.value })}
          className="w-full p-2 rounded border text-sm"
          rows={3}
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
        <div className="rounded-lg border border-gray-200 bg-white/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Мәтін өлшемі</div>
          <div className="mt-2 flex gap-2">
            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
              const active = editTaskForm.text_scale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEditTaskForm({ ...editTaskForm, text_scale: option.value })}
                  className={`rounded-md px-3 py-1 text-sm font-semibold transition ${active
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-purple-300"
                    }`}
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
            onChange={(e) => {
              const questionType = e.target.value as any;
              setEditTaskForm({ ...editTaskForm, question_type: questionType });
              setEditTaskAnswerMode(getTaskAnswerMode({ question_type: questionType }));
            }}
            className="p-2 rounded border text-sm"
          >
            <option value="input">Енгізу</option>
            <option value="tf">Ш/Ж</option>
            <option value="mcq">MCQ (4)</option>
            <option value="mcq6">MCQ (6)</option>
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
                    className={`h-9 min-w-9 rounded border px-2 text-sm font-bold ${isSelected ? "border-purple-700 bg-purple-600 text-white" : "border-gray-300 bg-white text-gray-800"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              value={editTaskForm.answer}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, answer: e.target.value })}
              className="p-2 rounded border text-sm"
              placeholder="Жауап"
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
            <input
              value={editTaskForm.optionA}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionA: e.target.value })}
              className="p-2 rounded border text-sm"
              placeholder="A"
              required
            />
            <input
              value={editTaskForm.optionB}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionB: e.target.value })}
              className="p-2 rounded border text-sm"
              placeholder="B"
              required
            />
            <input
              value={editTaskForm.optionC}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionC: e.target.value })}
              className="p-2 rounded border text-sm"
              placeholder="C"
              required
            />
            <input
              value={editTaskForm.optionD}
              onChange={(e) => setEditTaskForm({ ...editTaskForm, optionD: e.target.value })}
              className="p-2 rounded border text-sm"
              placeholder="D"
              required
            />
            {editTaskForm.question_type === "mcq6" && (
              <>
                <input
                  value={editTaskForm.optionE}
                  onChange={(e) => setEditTaskForm({ ...editTaskForm, optionE: e.target.value })}
                  className="p-2 rounded border text-sm"
                  placeholder="E"
                  required
                />
                <input
                  value={editTaskForm.optionF}
                  onChange={(e) => setEditTaskForm({ ...editTaskForm, optionF: e.target.value })}
                  className="p-2 rounded border text-sm"
                  placeholder="F"
                  required
                />
              </>
            )}
          </div>
        )}

        {editTaskForm.question_type === "select" && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <input
                value={editTaskForm.subQuestion1}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, subQuestion1: e.target.value })}
                className="p-2 rounded border text-sm"
                placeholder="1-қосымша сұрақ"
                required
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
              <input
                value={editTaskForm.subQuestion2}
                onChange={(e) => setEditTaskForm({ ...editTaskForm, subQuestion2: e.target.value })}
                className="p-2 rounded border text-sm"
                placeholder="2-қосымша сұрақ"
                required
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
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={cancelEditMiniLessonTask}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
          >
            ✕
          </button>
        </div>
      </form>
    </>
  );
}
