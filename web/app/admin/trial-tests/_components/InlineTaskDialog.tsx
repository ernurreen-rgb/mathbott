"use client";
import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import StudentTaskPreview from "@/components/admin/StudentTaskPreview";
import MathFieldInput from "@/components/ui/MathFieldInput";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
  isMcqQuestionType,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { AnswerMode, BankDifficulty, LessonTask, QuestionType, TaskTextScale } from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { SlotForm, getSlotFormOptionValue, setSlotFormOptionValue } from "./model";

type Props = {
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
  showInlineCreate,
  selectedTestId,
  activeSlot,
  setShowInlineCreate,
  onSaveInlineSlot,
  slotForm,
  setSlotForm,
  slotPreviewTask,
}: Props) {
  return (
    <>
      {showInlineCreate && selectedTestId && activeSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 p-4 overflow-auto">
          <div className="max-w-3xl mx-auto bg-white rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Жаңа тапсырма • ұяшық {activeSlot}</h3>
              <button className="text-sm" onClick={() => setShowInlineCreate(false)}>Жабу</button>
            </div>
            <form onSubmit={onSaveInlineSlot} className="space-y-3">
              <MathFieldInput value={slotForm.text} onChange={(v) => setSlotForm((p) => ({ ...p, text: v }))} placeholder="Тапсырма мәтіні" />
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">Мәтін өлшемі</label>
                <div className="flex gap-2">
                  {[
                    { label: "S", value: "sm" },
                    { label: "M", value: "md" },
                    { label: "L", value: "lg" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSlotForm((p) => ({ ...p, text_scale: item.value as TaskTextScale }))}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${slotForm.text_scale === item.value
                        ? "border-purple-600 bg-purple-600 text-white"
                        : "border-gray-300 bg-white text-gray-700"
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.question_type} onChange={(e) => {
                  const questionType = e.target.value as QuestionType;
                  setSlotForm((p) => ({ ...p, question_type: questionType, answer_mode: getTaskAnswerMode({ question_type: questionType }) }));
                }}>
                  <option value="mcq">MCQ(4-8)</option><option value="mcq6">MCQ legacy</option><option value="input">Енгізу</option><option value="tf">Ш/Ж</option><option value="select">Сәйкестендіру</option>
                </select>
                <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={slotForm.difficulty} onChange={(e) => setSlotForm((p) => ({ ...p, difficulty: e.target.value as BankDifficulty }))}>
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
                  {(isMcqQuestionType(slotForm.question_type) ? MCQ_OPTION_LABELS : MCQ_OPTION_LABELS.slice(0, 4)).map((label) => (
                    <MathFieldInput
                      key={label}
                      value={getSlotFormOptionValue(slotForm, label)}
                      onChange={(v) => setSlotForm((p) => setSlotFormOptionValue(p, label, v))}
                      placeholder={label}
                    />
                  ))}
                </div>
              )}

              {slotForm.question_type === "input" && <MathFieldInput value={slotForm.answer} onChange={(v) => setSlotForm((p) => ({ ...p, answer: v }))} placeholder="Дұрыс жауап" />}
              {slotForm.question_type === "input" && (
                <AcceptedAnswersEditor
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
                    {MCQ_OPTION_LABELS.map((label) => {
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
                          className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-bold ${isSelected
                            ? "border-purple-700 bg-purple-600 text-white"
                            : "border-gray-300 bg-white text-gray-800 hover:border-purple-300 hover:bg-purple-50"
                            }`}
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
                  <MathFieldInput value={slotForm.subQuestion1} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion1: v }))} placeholder="1-қосымша сұрақ" />
                  <MathFieldInput value={slotForm.subQuestion2} onChange={(v) => setSlotForm((p) => ({ ...p, subQuestion2: v }))} placeholder="2-қосымша сұрақ" />
                </div>
              )}
              <StudentTaskPreview task={slotPreviewTask} />
              <button className="rounded-lg bg-green-600 text-white px-4 py-2 text-sm">Сақтау</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
