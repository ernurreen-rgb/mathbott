import { getTaskAnswerMode } from "@/lib/answer-mode";
import {
  getMcqCorrectOptionLimit,
  getMcqEditorLabels,
  isMcqQuestionType,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
} from "@/lib/question-options";
import type { LessonTask, QuestionType } from "@/types";

export const SELECT_OPTION_LABELS = ["A", "B", "C", "D"] as const;

export function normalizeTfAnswer(raw: string | null | undefined): "true" | "false" {
  const lowered = (raw || "").trim().toLowerCase();
  return lowered === "false" ? "false" : "true";
}

export function normalizeSelectOptions(
  options?: Array<{ label: string; text: string }> | null
): Array<{ label: string; text: string }> {
  return SELECT_OPTION_LABELS.map((label) => ({
    label,
    text: options?.find((option) => (option.label || "").trim().toUpperCase() === label)?.text || "",
  }));
}

export function normalizeSelectSubquestions(
  subquestions?: Array<{ text: string; correct?: string }> | null
): Array<{ text: string; correct: string }> {
  const existing = Array.isArray(subquestions) ? subquestions : [];
  return [0, 1].map((index) => {
    const rawCorrect = (existing[index]?.correct || "A").trim().toUpperCase();
    const correct = (SELECT_OPTION_LABELS as readonly string[]).includes(rawCorrect) ? rawCorrect : "A";
    return {
      text: existing[index]?.text || "",
      correct,
    };
  });
}

export function normalizeTaskForQuestionType(
  current: Partial<LessonTask>,
  nextType: QuestionType
): Partial<LessonTask> {
  const answer_mode = getTaskAnswerMode({ question_type: nextType });

  if (isMcqQuestionType(nextType)) {
    const allowedLabels = getMcqEditorLabels(nextType);
    const keptAnswers = parseMcqAnswerLabels(current.answer)
      .filter((label) => allowedLabels.includes(label))
      .slice(0, getMcqCorrectOptionLimit(nextType));
    return {
      question_type: nextType,
      options: allowedLabels.map((label) => ({
        label,
        text: current.options?.find((option) => (option.label || "").trim().toUpperCase() === label)?.text || "",
      })),
      answer: serializeMcqAnswerLabels(keptAnswers.length > 0 ? keptAnswers : [allowedLabels[0]]),
      subquestions: undefined,
      answer_mode,
    };
  }

  if (nextType === "select") {
    const options = normalizeSelectOptions(current.options);
    const subquestions = normalizeSelectSubquestions(current.subquestions);
    return {
      question_type: "select",
      options,
      subquestions,
      answer: JSON.stringify(subquestions.map((sq) => sq.correct)),
      answer_mode,
    };
  }

  if (nextType === "tf") {
    return {
      question_type: "tf",
      answer: normalizeTfAnswer(current.answer),
      options: undefined,
      subquestions: undefined,
      answer_mode,
    };
  }

  const keepAnswer = current.question_type === "input";
  return {
    question_type: "input",
    answer: keepAnswer ? current.answer || "" : "",
    options: undefined,
    subquestions: undefined,
    answer_mode,
  };
}
