import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import {
  isMcqQuestionType,
  MCQ_OPTION_LABELS,
  McqOptionLabel,
  serializeMcqAnswerLabels
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import { AnswerMode, BankDifficulty, BankPlacementTask, LessonTask, QuestionType, TaskTextScale } from "@/types";

export type SlotForm = {
  text: string;
  question_type: QuestionType;
  answer_mode: AnswerMode;
  text_scale: TaskTextScale;
  answer: string;
  acceptedAnswers: string[];
  difficulty: BankDifficulty;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  optionF: string;
  optionG: string;
  optionH: string;
  correctOptions: McqOptionLabel[];
  correctTf: "true" | "false";
  subQuestion1: string;
  subQuestion2: string;
  correctSub1: "A" | "B" | "C" | "D";
  correctSub2: "A" | "B" | "C" | "D";
  topicsRaw: string;
};

export const emptySlotForm = (): SlotForm => ({
  text: "",
  question_type: "mcq",
  answer_mode: "choices",
  text_scale: "md",
  answer: "",
  acceptedAnswers: [],
  difficulty: "B",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  optionE: "",
  optionF: "",
  optionG: "",
  optionH: "",
  correctOptions: ["A"],
  correctTf: "true",
  subQuestion1: "",
  subQuestion2: "",
  correctSub1: "A",
  correctSub2: "A",
  topicsRaw: "",
});

export const parseTopics = (raw: string): string[] =>
  raw
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 10);

export const getSlotFormOptionValue = (form: SlotForm, label: McqOptionLabel): string => {
  switch (label) {
    case "A":
      return form.optionA;
    case "B":
      return form.optionB;
    case "C":
      return form.optionC;
    case "D":
      return form.optionD;
    case "E":
      return form.optionE;
    case "F":
      return form.optionF;
    case "G":
      return form.optionG;
    case "H":
      return form.optionH;
  }
};

export const setSlotFormOptionValue = (form: SlotForm, label: McqOptionLabel, value: string): SlotForm => {
  switch (label) {
    case "A":
      return { ...form, optionA: value };
    case "B":
      return { ...form, optionB: value };
    case "C":
      return { ...form, optionC: value };
    case "D":
      return { ...form, optionD: value };
    case "E":
      return { ...form, optionE: value };
    case "F":
      return { ...form, optionF: value };
    case "G":
      return { ...form, optionG: value };
    case "H":
      return { ...form, optionH: value };
  }
};

export const buildMcqOptionsFromSlotForm = (form: SlotForm): Array<{ label: string; text: string }> => {
  const highestIndex = MCQ_OPTION_LABELS.reduce((highest, label, index) => {
    const value = getSlotFormOptionValue(form, label).trim();
    return value || form.correctOptions.includes(label) ? Math.max(highest, index) : highest;
  }, 3);
  return MCQ_OPTION_LABELS.slice(0, highestIndex + 1).map((label) => ({
    label,
    text: getSlotFormOptionValue(form, label),
  }));
};

export const buildSlotPayload = (form: SlotForm) => {
  const payload: Record<string, any> = {
    text: form.text,
    question_type: form.question_type,
    answer_mode: form.answer_mode,
    accepted_answers: normalizeAcceptedAnswers(form.acceptedAnswers),
    text_scale: form.text_scale,
    bank_difficulty: form.difficulty,
    bank_topics: parseTopics(form.topicsRaw),
  };

  if (form.question_type === "input") {
    payload.answer = form.answer;
    return payload;
  }
  if (form.question_type === "tf") {
    payload.answer = form.correctTf;
    return payload;
  }
  if (isMcqQuestionType(form.question_type)) {
    payload.answer = serializeMcqAnswerLabels(form.correctOptions);
    payload.options = buildMcqOptionsFromSlotForm(form);
    return payload;
  }
  payload.answer = JSON.stringify([form.correctSub1, form.correctSub2]);
  payload.options = [
    { label: "A", text: form.optionA },
    { label: "B", text: form.optionB },
    { label: "C", text: form.optionC },
    { label: "D", text: form.optionD },
  ];
  payload.subquestions = [
    { text: form.subQuestion1, correct: form.correctSub1 },
    { text: form.subQuestion2, correct: form.correctSub2 },
  ];
  return payload;
};

export const buildSlotPreviewTask = (form: SlotForm): LessonTask => ({
  id: -1,
  sort_order: 0,
  ...(buildSlotPayload(form) as Omit<LessonTask, "id" | "sort_order">),
});

export const getPlacementQuestionType = (placement: BankPlacementTask | null): QuestionType => {
  const raw = placement?.question_type || placement?.bank_task?.question_type || "input";
  if (raw === "mcq" || raw === "mcq6" || raw === "input" || raw === "tf" || raw === "select") {
    return raw;
  }
  return "input";
};

export const getPlacementOptions = (placement: BankPlacementTask | null) => {
  const options = placement?.options || placement?.bank_task?.options;
  return Array.isArray(options) ? options : [];
};

export const getPlacementSubquestions = (placement: BankPlacementTask | null) => {
  const subquestions = placement?.subquestions || placement?.bank_task?.subquestions;
  return Array.isArray(subquestions) ? subquestions : [];
};

export const getPlacementText = (placement: BankPlacementTask | null): string => {
  return placement?.text || placement?.bank_task?.text || "";
};

export const getPlacementTextScale = (placement: BankPlacementTask | null): TaskTextScale =>
  normalizeTaskTextScale(placement?.text_scale || placement?.bank_task?.text_scale);

export const getPlacementImageFilename = (placement: BankPlacementTask | null): string | null => {
  return placement?.image_filename || placement?.bank_task?.image_filename || null;
};

export const parseSelectAnswer = (value?: string): [string, string] => {
  if (!value) return ["", ""];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return [String(parsed[0] || ""), String(parsed[1] || "")];
    }
  } catch {
    // ignore parse errors
  }
  return ["", ""];
};

export const isSelectAnswerComplete = (value?: string): boolean => {
  const [a, b] = parseSelectAnswer(value);
  return a.trim().length > 0 && b.trim().length > 0;
};
