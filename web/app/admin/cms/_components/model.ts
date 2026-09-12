import type { McqOptionLabel } from "@/lib/question-options";
import { AnswerMode, TaskTextScale } from "@/types";

export interface Module {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
}

export interface Section {
  id: number;
  module_id: number;
  name: string;
  sort_order: number;
  description?: string | null;
  guide?: string | null;
}

export interface Lesson {
  id: number;
  section_id: number;
  lesson_number: number;
  title?: string;
  sort_order: number;
}

export interface MiniLesson {
  id: number;
  lesson_id: number;
  mini_index: number;
  title?: string;
  sort_order: number;
}

export interface MiniLessonTask {
  id: number;
  text: string;
  answer: string;
  accepted_answers?: string[] | null;
  question_type?: "tf" | "mcq" | "mcq6" | "input" | "select";
  answer_mode?: AnswerMode | null;
  options?: string | any[] | null;
  subquestions?: string | any[] | null;
  sort_order: number;
  bank_task_id?: number | null;
  bank_difficulty?: "A" | "B" | "C" | null;
  bank_topics?: string[];
  text_scale?: TaskTextScale | null;
}

export interface TrashTask {
  id: number;
  text: string;
  answer: string;
  deleted_at?: string;
}

export const parseBankTaskId = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

export const parseBankTopicsRaw = (raw: string): string[] => {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const item of raw.split(",")) {
    const topic = item.trim();
    if (!topic) continue;
    const normalized = topic.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    topics.push(topic.slice(0, 64));
    if (topics.length >= 10) break;
  }
  return topics;
};

export const stringifyTopics = (topics?: string[] | null): string => {
  if (!Array.isArray(topics)) return "";
  return topics.filter((topic) => typeof topic === "string" && topic.trim()).join(", ");
};

export const formatQuestionTypeLabel = (questionType?: string | null): string => {
  switch (questionType) {
    case "input":
      return "Енгізу";
    case "tf":
      return "Ш/Ж";
    case "mcq":
      return "MCQ (4)";
    case "mcq6":
      return "MCQ (6)";
    case "select":
      return "Сәйкестендіру";
    default:
      return questionType || "Енгізу";
  }
};

export const TASK_TEXT_SCALE_OPTIONS: Array<{ value: TaskTextScale; label: string }> = [
  { value: "sm", label: "S" },
  { value: "md", label: "M" },
  { value: "lg", label: "L" },
];

export type CreateTaskFormState = {
  text: string;
  question_type: "tf" | "mcq" | "mcq6" | "input" | "select";
  text_scale: TaskTextScale;
  answer: string;
  accepted_answers: string[];
  sort_order: number;
  bankTaskId: string;
  bank_difficulty: "A" | "B" | "C";
  bank_topics_raw: string;
  imageFile: File | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  optionF: string;
  correctOptions: McqOptionLabel[];
  correctTf: "true" | "false";
  subQuestion1: string;
  subQuestion2: string;
  correctSub1: "A" | "B" | "C" | "D";
  correctSub2: "A" | "B" | "C" | "D";
};
export type EditTaskFormState = {
  text: string;
  question_type: "tf" | "mcq" | "mcq6" | "input" | "select";
  text_scale: TaskTextScale;
  answer: string;
  accepted_answers: string[];
  sort_order: number;
  bank_task_id: number | null;
  bank_difficulty: "A" | "B" | "C";
  bank_topics_raw: string;
  imageFile: File | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE: string;
  optionF: string;
  correctOptions: McqOptionLabel[];
  correctTf: "true" | "false";
  subQuestion1: string;
  subQuestion2: string;
  correctSub1: "A" | "B" | "C" | "D";
  correctSub2: "A" | "B" | "C" | "D";
};
