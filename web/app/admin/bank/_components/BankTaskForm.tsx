"use client";
import AcceptedAnswersEditor from "@/components/admin/AcceptedAnswersEditor";
import StudentTaskPreview from "@/components/admin/StudentTaskPreview";
import MathFieldInput from "@/components/ui/MathFieldInput";
import MathRender from "@/components/ui/MathRender";
import { getTaskAnswerMode, supportsAnswerModeSwitch } from "@/lib/answer-mode";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  MCQ_OPTION_LABELS,
  isMcqQuestionType,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { getTaskTextScaleClass } from "@/lib/task-text-scale";
import type { LessonTaskOption, LessonTaskSubquestion } from "@/types";
import {
  AnswerMode,
  BankDifficulty,
  QuestionType,
  TaskTextScale
} from "@/types";
import type { Dispatch, SetStateAction } from "react";
import { BankFormState, getBankFormOptionValue, setBankFormOptionValue } from "./model";

type Props = {
  tab: "active" | "trash" | "answers";
  showForm: boolean;
  editingTaskId: number | null;
  form: BankFormState;
  handleSubmitForm: (e: React.FormEvent) => Promise<void>;
  setForm: Dispatch<SetStateAction<BankFormState>>;
  removeFormTopic: (topic: string) => void;
  formTopicInput: string;
  setFormTopicInput: Dispatch<SetStateAction<string>>;
  addFormTopic: (rawTopic: string) => void;
  formTopicSuggestions: string[];
  formPreviewTask: { id: number; text: string; answer?: string; accepted_answers?: string[] | null; question_type: QuestionType; answer_mode?: AnswerMode | null; correct_count?: number | null; text_scale?: TaskTextScale | null; options?: LessonTaskOption[] | null; subquestions?: LessonTaskSubquestion[] | null; image_filename?: string | null; solution_filename?: string | null; bank_task_id?: number | null; bank_difficulty?: BankDifficulty | null; bank_topics?: string[]; sort_order: number; status?: "not_started" | "in_progress" | "completed"; };
  formImagePreview: string | null;
  saving: boolean;
  resetAndHideForm: () => void;
};

