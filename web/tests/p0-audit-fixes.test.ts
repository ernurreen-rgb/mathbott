import { describe, expect, it } from "vitest";

import {
  pathRequiresProxyUserEmail,
  pathSupportsOptionalProxyIdentity,
} from "@/lib/proxy-auth-paths";
import { normalizeTaskForQuestionType } from "@/lib/task-type-transition";
import type { LessonTask } from "@/types";

describe("P0 audit fixes (frontend)", () => {
  it("C-16: switching mcq -> tf resets answer to true/false and clears options", () => {
    const mcqTask: Partial<LessonTask> = {
      question_type: "mcq",
      answer: "A",
      options: [
        { label: "A", text: "10" },
        { label: "B", text: "20" },
        { label: "C", text: "30" },
        { label: "D", text: "40" },
      ],
    };

    const next = normalizeTaskForQuestionType(mcqTask, "tf");
    expect(next.question_type).toBe("tf");
    expect(next.answer).toBe("true");
    expect(next.options).toBeUndefined();
    expect(next.subquestions).toBeUndefined();
  });

  it("C-16: switching mcq6 -> select clamps 6 options to 4 (A-D) and initializes 2 subquestions", () => {
    const mcq6Task: Partial<LessonTask> = {
      question_type: "mcq6",
      answer: '["A", "E"]',
      options: [
        { label: "A", text: "1" },
        { label: "B", text: "2" },
        { label: "C", text: "3" },
        { label: "D", text: "4" },
        { label: "E", text: "5" },
        { label: "F", text: "6" },
      ],
    };

    const next = normalizeTaskForQuestionType(mcq6Task, "select");
    expect(next.question_type).toBe("select");
    expect(next.options?.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
    expect(next.options?.map((o) => o.text)).toEqual(["1", "2", "3", "4"]);
    expect(next.subquestions).toHaveLength(2);
    expect(next.answer).toBe('["A","A"]');
  });

  it("C-16: switching select -> mcq/input/tf clears subquestions and normalizes answer", () => {
    const selectTask: Partial<LessonTask> = {
      question_type: "select",
      answer: '["B","D"]',
      options: [
        { label: "A", text: "1" },
        { label: "B", text: "2" },
        { label: "C", text: "3" },
        { label: "D", text: "4" },
      ],
      subquestions: [
        { text: "Q1", correct: "B" },
        { text: "Q2", correct: "D" },
      ],
    };

    const asMcq = normalizeTaskForQuestionType(selectTask, "mcq");
    expect(asMcq.subquestions).toBeUndefined();
    expect(asMcq.options).toHaveLength(4);
    expect(asMcq.answer).toBe("B");

    const asInput = normalizeTaskForQuestionType(selectTask, "input");
    expect(asInput.subquestions).toBeUndefined();
    expect(asInput.options).toBeUndefined();
    expect(asInput.answer).toBe("");

    const asTf = normalizeTaskForQuestionType(selectTask, "tf");
    expect(asTf.subquestions).toBeUndefined();
    expect(asTf.options).toBeUndefined();
    expect(asTf.answer).toBe("true");
  });

  it("C-10: proxy allows unauthenticated GET to public trial-test catalog while protecting private routes", () => {
    expect(pathRequiresProxyUserEmail(["trial-tests"], "GET")).toBe(false);
    expect(pathRequiresProxyUserEmail(["trial-tests", "folders"], "GET")).toBe(false);
    expect(pathRequiresProxyUserEmail(["trial-tests", "categories"], "GET")).toBe(false);
    expect(pathRequiresProxyUserEmail(["trial-tests", "42"], "GET")).toBe(false);

    // Private trial-test routes and attempted_only require authentication.
    expect(
      pathRequiresProxyUserEmail(["trial-tests"], "GET", new URLSearchParams("attempted_only=true"))
    ).toBe(true);
    expect(pathRequiresProxyUserEmail(["trial-tests", "drafts"], "GET")).toBe(true);
    expect(pathRequiresProxyUserEmail(["trial-tests", "42", "draft"], "GET")).toBe(true);
    expect(pathRequiresProxyUserEmail(["trial-tests", "42", "draft"], "PUT")).toBe(true);
    expect(pathRequiresProxyUserEmail(["trial-tests", "42", "submit"], "POST")).toBe(true);
    expect(pathRequiresProxyUserEmail(["trial-tests", "42", "results"], "GET")).toBe(true);
    expect(pathRequiresProxyUserEmail(["user", "web", "language"], "POST")).toBe(true);

    // Optional identity forwarding covers modules, lessons, tasks, trial-tests, and quizzes.
    for (const root of ["modules", "lessons", "tasks", "trial-tests", "quizzes", "quiz-sessions"]) {
      expect(pathSupportsOptionalProxyIdentity([root, "1"])).toBe(true);
    }
  });
});
