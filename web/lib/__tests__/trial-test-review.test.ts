import type { LessonTask } from "@/types";
import { getReviewTasks } from "../trial-test-review";

const task = (id: number, text: string, sort_order = 0): LessonTask => ({
  id, text, sort_order, question_type: "input",
});

it("reviews the submitted content after current tasks are edited, removed or added", () => {
  const original = task(1, "2+2", 1);
  const removed = task(2, "5+5", 0);
  expect(getReviewTasks([task(1, "3+3"), task(3, "new")], {
    1: { answer: "4", correct: true, task: original },
    2: { answer: "10", correct: true, task: removed },
  })).toEqual([removed, original]);
});

it("retains legacy attempts without snapshots", () => {
  const current = [task(1, "legacy")];
  expect(getReviewTasks(current, { 1: { answer: "4" } })).toBe(current);
});
