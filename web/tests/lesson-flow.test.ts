import { describe, expect, it } from "vitest";

import { pickNextTaskId, pickStepAfterReview, type LessonFlowMini } from "@/lib/lesson-flow";

const task = (id: number, solved = false) => ({ id, solved });
const mini = (id: number, index: number, completed: boolean, pendingReview = 0): LessonFlowMini => ({
  id,
  index,
  completed,
  pendingReview,
});

describe("pickNextTaskId («Келесі» in a mini-lesson)", () => {
  it("goes to the next unsolved task", () => {
    expect(pickNextTaskId([task(1, true), task(2), task(3)], 0)).toBe(2);
  });

  it("skips solved tasks, so the second pass goes from one mistake to the next", () => {
    expect(pickNextTaskId([task(1), task(2, true), task(3, true), task(4)], 0)).toBe(4);
  });

  it("wraps round to an earlier mistake after the last task", () => {
    expect(pickNextTaskId([task(1), task(2, true), task(3, true)], 2)).toBe(1);
  });

  it("stays on the current task when it is the only one left", () => {
    expect(pickNextTaskId([task(1, true), task(2)], 1)).toBe(2);
  });

  it("returns null once everything is solved, which opens the summary", () => {
    expect(pickNextTaskId([task(1, true), task(2, true)], 1)).toBeNull();
  });
});

describe("pickStepAfterReview (straight on after a finished mistake review)", () => {
  const open = { id: 9, locked: false };
  const locked = { id: 9, locked: true };

  it("opens the next unfinished mini-lesson", () => {
    expect(pickStepAfterReview([mini(1, 1, true), mini(2, 2, false), mini(3, 3, false)], 1, open)).toEqual({ kind: "mini", id: 2 });
  });

  it("wraps round to an earlier unfinished mini-lesson", () => {
    expect(pickStepAfterReview([mini(1, 1, false), mini(2, 2, true), mini(3, 3, true)], 3, open)).toEqual({ kind: "mini", id: 1 });
  });

  it("orders mini-lessons by their index, not by the order they arrive in", () => {
    expect(pickStepAfterReview([mini(3, 3, false), mini(1, 1, true), mini(2, 2, false)], 1, null)).toEqual({ kind: "mini", id: 2 });
  });

  it("sends the student to another mini-lesson's unfinished review before the next lesson", () => {
    expect(pickStepAfterReview([mini(1, 1, true), mini(2, 2, true, 2)], 1, locked)).toEqual({ kind: "review", id: 2 });
  });

  it("goes to the next lesson once every mini-lesson is done and it is open", () => {
    expect(pickStepAfterReview([mini(1, 1, true), mini(2, 2, true)], 2, open)).toEqual({ kind: "lesson", id: 9 });
  });

  it("falls back to the section when the next lesson is closed or missing", () => {
    expect(pickStepAfterReview([mini(1, 1, true)], 1, locked)).toEqual({ kind: "section" });
    expect(pickStepAfterReview([mini(1, 1, true)], 1, null)).toEqual({ kind: "section" });
  });
});
