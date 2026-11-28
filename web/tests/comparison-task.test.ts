import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import {
  formatComparisonSummary,
  hasEmptyMcqOptionTexts,
  parseComparisonTask,
} from "../lib/comparison-task";

const readComponent = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

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

describe("Comparison condition and title centering", () => {
  it("wraps ComparisonTableView condition in a flex-centered container so <math-div> centers", () => {
    const src = readComponent("../components/student/ComparisonTableView.tsx");
    assert.match(
      src,
      /flex flex-col items-center justify-center text-center[^`]*`[^`]*>\s*<MathRender latex=\{parts\.condition\}/
    );
  });

  it("wraps TaskStatement title and BankWorksheetDocument condition/title in flex-centered containers", () => {
    const taskStatementSrc = readComponent("../components/student/TaskStatement.tsx");
    assert.match(
      taskStatementSrc,
      /data-task-title className="[^"]*flex flex-col items-center justify-center text-center[^"]*">\s*<MathRender latex=\{title\}/
    );

    const worksheetSrc = readComponent("../components/admin/BankWorksheetDocument.tsx");
    assert.match(
      worksheetSrc,
      /comparison\.condition && <div style=\{\{[^}]*display:\s*'flex'[^}]*flexDirection:\s*'column'[^}]*alignItems:\s*'center'[^}]*justifyContent:\s*'center'[^}]*textAlign:\s*'center'[^}]*\}\}><MathRender latex=\{comparison\.condition\}/
    );
  });

  it("centers standalone body text when MCQ options are empty label-only A/B/C/D", () => {
    const taskStatementSrc = readComponent("../components/student/TaskStatement.tsx");
    assert.match(taskStatementSrc, /hasEmptyMcqOptionTexts\(task\.options\)/);
    assert.match(
      taskStatementSrc,
      /data-comparison-body[\s\S]*flex flex-col items-center justify-center text-center/
    );

    const worksheetSrc = readComponent("../components/admin/BankWorksheetDocument.tsx");
    assert.match(
      worksheetSrc,
      /data-comparison-body[\s\S]*display:\s*'flex'[\s\S]*alignItems:\s*'center'[\s\S]*justifyContent:\s*'center'[\s\S]*textAlign:\s*'center'/
    );
  });
});
