"use client";
import CmsDialog from "../../cms/_components/CmsDialog";
import styles from "../../cms/CmsWorkspace.module.css";
import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import StudentTaskPreview from "@/components/admin/StudentTaskPreview";
import MathFieldInput from "@/components/ui/MathFieldInput";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
  getMcqEditorLabels,
  isMcqQuestionType,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { AnswerMode, BankDifficulty, LessonTask, QuestionType } from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { SlotForm, getSlotFormOptionValue, setSlotFormOptionValue } from "./model";

type Props = {
  error: string | null;
  busy: boolean;
  showInlineCreate: boolean;
  selectedTestId: number | null;
  activeSlot: number | null;
  setShowInlineCreate: Dispatch<SetStateAction<boolean>>;
  onSaveInlineSlot: (e: React.FormEvent) => Promise<void>;
  slotForm: SlotForm;
  setSlotForm: Dispatch<SetStateAction<SlotForm>>;
  slotPreviewTask: LessonTask;
};

export default function InlineTaskDialog({
  error, busy,
  showInlineCreate,
  selectedTestId,
  activeSlot,
  setShowInlineCreate,
  onSaveInlineSlot,
  slotForm,
  setSlotForm,
  slotPreviewTask,
}: Props) {
  return <CmsDialog open={Boolean(showInlineCreate && selectedTestId && activeSlot)}
    title={`Жаңа тапсырма · ${activeSlot || ""}-ұяшық`} error={error}
    onClose={() => { if (!busy) setShowInlineCreate(false); }}>
            <form onSubmit={onSaveInlineSlot} className={styles.taskForm}>
              <fieldset disabled={busy} className="grid min-w-0 gap-4">
              <div className="grid gap-2"><span className={styles.field}>Тапсырма мәтіні</span><MathFieldInput readOnly={busy} ariaLabel="Тапсырма мәтіні" value={slotForm.text} onChange={(v) => setSlotForm((p) => ({ ...p, text: v }))} placeholder="Тапсырма мәтіні" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select aria-label="Сұрақ түрі" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.question_type} onChange={(e) => {
                  const questionType = e.target.value as QuestionType;
                  setSlotForm((p) => ({ ...p, question_type: questionType,
                      correctOptions: p.correctOptions.filter((label) => getMcqEditorLabels(questionType).includes(label)), answer_mode: getTaskAnswerMode({ question_type: questionType }) }));
                }}>
                  <option value="mcq">Көп таңдаулы (4 жауап)</option><option value="mcq6">Көп таңдаулы (6 жауап)</option><option value="input">Енгізу</option><option value="tf">Ш/Ж</option><option value="select">Сәйкестендіру</option>
                </select>
                <select aria-label="Күрделілігі" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.difficulty} onChange={(e) => setSlotForm((p) => ({ ...p, difficulty: e.target.value as BankDifficulty }))}>
                  <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                </select>
                <input className="rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Тақырыптар (үтір арқылы)" value={slotForm.topicsRaw} onChange={(e) => setSlotForm((p) => ({ ...p, topicsRaw: e.target.value }))} />
              </div>

              {supportsAnswerModeSwitch(slotForm.question_type) && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">Оқушының жауап беру тәсілі</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={slotForm.answer_mode}
                    onChange={(e) => setSlotForm((p) => ({ ...p, answer_mode: e.target.value as AnswerMode }))}
                  >
                    <option value="choices">Дайын нұсқаларды таңдайды</option>
                    <option value="written">Жауапты өзі жазады</option>
                  </select>
                </div>
              )}

              {(isMcqQuestionType(slotForm.question_type) || slotForm.question_type === "select") && (
                <div className="grid grid-cols-2 gap-2">
                  {(isMcqQuestionType(slotForm.question_type) ? getMcqEditorLabels(slotForm.question_type) : MCQ_OPTION_LABELS.slice(0, 4)).map((label) => (
                    <MathFieldInput readOnly={busy}
                      key={label}
                      ariaLabel={`${label} нұсқасы`}
                      value={getSlotFormOptionValue(slotForm, label)}
                      onChange={(v) => setSlotForm((p) => setSlotFormOptionValue(p, label, v))}
                      placeholder={label}
                    />
                  ))}
                </div>
              )}

              {slotForm.question_type === "input" && <MathFieldInput readOnly={busy} ariaLabel="Дұрыс жауап" value={slotForm.answer} onChange={(v) => setSlotForm((p) => ({ ...p, answer: v }))} placeholder="Дұрыс жауап" />}
              {slotForm.question_type === "input" && (
                <AcceptedAnswersEditor
                  disabled={busy}
                  value={slotForm.acceptedAnswers}
                  onChange={(acceptedAnswers) => setSlotForm((previous) => ({ ...previous, acceptedAnswers }))}
                />
              )}
              {slotForm.question_type === "tf" && (
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.correctTf} onChange={(e) => setSlotForm((p) => ({ ...p, correctTf: e.target.value as "true" | "false" }))}>
                  <option value="true">Шын</option><option value="false">Жалған</option>
                </select>
              )}
              {isMcqQuestionType(slotForm.question_type) && (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {getMcqEditorLabels(slotForm.question_type).map((label) => {
                      const isSelected = slotForm.correctOptions.includes(label);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setSlotForm((prev) => {
                              if (prev.correctOptions.includes(label) && prev.correctOptions.length <= 1) {
                                return prev;
                              }
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
                  <div className="text-xs text-gray-500">1-ден 3-ке дейін дұрыс жауап таңдауға болады.</div>
                </div>
              )}
              {slotForm.question_type === "select" && (
                <div className="grid grid-cols-2 gap-2">
                  <MathFieldInput readOnly={busy} value={slotForm.subQuestion1} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion1: v }))} placeholder="1-қосымша сұрақ" />
                  <MathFieldInput readOnly={busy} value={slotForm.subQuestion2} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion2: v }))} placeholder="2-қосымша сұрақ" />
                </div>
              )}
              <StudentTaskPreview
                task={slotPreviewTask}
                onTextScaleChange={(text_scale) => setSlotForm((p) => ({ ...p, text_scale }))}
              />
              <button className={styles.primaryButton}>{busy ? "Сақталуда..." : "Сақтау"}</button>
              </fieldset>
            </form>
  </CmsDialog>;
}
