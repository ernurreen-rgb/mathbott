import { describe, expect, it } from "vitest";

import { getTaskAnswerMode } from "@/lib/answer-mode";
import {
  getTaskMcqCorrectCount,
  isMcqAnswerComplete,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels,
  toggleMcqAnswerLabel,
} from "@/lib/question-options";
import { isSelectAnswerComplete, isTaskAnswerComplete } from "@/lib/task-answer";
import {
  collectTrialTestAnswers,
  getAnsweredTrialTaskCount,
  getTrialTaskAnswerProgress,
  isTrialTaskAnswered,
} from "@/lib/trial-test-answer";
import { isWrittenAnswerComplete, parseWrittenAnswerSlots, serializeWrittenAnswerSlots } from "@/lib/written-answer";
import type { LessonTask } from "@/types";

const makeTask = (fields: Partial<LessonTask>): LessonTask =>
  ({ id: 1, text: "", question_type: "input", sort_order: 0, ...fields }) as LessonTask;

describe("answer mode", () => {
  it("is always written for formula tasks and always choices for true/false", () => {
    expect(getTaskAnswerMode({ question_type: "input", answer_mode: "choices" })).toBe("written");
    expect(getTaskAnswerMode({ question_type: "tf", answer_mode: "written" })).toBe("choices");
  });

  it("follows the task's setting for choice and matching tasks, defaulting to choices", () => {
    expect(getTaskAnswerMode({ question_type: "mcq", answer_mode: "written" })).toBe("written");
    expect(getTaskAnswerMode({ question_type: "select" })).toBe("choices");
  });
});

describe("written answers with several fields", () => {
  it("round-trips the slots through the stored JSON", () => {
    const stored = serializeWrittenAnswerSlots(["3", "-3"]);
    expect(stored).toBe('["3","-3"]');
    expect(parseWrittenAnswerSlots(stored, 2)).toEqual(["3", "-3"]);
  });

  it("keeps a single field as plain text and an old single value in the first slot", () => {
    expect(serializeWrittenAnswerSlots(["5"])).toBe("5");
    expect(parseWrittenAnswerSlots("5", 2)).toEqual(["5", ""]);
  });

  it("is complete only when every field is filled", () => {
    expect(isWrittenAnswerComplete('["3",""]', 2)).toBe(false);
    expect(isWrittenAnswerComplete('["3"," -3 "]', 2)).toBe(true);
  });
});

describe("choice labels", () => {
  it("reads every stored format of correct labels", () => {
    expect(parseMcqAnswerLabels("A,C")).toEqual(["A", "C"]);
    expect(parseMcqAnswerLabels('["b","a"]')).toEqual(["B", "A"]);
    expect(parseMcqAnswerLabels("A C")).toEqual(["A", "C"]);
    expect(serializeMcqAnswerLabels(["A"])).toBe("A");
  });

  it("toggles up to the number of correct answers", () => {
    expect(toggleMcqAnswerLabel("", "A", 1)).toBe("A");
    expect(toggleMcqAnswerLabel("A", "B", 1)).toBe("B");
    expect(toggleMcqAnswerLabel("A", "B", 2)).toBe('["A","B"]');
    expect(toggleMcqAnswerLabel('["A","B"]', "C", 2)).toBe('["A","B"]');
    expect(toggleMcqAnswerLabel('["A","B"]', "A", 2)).toBe("B");
  });

  it("takes the number of correct answers from the task, or from its key", () => {
    expect(getTaskMcqCorrectCount({ correct_count: 2 })).toBe(2);
    expect(getTaskMcqCorrectCount({ answer: "A,C" })).toBe(2);
    expect(isMcqAnswerComplete("A", 2)).toBe(false);
    expect(isMcqAnswerComplete('["A","C"]', 2)).toBe(true);
  });
});

describe("isTaskAnswerComplete (enables «Тексеру»)", () => {
  it("needs some text for formula and true/false tasks", () => {
    expect(isTaskAnswerComplete(makeTask({ question_type: "input" }), "  ")).toBe(false);
    expect(isTaskAnswerComplete(makeTask({ question_type: "input" }), "5")).toBe(true);
    expect(isTaskAnswerComplete(makeTask({ question_type: "tf" }), "true")).toBe(true);
  });

  it("needs every correct choice for multi-answer tasks", () => {
    const task = makeTask({ question_type: "mcq", answer: "A,C" });
    expect(isTaskAnswerComplete(task, "A")).toBe(false);
    expect(isTaskAnswerComplete(task, '["A","C"]')).toBe(true);
  });

  it("needs both rows of a matching task, chosen or written", () => {
    expect(isSelectAnswerComplete('["A",""]')).toBe(false);
    expect(isTaskAnswerComplete(makeTask({ question_type: "select" }), '["A","B"]')).toBe(true);
    const written = makeTask({ question_type: "select", answer_mode: "written" });
    expect(isTaskAnswerComplete(written, '["4",""]')).toBe(false);
    expect(isTaskAnswerComplete(written, '["4","9"]')).toBe(true);
  });
});

describe("trial test answers (partial answers count and are submitted)", () => {
  const tasks = [
    makeTask({ id: 1, question_type: "input" }),
    makeTask({ id: 2, question_type: "select" }),
    makeTask({ id: 3, question_type: "mcq", answer: "A,C" }),
    makeTask({ id: 4, question_type: "tf" }),
  ];

  it("counts a task once anything is entered in it", () => {
    expect(isTrialTaskAnswered(tasks[1], '["A",""]')).toBe(true);
    expect(isTrialTaskAnswered(tasks[1], '["",""]')).toBe(false);
    expect(isTrialTaskAnswered(tasks[2], "A")).toBe(true);
    expect(isTrialTaskAnswered(tasks[0], " ")).toBe(false);
  });

  it("collects only the answered tasks and reports progress", () => {
    const answers = { 1: "5", 2: '["A",""]', 3: "", 4: "false" };
    expect(collectTrialTestAnswers(tasks, answers)).toEqual({ 1: "5", 2: '["A",""]', 4: "false" });
    expect(getAnsweredTrialTaskCount(tasks, answers)).toBe(3);
    expect(getTrialTaskAnswerProgress(tasks, answers)).toBe(75);
    expect(getTrialTaskAnswerProgress([], {})).toBe(0);
  });
});
