import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import {
  isMcqQuestionType,
  MCQ_OPTION_LABELS,
  McqOptionLabel,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import {
  AnswerMode,
  BankDifficulty,
  BankImportPreviewResponse,
  BankTask,
  BankTaskSimilarCandidate,
  LessonTask,
  QuestionType,
  TaskTextScale
} from "@/types";

export type BankFormState = {
  text: string;
  question_type: QuestionType;
  answer_mode: AnswerMode;
  text_scale: TaskTextScale;
  answer: string;
  acceptedAnswers: string[];
  difficulty: BankDifficulty;
  currentVersion: number | null;
  imageFile: File | null;
  existingImageFilename: string | null;
  removeImage: boolean;
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
  topics: string[];
};

export type PendingDedupState = {
  similarTasks: BankTaskSimilarCandidate[];
};

export type ImportPreviewState = {
  payload: Record<string, any> | Array<Record<string, any>>;
  preview: BankImportPreviewResponse;
};

export type SnapshotViewState = {
  taskId: number;
  versionNo: number;
  snapshot: any;
};

export type JsonEditState = {
  task: BankTask;
  versionNo: number;
  value: string;
  error: string | null;
  saving: boolean;
  canForceSave: boolean;
};

export const JSON_EDIT_QUESTION_TYPES: QuestionType[] = ["tf", "mcq", "mcq6", "input", "select"];

export const JSON_EDIT_DIFFICULTIES: BankDifficulty[] = ["A", "B", "C"];

export const createEmptyForm = (): BankFormState => ({
  text: "",
  question_type: "mcq",
  answer_mode: "choices",
  text_scale: "md",
  answer: "",
  acceptedAnswers: [],
  difficulty: "B",
  currentVersion: null,
  imageFile: null,
  existingImageFilename: null,
  removeImage: false,
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
  topics: [],
});

export const parseTaskToForm = (task: BankTask): BankFormState => {
  const form = createEmptyForm();
  form.text = task.text || "";
  form.question_type = (task.question_type || "input") as QuestionType;
  form.answer_mode = getTaskAnswerMode(task);
  form.text_scale = normalizeTaskTextScale(task.text_scale);
  form.answer = task.answer || "";
  form.acceptedAnswers = normalizeAcceptedAnswers(task.accepted_answers);
  form.difficulty = (task.difficulty || "B") as BankDifficulty;
  form.currentVersion = typeof task.current_version === "number" ? task.current_version : null;
  form.existingImageFilename = task.image_filename || null;
  form.topics = Array.isArray(task.topics) ? task.topics : [];

  const options = Array.isArray(task.options) ? task.options : [];
  form.optionA = options.find((o) => o.label === "A")?.text || "";
  form.optionB = options.find((o) => o.label === "B")?.text || "";
  form.optionC = options.find((o) => o.label === "C")?.text || "";
  form.optionD = options.find((o) => o.label === "D")?.text || "";
  form.optionE = options.find((o) => o.label === "E")?.text || "";
  form.optionF = options.find((o) => o.label === "F")?.text || "";
  form.optionG = options.find((o) => o.label === "G")?.text || "";
  form.optionH = options.find((o) => o.label === "H")?.text || "";

  if (isMcqQuestionType(task.question_type)) {
    const correctOptions = parseMcqAnswerLabels(task.answer || "A");
    form.correctOptions = correctOptions.length ? correctOptions : ["A"];
  }
  if (task.question_type === "tf") {
    form.correctTf = task.answer === "false" ? "false" : "true";
  }
  const subquestions = Array.isArray(task.subquestions) ? task.subquestions : [];
  if (task.question_type === "select") {
    if (subquestions.length >= 2) {
      form.subQuestion1 = subquestions[0]?.text || "";
      form.subQuestion2 = subquestions[1]?.text || "";
      form.correctSub1 = (subquestions[0]?.correct || "A") as BankFormState["correctSub1"];
      form.correctSub2 = (subquestions[1]?.correct || "A") as BankFormState["correctSub2"];
    } else {
      try {
        const parsed = JSON.parse(task.answer || "[]");
        if (Array.isArray(parsed) && parsed.length >= 2) {
          form.correctSub1 = (parsed[0] || "A") as BankFormState["correctSub1"];
          form.correctSub2 = (parsed[1] || "A") as BankFormState["correctSub2"];
        }
      } catch {
        // no-op
      }
    }
  }

  return form;
};

export const formatDifficultyLabel = (difficulty: BankDifficulty): string => {
  if (difficulty === "A") return "A (оңай)";
  if (difficulty === "B") return "B (орташа)";
  return "C (қиын)";
};

export const normalizeJsonEditQuestionType = (value: unknown): QuestionType => {
  if (typeof value === "string" && JSON_EDIT_QUESTION_TYPES.includes(value as QuestionType)) {
    return value as QuestionType;
  }
  throw new Error(`question_type жарамсыз: ${String(value || "")}`);
};

export const normalizeJsonEditDifficulty = (value: unknown): BankDifficulty => {
  if (typeof value === "string" && JSON_EDIT_DIFFICULTIES.includes(value as BankDifficulty)) {
    return value as BankDifficulty;
  }
  return "B";
};

export const normalizeJsonEditStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
};

