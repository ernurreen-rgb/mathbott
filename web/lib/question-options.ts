export const MCQ_OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type McqOptionLabel = (typeof MCQ_OPTION_LABELS)[number];

export const MIN_MCQ_OPTIONS = 4;
export const MAX_MCQ_OPTIONS = MCQ_OPTION_LABELS.length;

export const isMcqQuestionType = (questionType?: string | null): boolean =>
  questionType === "mcq" || questionType === "mcq6";

export function getMcqLabelsForOptionCount(count: number): McqOptionLabel[] {
  const safeCount = Math.min(Math.max(count, MIN_MCQ_OPTIONS), MAX_MCQ_OPTIONS);
  return MCQ_OPTION_LABELS.slice(0, safeCount);
}

export function getMcqOptionCountFromOptions(
  options?: Array<{ label?: string | null; text?: string | null }> | null,
  questionType?: string | null
): number {
  if (Array.isArray(options) && options.length > 0) {
    return Math.min(Math.max(options.length, MIN_MCQ_OPTIONS), MAX_MCQ_OPTIONS);
  }
  return questionType === "mcq6" ? 6 : MIN_MCQ_OPTIONS;
}
