export const parseWrittenAnswerSlots = (value: string | undefined, count: number): string[] => {
  const size = Math.max(1, Math.trunc(count) || 1);
  const raw = String(value || "");

  if (size === 1) return [raw];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from({ length: size }, (_, index) => String(parsed[index] || ""));
    }
  } catch {
    // A historic single-value answer is kept in the first slot.
  }

  return [raw, ...Array.from({ length: size - 1 }, () => "")];
};

export const serializeWrittenAnswerSlots = (values: string[]): string => {
  if (values.length <= 1) return values[0] || "";
  return JSON.stringify(values);
};

export const isWrittenAnswerComplete = (value: string | undefined, count = 1): boolean =>
  parseWrittenAnswerSlots(value, count).every((item) => item.trim().length > 0);
