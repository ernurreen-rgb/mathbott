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
import type { CreateTaskFormState } from "./model";
import { TASK_TEXT_SCALE_OPTIONS } from "./model";

type Props = {
  createMiniLessonTask: (e: React.FormEvent) => Promise<void>;
  handlePasteImageCreate: (e: React.ClipboardEvent) => void;
  taskForm: CreateTaskFormState;
  setTaskForm: Dispatch<SetStateAction<CreateTaskFormState>>;
  createUsesBank: boolean;
  setTaskAnswerMode: Dispatch<SetStateAction<AnswerMode>>;
  taskAnswerMode: AnswerMode;
};

export default function CreateTaskForm({
  createMiniLessonTask,
  handlePasteImageCreate,
  taskForm,
  setTaskForm,
  createUsesBank,
  setTaskAnswerMode,
  taskAnswerMode,
}: Props) {
  return (
    <>
      <form onSubmit={createMiniLessonTask} onPaste={handlePasteImageCreate} className="space-y-3">
        <textarea
          value={taskForm.text}
          onChange={(e) => setTaskForm({ ...taskForm, text: e.target.value })}
          className="w-full p-3 rounded border resize-y min-h-[120px]"
          placeholder={createUsesBank ? "БАНК тапсырма ID арқылы жасалуда" : "Тапсырма мәтіні"}
          rows={6}
          disabled={createUsesBank}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={taskForm.bankTaskId}
            onChange={(e) => setTaskForm({ ...taskForm, bankTaskId: e.target.value })}
            className="p-2 rounded border"
            placeholder="БАНК тапсырма ID (міндетті емес)"
          />
          <select
            value={taskForm.bank_difficulty}
            onChange={(e) => setTaskForm({ ...taskForm, bank_difficulty: e.target.value as any })}
            className="p-2 rounded border disabled:bg-gray-100 disabled:text-gray-500"
            disabled={createUsesBank}
          >
            <option value="A">A (оңай)</option>
            <option value="B">B (орташа)</option>
            <option value="C">C (қиын)</option>
          </select>
          <input
            value={taskForm.bank_topics_raw}
            onChange={(e) => setTaskForm({ ...taskForm, bank_topics_raw: e.target.value })}
            className="p-2 rounded border disabled:bg-gray-100 disabled:text-gray-500"
            placeholder="Тақырыптар (үтір арқылы)"
            disabled={createUsesBank}
          />
        </div>
        {createUsesBank && (
          <div className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Бұл тек БАНК-тегі бар тапсырмаға сілтеме жасайды. Төмендегі мәтін/нұсқа өрістері еленбейді.
          </div>
        )}
        <div className="rounded-lg border border-gray-200 bg-white/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Мәтін өлшемі</div>
          <div className="mt-2 flex gap-2">
            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
              const active = taskForm.text_scale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTaskForm({ ...taskForm, text_scale: option.value })}
                  className={`rounded-md px-3 py-1 text-sm font-semibold transition ${active
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-purple-300"
                    }`}
                  disabled={createUsesBank}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {taskForm.text.trim() && !createUsesBank && (
            <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
              <div
                className={`text-gray-900 ${getTaskTextScaleClass(taskForm.text_scale)}`}
              >
                <MathRender latex={taskForm.text} />
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select
            value={taskForm.question_type}
            onChange={(e) => {
              const questionType = e.target.value as any;
              setTaskForm({ ...taskForm, question_type: questionType });
              setTaskAnswerMode(getTaskAnswerMode({ question_type: questionType }));
            }}
            className="p-2 rounded border"
          >
            <option value="input">Пайдаланушы жауап енгізеді</option>
            <option value="tf">Дұрыс / Жалған</option>
            <option value="mcq">Нұсқалар A/B/C/D</option>
            <option value="mcq6">Нұсқалар A/B/C/D/E/F</option>
            <option value="select">Тізімнен таңдау</option>
          </select>
          {!createUsesBank && supportsAnswerModeSwitch(taskForm.question_type) && (
            <select
              value={taskAnswerMode}
              onChange={(e) => setTaskAnswerMode(e.target.value as AnswerMode)}
              className="p-2 rounded border"
              aria-label="Оқушының жауап беру тәсілі"
            >
              <option value="choices">Нұсқаларды таңдайды</option>
              <option value="written">Жауапты өзі жазады</option>
            </select>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setTaskForm({ ...taskForm, imageFile: e.target.files?.[0] || null })}
            className="p-2 rounded border"
            disabled={createUsesBank}
          />
          <input
            type="number"
            value={taskForm.sort_order}
            onChange={(e) => setTaskForm({ ...taskForm, sort_order: parseInt(e.target.value) || 0 })}
            className="p-2 rounded border"
            placeholder="Қатар"
          />
          {createUsesBank ? (
            <div className="p-2 rounded border bg-gray-50 text-gray-600 text-sm">
              Жауап пен нұсқалар байланыстырылған БАНК тапсырмасынан алынады
            </div>
          ) : taskForm.question_type === "tf" ? (
            <select
              value={taskForm.correctTf}
              onChange={(e) => setTaskForm({ ...taskForm, correctTf: e.target.value as any })}
              className="p-2 rounded border"
            >
              <option value="true">Дұрыс</option>
              <option value="false">Қате</option>
            </select>
          ) : taskForm.question_type === "mcq" || taskForm.question_type === "mcq6" ? (
            <div className="flex flex-wrap gap-2">
              {MCQ_OPTION_LABELS.slice(0, taskForm.question_type === "mcq6" ? 6 : 4).map((label) => {
                const isSelected = taskForm.correctOptions.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      setTaskForm((prev) => {
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
              value={taskForm.answer}
              onChange={(e) => setTaskForm({ ...taskForm, answer: e.target.value })}
              className="p-2 rounded border"
              placeholder="Дұрыс жауап"
            />
          )}
        </div>

        {!createUsesBank && taskForm.question_type === "input" && (
          <AcceptedAnswersEditor
            value={taskForm.accepted_answers}
            onChange={(accepted_answers) => setTaskForm((prev) => ({ ...prev, accepted_answers }))}
          />
        )}

        {!createUsesBank && (taskForm.question_type === "mcq" || taskForm.question_type === "mcq6" || taskForm.question_type === "select") && (
          <div className="grid grid-cols-1 gap-2">
            <input
              value={taskForm.optionA}
              onChange={(e) => setTaskForm({ ...taskForm, optionA: e.target.value })}
              className="p-2 rounded border"
              placeholder="A"
              required
            />
            <input
              value={taskForm.optionB}
              onChange={(e) => setTaskForm({ ...taskForm, optionB: e.target.value })}
              className="p-2 rounded border"
              placeholder="B"
              required
            />
            <input
              value={taskForm.optionC}
              onChange={(e) => setTaskForm({ ...taskForm, optionC: e.target.value })}
              className="p-2 rounded border"
              placeholder="C"
              required
            />
            <input
              value={taskForm.optionD}
              onChange={(e) => setTaskForm({ ...taskForm, optionD: e.target.value })}
              className="p-2 rounded border"
              placeholder="D"
              required
            />
            {taskForm.question_type === "mcq6" && (
              <>
                <input
                  value={taskForm.optionE}
                  onChange={(e) => setTaskForm({ ...taskForm, optionE: e.target.value })}
                  className="p-2 rounded border"
                  placeholder="E"
                  required
                />
                <input
                  value={taskForm.optionF}
                  onChange={(e) => setTaskForm({ ...taskForm, optionF: e.target.value })}
                  className="p-2 rounded border"
                  placeholder="F"
                  required
                />
              </>
            )}
          </div>
        )}

        {!createUsesBank && taskForm.question_type === "select" && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <input
                value={taskForm.subQuestion1}
                onChange={(e) => setTaskForm({ ...taskForm, subQuestion1: e.target.value })}
                className="p-2 rounded border"
                placeholder="1-қосымша сұрақ"
                required
              />
              <select
                value={taskForm.correctSub1}
                onChange={(e) => setTaskForm({ ...taskForm, correctSub1: e.target.value as any })}
                className="p-2 rounded border"
              >
                <option value="A">Дұрыс: A</option>
                <option value="B">Дұрыс: B</option>
                <option value="C">Дұрыс: C</option>
                <option value="D">Дұрыс: D</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <input
                value={taskForm.subQuestion2}
                onChange={(e) => setTaskForm({ ...taskForm, subQuestion2: e.target.value })}
                className="p-2 rounded border"
                placeholder="2-қосымша сұрақ"
                required
              />
              <select
                value={taskForm.correctSub2}
                onChange={(e) => setTaskForm({ ...taskForm, correctSub2: e.target.value as any })}
                className="p-2 rounded border"
              >
                <option value="A">Дұрыс: A</option>
                <option value="B">Дұрыс: B</option>
                <option value="C">Дұрыс: C</option>
                <option value="D">Дұрыс: D</option>
              </select>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
        >
          Есеп қосу
        </button>
      </form>
    </>
  );
}
