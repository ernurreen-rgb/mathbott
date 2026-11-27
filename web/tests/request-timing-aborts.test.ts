import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimingBatch, TimingReport } from "@/lib/request-timing";

// timedFetch() in a minimal browser: the page's requests never answer, so they end only when
// the page aborts them, and every batch the reporter sends is kept.
const API_URL = "https://qazmath.vercel.app/api/backend/trial-tests/5/draft";
let batches: TimingBatch[] = [];

function neverAnswers(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  batches = [];
  vi.stubGlobal("window", {
    location: { href: "https://qazmath.vercel.app/trial-test/5", pathname: "/trial-test/5" },
    setTimeout: (run: () => void, delay: number) => setTimeout(run, delay),
  });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => undefined });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal("PerformanceObserver", class { observe() {} });
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("client-timings")) {
      batches.push(JSON.parse(String(init?.body)));
      return Promise.resolve({ ok: true, status: 200 } as Response);
    }
    return neverAnswers(init);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function abortedAfter(waitMs: number, abort: (controller: AbortController) => void): Promise<void> {
  const { timedFetch } = await import("@/lib/request-timing");
  const controller = new AbortController();
  const request = timedFetch(API_URL, { method: "PUT", signal: controller.signal }).catch(() => undefined);
  await vi.advanceTimersByTimeAsync(waitMs);
  abort(controller);
  await request;
}

async function reports(): Promise<Pick<TimingReport, "kind" | "error" | "duration_ms">[]> {
  await vi.advanceTimersByTimeAsync(5000); // the reporter sends a few seconds after the first report
  return batches.flatMap((batch) => batch.reports).map(({ kind, error, duration_ms }) => ({ kind, error, duration_ms }));
}

describe("requests the page aborts", () => {
  it("are not failures when the page cancelled them: slow after a long wait, nothing after a short one", async () => {
    await abortedAfter(4100, (controller) => controller.abort());
    await abortedAfter(300, (controller) => controller.abort());
    expect(await reports()).toEqual([{ kind: "slow", error: "aborted", duration_ms: 4100 }]);
  });

  it("are failures when the page gave up because they took too long", async () => {
    const { abortAfterTimeout } = await import("@/lib/request-timing");
    await abortedAfter(20_000, abortAfterTimeout);
    // What AbortSignal.timeout() does: the request ends with a TimeoutError.
    await abortedAfter(45_000, (controller) => controller.abort(new DOMException("timed out", "TimeoutError")));
    expect(await reports()).toEqual([
      { kind: "failed", error: "aborted", duration_ms: 20_000 },
      { kind: "failed", error: "aborted", duration_ms: 45_000 },
    ]);
  });
});