export const normalizeJsonEditArray = (value: unknown): any[] => {
  return Array.isArray(value) ? value : [];
};

export const buildJsonEditValue = (snapshot: any, task: BankTask): string => {
  const payload = {
    text: snapshot?.text ?? "",
    answer: snapshot?.answer ?? "",
    question_type: snapshot?.question_type ?? task.question_type ?? "input",
    answer_mode: getTaskAnswerMode({
      question_type: snapshot?.question_type ?? task.question_type,
      answer_mode: snapshot?.answer_mode ?? task.answer_mode,
    }),
    accepted_answers: normalizeAcceptedAnswers(
      Array.isArray(snapshot?.accepted_answers) ? snapshot.accepted_answers : task.accepted_answers
    ),
    text_scale: normalizeTaskTextScale(snapshot?.text_scale ?? task.text_scale),
    difficulty: snapshot?.difficulty ?? task.difficulty ?? "B",
    topics: Array.isArray(snapshot?.topics) ? snapshot.topics : [],
    options: Array.isArray(snapshot?.options) ? snapshot.options : [],
    subquestions: Array.isArray(snapshot?.subquestions) ? snapshot.subquestions : [],
    image_filename: snapshot?.image_filename ?? null,
    solution_filename: snapshot?.solution_filename ?? null,
  };
  return JSON.stringify(payload, null, 2);
};

export const getBankFormOptionValue = (form: BankFormState, label: McqOptionLabel): string => {
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

export const setBankFormOptionValue = (
  form: BankFormState,
  label: McqOptionLabel,
  value: string
): BankFormState => {
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

export const buildMcqOptionsFromBankForm = (form: BankFormState): Array<{ label: string; text: string }> => {
  const highestIndex = MCQ_OPTION_LABELS.reduce((highest, label, index) => {
    const value = getBankFormOptionValue(form, label).trim();
    return value || form.correctOptions.includes(label) ? Math.max(highest, index) : highest;
  }, 3);
  return MCQ_OPTION_LABELS.slice(0, highestIndex + 1).map((label) => ({
    label,
    text: getBankFormOptionValue(form, label),
  }));
};

export const buildBankFormPreviewTask = (form: BankFormState): LessonTask => {
  let answer = form.answer;
  let options: LessonTask["options"] = [];
  let subquestions: LessonTask["subquestions"] = [];

  if (isMcqQuestionType(form.question_type)) {
    answer = serializeMcqAnswerLabels(form.correctOptions);
    options = buildMcqOptionsFromBankForm(form);
  } else if (form.question_type === "select") {
    answer = JSON.stringify([form.correctSub1, form.correctSub2]);
    options = MCQ_OPTION_LABELS.slice(0, 4).map((label) => ({
      label,
      text: getBankFormOptionValue(form, label),
    }));
    subquestions = [
      { text: form.subQuestion1, correct: form.correctSub1 },
      { text: form.subQuestion2, correct: form.correctSub2 },
    ];
  } else if (form.question_type === "tf") {
    answer = form.correctTf;
  }

  return {
    id: -1,
    text: form.text,
    question_type: form.question_type,
    answer_mode: form.answer_mode,
    answer,
    accepted_answers: normalizeAcceptedAnswers(form.acceptedAnswers),
    text_scale: form.text_scale,
    options,
    subquestions,
    image_filename: form.existingImageFilename,
    sort_order: 0,
  };
};
