export const MCQ_OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type McqOptionLabel = (typeof MCQ_OPTION_LABELS)[number];

export const MAX_MCQ_CORRECT_OPTIONS = 3;
export const MCQ_EDITOR_OPTION_COUNTS = [4, 6] as const;

export function getMcqEditorLabels(questionType?: string | null): McqOptionLabel[] {
  return MCQ_OPTION_LABELS.slice(0, questionType === "mcq6" ? 6 : 4);
}

export function getMcqCorrectOptionLimit(questionType?: string | null, optionCount?: number): number {
  return (optionCount ?? getMcqEditorLabels(questionType).length) === 4 ? 1 : MAX_MCQ_CORRECT_OPTIONS;
}

export function getMcqEditorQuestionType<T extends string>(questionType: T, options?: readonly unknown[] | null): T | "mcq" | "mcq6" {
  if (questionType !== "mcq" && questionType !== "mcq6") return questionType;
  if (options?.length === 6) return "mcq6";
  if (options?.length === 4) return "mcq";
  return questionType;
}

export const isMcqQuestionType = (questionType?: string | null): boolean =>
  questionType === "mcq" || questionType === "mcq6";

const isMcqOptionLabel = (value: string): value is McqOptionLabel =>
  (MCQ_OPTION_LABELS as readonly string[]).includes(value);

const uniqueMcqLabels = (values: unknown[]): McqOptionLabel[] => {
  const seen = new Set<string>();
  const labels: McqOptionLabel[] = [];
  values.forEach((value) => {
    const label = String(value ?? "").trim().toUpperCase();
    if (!isMcqOptionLabel(label) || seen.has(label)) return;
    seen.add(label);
    labels.push(label);
  });
  return labels;
};

export function parseMcqAnswerLabels(answer?: string | string[] | null): McqOptionLabel[] {
  if (Array.isArray(answer)) {
    return uniqueMcqLabels(answer);
  }

  const raw = String(answer ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return uniqueMcqLabels(parsed);
    }
  } catch {
    // Fall back to legacy single-label and delimiter formats.
  }

  if (/[;,|]/.test(raw)) {
    return uniqueMcqLabels(raw.split(/[;,|]/));
  }
  if (/^[A-Ha-h](?:\s+[A-Ha-h]){1,7}$/.test(raw)) {
    return uniqueMcqLabels(raw.split(/\s+/));
  }
  return uniqueMcqLabels([raw]);
}

export function serializeMcqAnswerLabels(labels: Array<string | null | undefined>): string {
  const clean = uniqueMcqLabels(labels);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return JSON.stringify(clean);
}

export function getMcqCorrectCount(answer?: string | string[] | null, fallback = 1): number {
  const count = parseMcqAnswerLabels(answer).length;
  return Math.min(Math.max(count || fallback, 1), MAX_MCQ_CORRECT_OPTIONS);
}

export function getTaskMcqCorrectCount(task: { correct_count?: number | null; answer?: string | null }): number {
  const explicit = Number(task.correct_count);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(Math.max(Math.trunc(explicit), 1), MAX_MCQ_CORRECT_OPTIONS);
  }
  return getMcqCorrectCount(task.answer);
}

export function isMcqAnswerComplete(answer: string | undefined, requiredCount = 1): boolean {
  return parseMcqAnswerLabels(answer).length >= Math.min(Math.max(requiredCount, 1), MAX_MCQ_CORRECT_OPTIONS);
}

export function toggleMcqAnswerLabel(answer: string | undefined, label: McqOptionLabel, maxCount = 1): string {
  const limit = Math.min(Math.max(maxCount, 1), MAX_MCQ_CORRECT_OPTIONS);
  if (limit === 1) return label;

  const current = parseMcqAnswerLabels(answer);
  if (current.includes(label)) {
    return serializeMcqAnswerLabels(current.filter((item) => item !== label));
  }
  if (current.length >= limit) {
    return serializeMcqAnswerLabels(current);
  }
  return serializeMcqAnswerLabels([...current, label]);
}
