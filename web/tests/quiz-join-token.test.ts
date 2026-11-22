import { describe, expect, it } from "vitest";

import { canReuseSavedQuizToken } from "@/lib/quiz-player-storage";
import type { QuizPlayerCredentials } from "@/types/quiz";

const saved = (overrides: Partial<QuizPlayerCredentials> = {}): QuizPlayerCredentials => ({
  sessionId: 7,
  participantId: 3,
  token: "t".repeat(43),
  nickname: "Аня",
  avatarColor: "#8b5cf6:fox",
  ...overrides,
});

describe("canReuseSavedQuizToken", () => {
  it("reuses a guest token only for the same nickname", () => {
    expect(canReuseSavedQuizToken(saved(), "Аня", undefined)).toBe(true);
    // The next student on a shared computer must not inherit the previous guest's seat.
    expect(canReuseSavedQuizToken(saved(), "Боря", undefined)).toBe(false);
    expect(canReuseSavedQuizToken(saved(), "Боря", "borya@example.com")).toBe(false);
  });

  it("lets a guest who signed up later recover the seat under the same nickname", () => {
    expect(canReuseSavedQuizToken(saved(), "Аня", "anya@example.com")).toBe(true);
  });

  it("follows the linked account regardless of nickname", () => {
    const linked = saved({ accountEmail: "anya@example.com" });
    expect(canReuseSavedQuizToken(linked, "Аня Т.", "anya@example.com")).toBe(true);
    expect(canReuseSavedQuizToken(linked, "Аня", undefined)).toBe(false);
    expect(canReuseSavedQuizToken(linked, "Аня", "other@example.com")).toBe(false);
  });

  it("never reuses a missing token", () => {
    expect(canReuseSavedQuizToken(null, "Аня", undefined)).toBe(false);
  });
});
