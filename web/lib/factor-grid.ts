export type FactorGridCells = [string, string, string, string];

const EMPTY_CELLS: FactorGridCells = ["", "", "", ""];

const unwrapTextWrapper = (value: string): string => {
  let current = value;
  while (/^\\text\{[\s\S]*\}$/.test(current)) {
    current = current.replace(/^\\text\{([\s\S]*)\}$/, "$1").trim();
  }
  return current;
};

const normalizeCell = (value: string): string => {
  const trimmed = unwrapTextWrapper(
    (value || "")
    .replace(/[\u2212\u2013\u2014\uFE63\uFF0D]/g, "-")
    .trim()
  );
  if (/[\\^_{}]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.toLowerCase();
};

export const parseFactorGridAnswer = (value: string | undefined | null): FactorGridCells => {
  if (!value) return [...EMPTY_CELLS] as FactorGridCells;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 4) {
      return [
        String(parsed[0] ?? ""),
        String(parsed[1] ?? ""),
        String(parsed[2] ?? ""),
        String(parsed[3] ?? ""),
      ];
    }
  } catch {
    // ignore parse errors
  }
  return [...EMPTY_CELLS] as FactorGridCells;
};

export const serializeFactorGridAnswer = (cells: FactorGridCells): string =>
  JSON.stringify(cells.map((cell) => String(cell ?? "")));

export const normalizeFactorGridRows = (cells: FactorGridCells): [[string, string], [string, string]] => {
  const rows: [[string, string], [string, string]] = [
    [normalizeCell(cells[0]), normalizeCell(cells[1])],
    [normalizeCell(cells[2]), normalizeCell(cells[3])],
  ];
  rows.sort((left, right) => {
    const leftKey = `${left[0]}\u0000${left[1]}`;
    const rightKey = `${right[0]}\u0000${right[1]}`;
    return leftKey.localeCompare(rightKey);
  });
  return rows;
};

export const isFactorGridComplete = (cells: FactorGridCells): boolean =>
  cells.every((cell) => String(cell ?? "").trim().length > 0);
