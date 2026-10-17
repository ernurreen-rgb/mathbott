"use client";

import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import MathFieldInput from "@/components/ui/MathFieldInput";
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
import styles from "../CmsWorkspace.module.css";

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
      <form onSubmit={createMiniLessonTask} onPaste={handlePasteImageCreate} className={`${styles.taskForm} space-y-3`}>
        <MathFieldInput
          value={taskForm.text}
          onChange={(text) => setTaskForm((prev) => ({ ...prev, text }))}
          className={styles.taskTextInput}
          ariaLabel="Тапсырма мәтіні"
          placeholder={createUsesBank ? String.raw`\text{БАНК тапсырма ID арқылы жасалуда}` : String.raw`\text{Тапсырма мәтіні}`}
          readOnly={createUsesBank}
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
        <div className={styles.taskSettings}>
          <div className={styles.field}>Мәтін өлшемі</div>
          <div className="mt-2 flex gap-2">
            {TASK_TEXT_SCALE_OPTIONS.map((option) => {
              const active = taskForm.text_scale === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTaskForm({ ...taskForm, text_scale: option.value })}
                  aria-pressed={active}
                  className={`${styles.choiceButton} ${active ? styles.choiceButtonActive : ""}`}
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
            aria-label="Тапсырма түрі"
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
              value={taskForm.answer}
              onChange={(answer) => setTaskForm((prev) => ({ ...prev, answer }))}
              ariaLabel="Дұрыс жауап"
              placeholder={String.raw`\text{Дұрыс жауап}`}
              defaultMode="math"
              smartMode={false}
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
            <MathFieldInput
              value={taskForm.optionA}
              onChange={(optionA) => setTaskForm((prev) => ({ ...prev, optionA }))}
              ariaLabel="A жауап нұсқасы"
              placeholder="A"
            />
            <MathFieldInput
              value={taskForm.optionB}
              onChange={(optionB) => setTaskForm((prev) => ({ ...prev, optionB }))}
              ariaLabel="B жауап нұсқасы"
              placeholder="B"
            />
            <MathFieldInput
              value={taskForm.optionC}
              onChange={(optionC) => setTaskForm((prev) => ({ ...prev, optionC }))}
              ariaLabel="C жауап нұсқасы"
              placeholder="C"
            />
            <MathFieldInput
              value={taskForm.optionD}
              onChange={(optionD) => setTaskForm((prev) => ({ ...prev, optionD }))}
              ariaLabel="D жауап нұсқасы"
              placeholder="D"
            />
            {taskForm.question_type === "mcq6" && (
              <>
                <MathFieldInput
                  value={taskForm.optionE}
                  onChange={(optionE) => setTaskForm((prev) => ({ ...prev, optionE }))}
                  ariaLabel="E жауап нұсқасы"
                  placeholder="E"
                />
                <MathFieldInput
                  value={taskForm.optionF}
                  onChange={(optionF) => setTaskForm((prev) => ({ ...prev, optionF }))}
                  ariaLabel="F жауап нұсқасы"
                  placeholder="F"
                />
              </>
            )}
          </div>
        )}

        {!createUsesBank && taskForm.question_type === "select" && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <MathFieldInput
                value={taskForm.subQuestion1}
                onChange={(subQuestion1) => setTaskForm((prev) => ({ ...prev, subQuestion1 }))}
                ariaLabel="1-қосымша сұрақ"
                placeholder={String.raw`\text{1-қосымша сұрақ}`}
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
              <MathFieldInput
                value={taskForm.subQuestion2}
                onChange={(subQuestion2) => setTaskForm((prev) => ({ ...prev, subQuestion2 }))}
                ariaLabel="2-қосымша сұрақ"
                placeholder={String.raw`\text{2-қосымша сұрақ}`}
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
          className={styles.primaryButton}
        >
          Есеп қосу
        </button>
      </form>
    </>
  );
}
