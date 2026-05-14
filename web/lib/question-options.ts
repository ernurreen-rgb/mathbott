export const MCQ_OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

export type McqOptionLabel = (typeof MCQ_OPTION_LABELS)[number];

export const MIN_MCQ_OPTIONS = 4;
export const MAX_MCQ_OPTIONS = MCQ_OPTION_LABELS.length;
export const MAX_MCQ_CORRECT_OPTIONS = 3;

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

export function formatMcqAnswerLabels(answer?: string | string[] | null): string {
  return parseMcqAnswerLabels(answer).join(", ");
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

export function isMcqLabelSelected(answer: string | undefined, label: string): boolean {
  return parseMcqAnswerLabels(answer).includes(label.trim().toUpperCase() as McqOptionLabel);
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
