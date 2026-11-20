import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseQuizAvatar, encodeQuizAvatar } from "../lib/quiz-avatar";
import { isTrialTaskAnswered } from "../lib/trial-test-answer";
import type { LessonTask } from "../types";

const swSource = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");

describe("Sprint 3 regressions", () => {
  it("parseQuizAvatar rejects invalid/injected CSS colors and keeps valid hex values", () => {
    const safe = parseQuizAvatar("#dbeafe:fox", "seed");
    expect(safe.color).toBe("#dbeafe");
    expect(safe.characterId).toBe("fox");

    const injected = parseQuizAvatar("#fff;background:url(evil):fox", "seed");
    expect(injected.color).toBe("#f3f4f6");
    expect(encodeQuizAvatar("javascript:alert(1)", "owl")).toBe("#f3f4f6:owl");
  });

  it("isTrialTaskAnswered handles null/empty select arrays cleanly", () => {
    const selectTask = {
      id: 1,
      question_type: "select",
      answer_mode: "choices",
      text: "Match",
    } as LessonTask;
    expect(isTrialTaskAnswered(selectTask, JSON.stringify([null, null]))).toBe(false);
    expect(isTrialTaskAnswered(selectTask, JSON.stringify(["", ""]))).toBe(false);
    expect(isTrialTaskAnswered(selectTask, JSON.stringify(["A", ""]))).toBe(true);
  });

  it("service worker never caches /_next/image proxying /api or cross-origin sources", async () => {
    let fetchListener: ((event: Record<string, unknown>) => void) | undefined;
    const selfObj = {
      location: { origin: "https://qazmath.vercel.app" },
      addEventListener: (type: string, fn: (event: Record<string, unknown>) => void) => {
        if (type === "fetch") fetchListener = fn;
      },
    };
    const fakeCaches = {
      open: async () => ({
        match: async () => ({ status: 200 }),
        put: async () => undefined,
        keys: async () => [],
      }),
    };
    runInNewContext(swSource, { self: selfObj, caches: fakeCaches, URL, Request: class {}, fetch: async () => ({ status: 200, type: "basic", clone: () => ({}) }), console });
    expect(fetchListener).toBeDefined();

    const checkIntercepted = async (requestUrl: string) => {
      let responded = false;
      let responsePromise: Promise<unknown> | undefined;
      fetchListener!({
        request: {
          method: "GET",
          url: requestUrl,
          mode: "no-cors",
          cache: "default",
          destination: "image",
          headers: new Map(),
        },
        waitUntil: () => undefined,
        respondWith: (p: Promise<unknown>) => {
          responded = true;
          responsePromise = p;
        },
      });
      if (responsePromise) await responsePromise;
      return responded;
    };

    expect(await checkIntercepted("https://qazmath.vercel.app/_next/image?url=%2Fapi%2Fimages%2F1.png")).toBe(false);
    expect(await checkIntercepted("https://qazmath.vercel.app/_next/image?url=https%3A%2F%2Fevil.example%2Fa.png")).toBe(false);
    expect(await checkIntercepted("https://qazmath.vercel.app/_next/image?url=%2Ficons%2Ficon-192.png")).toBe(true);
  });
});
