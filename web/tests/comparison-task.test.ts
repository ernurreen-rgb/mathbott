import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  formatComparisonSummary,
  hasEmptyMcqOptionTexts,
  parseComparisonTask,
} from "../lib/comparison-task";

describe("parseComparisonTask", () => {
  it("parses shared condition and A/B columns", () => {
    const raw =
      "Тізбектің келесі мүшесі\n[[A]] 1, 7, 13, 19, ...\n[[B]] 2, 7, 12, 17, ...";
    const parsed = parseComparisonTask(raw);
    assert.deepEqual(parsed, {
      condition: "Тізбектің келесі мүшесі",
      columnA: "1, 7, 13, 19, ...",
      columnB: "2, 7, 12, 17, ...",
    });
  });

  it("parses A/B columns without shared condition and normalizes CRLF", () => {
    const raw = "[[A]] 10^5\r\n[[B]] 10000";
    const parsed = parseComparisonTask(raw);
    assert.deepEqual(parsed, {
      condition: "",
      columnA: "10^5",
      columnB: "10000",
    });
  });

  it("supports multiline condition and multiline expressions", () => {
    const raw =
      "Шарты: x > 0\ny > 0\n[[A]] \\frac{x}{2}\n[[B]] \\frac{y}{3}";
    const parsed = parseComparisonTask(raw);
    assert.deepEqual(parsed, {
      condition: "Шарты: x > 0\ny > 0",
      columnA: "\\frac{x}{2}",
      columnB: "\\frac{y}{3}",
    });
  });

  it("returns null for regular tasks or malformed markers", () => {
    assert.equal(parseComparisonTask(null), null);
    assert.equal(parseComparisonTask(""), null);
    assert.equal(parseComparisonTask("Теңдеуді шешіңіз: 2x = 6"), null);
    assert.equal(parseComparisonTask("[[A]] 10"), null);
    assert.equal(parseComparisonTask("[[B]] 10\n[[A]] 5"), null);
    assert.equal(parseComparisonTask("[[A]]   \n[[B]]   "), null);
  });
});

describe("formatComparisonSummary", () => {
  it("formats compact single-line summary with and without condition", () => {
    assert.equal(
      formatComparisonSummary("ЕҮОБ\n[[A]] 12, 16\n[[B]] 14, 18"),
      "ЕҮОБ — A: 12, 16 | B: 14, 18"
    );
    assert.equal(
      formatComparisonSummary("[[A]] 10^5\n[[B]] 10000"),
      "A: 10^5 | B: 10000"
    );
    assert.equal(formatComparisonSummary("Жай мәтін"), "Жай мәтін");
  });
});

describe("hasEmptyMcqOptionTexts", () => {
  it("returns true only when non-empty option list has all empty texts", () => {
    assert.equal(
      hasEmptyMcqOptionTexts([
        { label: "A", text: "" },
        { label: "B", text: "" },
        { label: "C", text: "   " },
        { label: "D", text: null },
      ]),
      true
    );
    assert.equal(hasEmptyMcqOptionTexts([]), false);
    assert.equal(hasEmptyMcqOptionTexts(null), false);
    assert.equal(
      hasEmptyMcqOptionTexts([
        { label: "A", text: "5" },
        { label: "B", text: "" },
      ]),
      false
    );
  });
});
