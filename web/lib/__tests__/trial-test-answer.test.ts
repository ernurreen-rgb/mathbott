import {
  getAnsweredTrialTaskCount,
  getTrialTaskAnswerProgress,
  isTrialTaskAnswerComplete,
} from "../trial-test-answer";
import type { LessonTask, QuestionType } from "@/types";

const task = (id: number, question_type: QuestionType, extra: Partial<LessonTask> = {}): LessonTask => ({
  id,
  text: `Task ${id}`,
  question_type,
  sort_order: id,
  ...extra,
});

describe("trial-test-answer helpers", () => {
  it("counts progress from completed answers, not the current task position", () => {
    const tasks = [
      task(1, "input"),
      task(2, "mcq", { answer: "[\"A\", \"C\"]" }),
      task(3, "input"),
      task(4, "input"),
    ];
    const answers = {
      1: "42",
      2: JSON.stringify(["A"]),
      4: "last task",
    };

    expect(getAnsweredTrialTaskCount(tasks, answers)).toBe(2);
    expect(getTrialTaskAnswerProgress(tasks, answers)).toBe(50);
  });

  it("does not complete multi-answer MCQ until all required answers are selected", () => {
    const multiAnswerTask = task(10, "mcq", { answer: "[\"B\", \"D\"]" });

    expect(isTrialTaskAnswerComplete(multiAnswerTask, JSON.stringify(["B"]))).toBe(false);
    expect(isTrialTaskAnswerComplete(multiAnswerTask, JSON.stringify(["B", "D"]))).toBe(true);
  });
});
