import {
  isFactorGridComplete,
  normalizeFactorGridRows,
  parseFactorGridAnswer,
  serializeFactorGridAnswer,
} from "../factor-grid";

describe("factor-grid helpers", () => {
  it("parses valid answers", () => {
    expect(parseFactorGridAnswer('["2x","-1","x","3"]')).toEqual(["2x", "-1", "x", "3"]);
  });

  it("returns empty cells for invalid answers", () => {
    expect(parseFactorGridAnswer("not-json")).toEqual(["", "", "", ""]);
  });

  it("serializes flat arrays", () => {
    expect(serializeFactorGridAnswer(["2x", "-1", "x", "3"])).toBe('["2x","-1","x","3"]');
  });

  it("normalizes row swaps but not in-row swaps", () => {
    const canonical = normalizeFactorGridRows(["\\text{2x}", "\\text{-1}", "\\text{x}", "\\text{3}"]);
    const swappedRows = normalizeFactorGridRows(["x", "3", "2x", "-1"]);
    const swappedRowsWithUnicodeMinus = normalizeFactorGridRows(["x", "3", "2x", "\u22121"]);
    const swappedCells = normalizeFactorGridRows(["-1", "2x", "x", "3"]);

    expect(canonical).toEqual(swappedRows);
    expect(canonical).toEqual(swappedRowsWithUnicodeMinus);
    expect(canonical).not.toEqual(swappedCells);
  });

  it("checks completeness", () => {
    expect(isFactorGridComplete(["2x", "-1", "x", "3"])).toBe(true);
    expect(isFactorGridComplete(["2x", "", "x", "3"])).toBe(false);
  });
});
