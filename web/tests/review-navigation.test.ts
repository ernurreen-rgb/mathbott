import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeFinishedReview,
  consumeReviewOpenedFromLesson,
  markReviewFinished,
  markReviewOpenedFromLesson,
} from "@/lib/module-review-navigation";

// The tests run in Node, so the tab's sessionStorage is a small in-memory stand-in.
const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, String(value)),
    removeItem: (key: string) => void values.delete(key),
  };
};

beforeEach(() => vi.stubGlobal("sessionStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("review opened from the lesson", () => {
  it("is remembered once, so «back» steps back in history only for that review", () => {
    markReviewOpenedFromLesson("/lessons/3/review/12");
    expect(consumeReviewOpenedFromLesson("/lessons/3/review/12")).toBe(true);
    expect(consumeReviewOpenedFromLesson("/lessons/3/review/12")).toBe(false);
  });

  it("does not match another review", () => {
    markReviewOpenedFromLesson("/lessons/3/review/12");
    expect(consumeReviewOpenedFromLesson("/lessons/3/review/13")).toBe(false);
  });
});

describe("finished review (the lesson goes straight on)", () => {
  it("hands the reviewed mini-lesson to that lesson once", () => {
    markReviewFinished(3, 12);
    expect(consumeFinishedReview(3)).toBe(12);
    expect(consumeFinishedReview(3)).toBeNull();
  });

  it("is ignored by, and cleared for, any other lesson", () => {
    markReviewFinished(3, 12);
    expect(consumeFinishedReview(4)).toBeNull();
    expect(consumeFinishedReview(3)).toBeNull();
  });

  it("works without storage (private mode): nothing is remembered", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    });
    expect(() => markReviewFinished(3, 12)).not.toThrow();
    expect(consumeFinishedReview(3)).toBeNull();
    expect(consumeReviewOpenedFromLesson("/lessons/3/review/12")).toBe(false);
  });
});
