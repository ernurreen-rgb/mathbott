export interface ComparisonTaskParts {
  condition: string;
  columnA: string;
  columnB: string;
}

export function parseComparisonTask(text: string | null | undefined): ComparisonTaskParts | null {
  if (!text) return null;
  const normalized = text.replace(/\r\n?/g, "\n");
  const aIdx = normalized.indexOf("[[A]]");
  if (aIdx === -1) return null;
  if (aIdx > 0 && !/\s/.test(normalized[aIdx - 1])) return null;

  const afterAStart = aIdx + "[[A]]".length;
  const bIdx = normalized.indexOf("[[B]]", afterAStart);
  if (bIdx === -1) return null;
  if (bIdx > afterAStart && !/\s/.test(normalized[bIdx - 1])) return null;

  const condition = normalized.slice(0, aIdx).trim();
  const columnA = normalized.slice(afterAStart, bIdx).trim();
  const columnB = normalized.slice(bIdx + "[[B]]".length).trim();

  if (!columnA && !columnB) return null;
  return { condition, columnA, columnB };
}

export function formatComparisonSummary(text: string): string {
  const parts = parseComparisonTask(text);
  if (!parts) return text;
  const body = `A: ${parts.columnA} | B: ${parts.columnB}`;
  return parts.condition ? `${parts.condition} — ${body}` : body;
}

export function hasEmptyMcqOptionTexts<T extends { text?: string | null }>(
  options: ReadonlyArray<T> | null | undefined
): boolean {
  if (!options || options.length === 0) return false;
  return options.every((option) => (option.text ?? "").trim() === "");
}