export default function BankTaskForm({
  tab,
  showForm,
  editingTaskId,
  form,
  handleSubmitForm,
  setForm,
  removeFormTopic,
  formTopicInput,
  setFormTopicInput,
  addFormTopic,
  formTopicSuggestions,
  formPreviewTask,
  formImagePreview,
  saving,
  resetAndHideForm,
}: Props) {
  return (
    <>
      {tab === "active" && showForm && (
        <div className="mb-6 p-4 bg-white/70 rounded-2xl border border-white/40 space-y-3">
          <h2 className="text-xl font-bold text-gray-900">{editingTaskId ? `Өңдеу #${editingTaskId}` : "Жаңа тапсырма"}</h2>
          {editingTaskId && (
            <div className="text-sm text-gray-600">
              Нұсқа: v{form.currentVersion ?? "?"}
            </div>
          )}
          <form onSubmit={handleSubmitForm} className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Тапсырма мәтіні</label>
              <MathFieldInput
                value={form.text}
                onChange={(value) => setForm((prev) => ({ ...prev, text: value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                autoFocus
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-semibold text-gray-700">Мәтін өлшемі</label>
                <div className="flex gap-2">
                  {[
                    { label: "S", value: "sm" },
                    { label: "M", value: "md" },
                    { label: "L", value: "lg" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, text_scale: item.value as TaskTextScale }))}
                      className={`rounded-lg border px-3 py-1 text-xs font-semibold ${form.text_scale === item.value
                        ? "border-purple-600 bg-purple-600 text-white"
                        : "border-gray-300 bg-white text-gray-700"
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`min-h-[2.5rem] font-semibold text-gray-900 ${getTaskTextScaleClass(form.text_scale)}`}>
                {form.text ? <MathRender latex={form.text} /> : "Тапсырма мәтіні preview"}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Түрі</label>
                <select
                  value={form.question_type}
                  onChange={(e) => {
                    const questionType = e.target.value as QuestionType;
                    setForm((prev) => ({
                      ...prev,
                      question_type: questionType,
                      answer_mode: getTaskAnswerMode({ question_type: questionType }),
                    }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="input">Енгізу</option>
                  <option value="tf">Шын/Жалған</option>
                  <option value="mcq">MCQ (4-8)</option>
                  <option value="mcq6">MCQ legacy (4-8)</option>
                  <option value="select">Сәйкестендіру</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Күрделілік</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value as BankDifficulty }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="A">A (оңай)</option>
                  <option value="B">B (орташа)</option>
                  <option value="C">C (қиын)</option>
                </select>
              </div>
            </div>
            {supportsAnswerModeSwitch(form.question_type) && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Оқушының жауап беру тәсілі</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { value: "choices", label: "Нұсқаларды таңдайды" },
                    { value: "written", label: "Жауапты өзі жазады" },
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, answer_mode: mode.value as AnswerMode }))}
                      className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${form.answer_mode === mode.value
                        ? "border-purple-600 bg-purple-50 text-purple-800"
                        : "border-gray-300 bg-white text-gray-700"
                        }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Тақырыптар</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.topics.map((topic) => (
                  <button key={topic} type="button" onClick={() => removeFormTopic(topic)} className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    {topic} x
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formTopicInput}
                  onChange={(e) => setFormTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFormTopic(formTopicInput);
                    }
                  }}
                  placeholder="Тақырып қосу"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
                <button type="button" onClick={() => addFormTopic(formTopicInput)} className="bg-gray-200 hover:bg-gray-300 rounded-lg px-3">+</button>
              </div>
              {formTopicSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formTopicSuggestions.map((topic) => (
                    <button key={topic} type="button" onClick={() => addFormTopic(topic)} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded">
                      {topic}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {form.question_type === "input" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                <MathFieldInput
                  value={form.answer}
                  onChange={(value) => setForm((prev) => ({ ...prev, answer: value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
            )}

            {form.question_type === "input" && (
              <AcceptedAnswersEditor
                value={form.acceptedAnswers}
                onChange={(acceptedAnswers) => setForm((prev) => ({ ...prev, acceptedAnswers }))}
              />
            )}

            {(isMcqQuestionType(form.question_type) || form.question_type === "select") && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(isMcqQuestionType(form.question_type) ? MCQ_OPTION_LABELS : MCQ_OPTION_LABELS.slice(0, 4)).map((label, index) => (
                    <div key={label}>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        {label}
                        {isMcqQuestionType(form.question_type) && index >= 4 ? " (қосымша)" : ""}
                      </label>
                      <MathFieldInput
                        value={getBankFormOptionValue(form, label)}
                        onChange={(value) => setForm((prev) => setBankFormOptionValue(prev, label, value))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                      />
                    </div>
                  ))}
                </div>

                {isMcqQuestionType(form.question_type) && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                    <div className="flex flex-wrap gap-2">
                      {MCQ_OPTION_LABELS.map((label) => {
                        const isSelected = form.correctOptions.includes(label);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() =>
                              setForm((prev) => {
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
                    <p className="mt-1 text-xs text-gray-500">1-ден 3-ке дейін дұрыс жауап таңдауға болады.</p>
                  </div>
                )}
              </>
            )}

            {form.question_type === "select" && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MathFieldInput value={form.subQuestion1} onChange={(value) => setForm((prev) => ({ ...prev, subQuestion1: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                  <MathFieldInput value={form.subQuestion2} onChange={(value) => setForm((prev) => ({ ...prev, subQuestion2: value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select value={form.correctSub1} onChange={(e) => setForm((prev) => ({ ...prev, correctSub1: e.target.value as BankFormState["correctSub1"] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option value="A">Сәйкестендіру-1: A</option>
                    <option value="B">Сәйкестендіру-1: B</option>
                    <option value="C">Сәйкестендіру-1: C</option>
                    <option value="D">Сәйкестендіру-1: D</option>
                  </select>
                  <select value={form.correctSub2} onChange={(e) => setForm((prev) => ({ ...prev, correctSub2: e.target.value as BankFormState["correctSub2"] }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option value="A">Сәйкестендіру-2: A</option>
                    <option value="B">Сәйкестендіру-2: B</option>
                    <option value="C">Сәйкестендіру-2: C</option>
                    <option value="D">Сәйкестендіру-2: D</option>
                  </select>
                </div>
              </>
            )}

            {form.question_type === "tf" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Дұрыс жауап</label>
                <select value={form.correctTf} onChange={(e) => setForm((prev) => ({ ...prev, correctTf: e.target.value as "true" | "false" }))} className="w-full border border-gray-300 rounded-lg px-3 py-2">
                  <option value="true">Ш/Ж: Шын</option>
                  <option value="false">Ш/Ж: Жалған</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Сурет</label>
              <input type="file" accept="image/*" onChange={(e) => setForm((prev) => ({ ...prev, imageFile: e.target.files?.[0] || null, removeImage: false }))} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>

            {form.existingImageFilename && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.removeImage} onChange={(e) => setForm((prev) => ({ ...prev, removeImage: e.target.checked, imageFile: null }))} />
                Ағымдағы суретті жою ({form.existingImageFilename})
              </label>
            )}

            <StudentTaskPreview
              task={formPreviewTask}
              imageSrc={form.removeImage ? null : formImagePreview || undefined}
            />

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold py-2 px-4 rounded-lg">
                {saving ? "Сақталуда..." : editingTaskId ? "Сақтау" : "Құру"}
              </button>
              <button type="button" onClick={resetAndHideForm} className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg">
                Бас тарту
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
