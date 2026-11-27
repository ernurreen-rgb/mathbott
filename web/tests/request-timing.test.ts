import { describe, expect, it, vi } from "vitest";

import {
  classifyRequest,
  connectionPhases,
  describeRequest,
  MAX_REPORTS_PER_BATCH,
  MAX_REPORTS_PER_PAGE,
  parseServerTiming,
  templateApiPath,
  templatePage,
  TimingReporter,
  type Observation,
  type TimingBatch,
} from "@/lib/request-timing";

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    url: "https://qazmath.vercel.app/api/backend/lessons/12?email=student%40example.com",
    method: "GET",
    startedAt: 1000,
    startedWall: Date.UTC(2026, 10, 20, 6, 48, 30),
    durationMs: 120,
    status: 200,
    error: null,
    serverTiming: null,
    wasHidden: false,
    page: "/lessons/12",
    ...overrides,
  };
}

describe("what a report may say about a request", () => {
  it("keeps only path templates: no ids, emails, tokens or query", () => {
    expect(templateApiPath("/api/backend/lessons/12?email=a@b.kz")).toBe("lessons/:id");
    expect(templateApiPath("https://qazmath.vercel.app/api/backend/user/web/a%40b.kz")).toBe("user/web/:email");
    expect(templateApiPath("https://api.example.com/api/quizzes/join/AbCdEfGhIjKlMnOpQrStUv")).toBe("quizzes/join/:token");
    expect(templateApiPath("/api/backend/presence/heartbeat?email=a@b.kz&path=/lessons/3")).toBe("presence/heartbeat");
    expect(templatePage("/lessons/12/review/40")).toBe("/lessons/:id/review/:id");
    expect(templatePage("/")).toBe("/");
  });

  it("reads the proxy's and the API's parts from Server-Timing", () => {
    expect(parseServerTiming("app;dur=12.3, api-cold, api;dur=40.4, proxy;dur=45.6, proxy-cold")).toEqual({
      app_ms: 12, api_ms: 40, proxy_ms: 46, api_cold: true, proxy_cold: true, db_prewarm: false, durations: {},
    });
    expect(parseServerTiming("app;dur=7, api;dur=20, proxy;dur=25")).toMatchObject({ proxy_cold: false, api_cold: false });
    expect(parseServerTiming(null)).toEqual({
      app_ms: null, api_ms: null, proxy_ms: null, api_cold: false, proxy_cold: false, db_prewarm: false, durations: {},
    });
    expect(parseServerTiming("proxy;dur=abc, junk")).toMatchObject({ proxy_ms: null });
  });

  it("keeps a cold API's phases and its database connections", () => {
    const header = "app;dur=950.2, api-cold, api-process;dur=410.6, api-import;dur=1012.3, api-startup;dur=3.1, " +
      "api-wait;dur=0.4, db-connect;dur=80.7, db-prewarm, api;dur=2490, proxy;dur=2500";
    expect(parseServerTiming(header)).toMatchObject({
      api_cold: true, db_prewarm: true,
      durations: { api_process_ms: 411, api_import_ms: 1012, api_startup_ms: 3, api_wait_ms: 0, db_connect_ms: 81 },
    });
    const report = describeRequest(observation({ durationMs: 3900, serverTiming: header }), "slow", null, {});
    expect(report.details).toEqual({
      api_cold: true, db_prewarm: true, api_process_ms: 411, api_import_ms: 1012, api_startup_ms: 3, api_wait_ms: 0,
      db_connect_ms: 81,
    });
  });
});

describe("which requests are reported", () => {
  const never = () => 0.99;
  const always = () => 0;

  it("reports failures, slow requests and a sample of the rest", () => {
    expect(classifyRequest(observation({ error: "network", status: null, durationMs: 50 }), never)).toBe("failed");
    expect(classifyRequest(observation({ status: 503 }), never)).toBe("failed");
    expect(classifyRequest(observation({ durationMs: 3000 }), never)).toBe("slow");
    expect(classifyRequest(observation({ durationMs: 2999 }), never)).toBeNull();
    expect(classifyRequest(observation({ durationMs: 200 }), () => 0.05)).toBe("sample");
  });

  it("counts a request the page cancelled as slow when it had waited long, and a timed-out one as failed", () => {
    expect(classifyRequest(observation({ error: "aborted", status: null, durationMs: 400 }), always)).toBeNull();
    expect(classifyRequest(observation({ error: "aborted", status: null, durationMs: 4100 }), never)).toBe("slow");
    expect(classifyRequest(observation({ error: "aborted", status: null, durationMs: 20_000, timedOut: true }), never))
      .toBe("failed");
  });

  it("does not sample the background heartbeat, but reports it when slow", () => {
    const heartbeat = "https://qazmath.vercel.app/api/backend/presence/heartbeat?email=a%40b.kz";
    expect(classifyRequest(observation({ url: heartbeat, method: "POST" }), always)).toBeNull();
    expect(classifyRequest(observation({ url: heartbeat, method: "POST", durationMs: 9000 }), never)).toBe("slow");
  });
});

describe("where the time went", () => {
  const entry = {
    startTime: 100, fetchStart: 100, domainLookupStart: 100, domainLookupEnd: 130, connectStart: 130,
    connectEnd: 230, secureConnectionStart: 160, requestStart: 240, responseStart: 3240, responseEnd: 3260,
    nextHopProtocol: "h2",
  };

  it("splits a request into its connection phases", () => {
    expect(connectionPhases(entry)).toEqual({
      total_ms: 3160, protocol: "h2", dns_ms: 30, connect_ms: 100, tls_ms: 70, reused_connection: false,
      queued_ms: 10, ttfb_ms: 3000, download_ms: 20,
    });
  });

  it("notices a reused connection and copes without details", () => {
    const reused = { ...entry, domainLookupStart: 100, domainLookupEnd: 100, connectStart: 100, connectEnd: 100,
      secureConnectionStart: 0, requestStart: 101 };
    expect(connectionPhases(reused)).toMatchObject({ reused_connection: true, dns_ms: 0, connect_ms: 0 });
    expect(connectionPhases({ ...entry, requestStart: 0 })).toEqual({ total_ms: 3160, protocol: "h2" });
    expect(connectionPhases(null)).toEqual({});
  });

  it("builds a report the API accepts", () => {
    const report = describeRequest(
      observation({ durationMs: 3400.6, serverTiming: "app;dur=31, api;dur=58, proxy;dur=64, proxy-cold" }),
      "slow",
      entry,
      { network: { effectiveType: "3g", rtt: 450, downlink: 0.7, saveData: false }, online: true,
        userAgent: "x".repeat(400) },
    );
    expect(report).toEqual({
      kind: "slow", method: "GET", path: "lessons/:id", page: "/lessons/:id", status: 200, error: null,
      duration_ms: 3401, ttfb_ms: 3000, proxy_ms: 64, api_ms: 58, app_ms: 31, was_hidden: false,
      effective_type: "3g", started_at: "2026-11-20T06:48:30.000Z",
      details: {
        total_ms: 3160, protocol: "h2", dns_ms: 30, connect_ms: 100, tls_ms: 70, reused_connection: false,
        queued_ms: 10, download_ms: 20, proxy_cold: true, rtt_ms: 450, downlink_mbps: 0.7, save_data: false,
        online: true, user_agent: "x".repeat(300),
      },
    });
    expect(JSON.stringify(report)).not.toContain("example.com");
  });
});

describe("sending reports", () => {
  function setup(sendResults: boolean[] = []) {
    const batches: TimingBatch[] = [];
    const timers: { run: () => void; delayMs: number }[] = [];
    const send = vi.fn(async (batch: TimingBatch) => {
      batches.push(batch);
      return sendResults.length ? sendResults.shift()! : true;
    });
    const reporter = new TimingReporter({
      send,
      describe: (item, kind) => describeRequest(item, kind, null, {}),
      random: () => 0.99,
      tabId: () => "tab-1",
      schedule: (run, delayMs) => void timers.push({ run, delayMs }),
    });
    const runTimers = async () => {
      const due = timers.splice(0);
      for (const timer of due) timer.run();
      await Promise.resolve();
      await Promise.resolve();
    };
    return { reporter, send, batches, timers, runTimers };
  }
  const slow = (index = 0) => observation({ durationMs: 3500 + index });

  it("waits a few seconds and sends what came in as one batch", async () => {
    const { reporter, send, batches, timers, runTimers } = setup();
    reporter.note(slow(1));
    reporter.note(observation({ durationMs: 80 }));
    reporter.note(slow(2));
    expect(send).not.toHaveBeenCalled();
    expect(timers.map((timer) => timer.delayMs)).toEqual([3000]);
    await runTimers();
    expect(send).toHaveBeenCalledTimes(1);
    expect(batches[0].tab_id).toBe("tab-1");
    expect(batches[0].reports.map((report) => report.duration_ms)).toEqual([3501, 3502]);
    expect(reporter.pending).toBe(0);
  });

  it("sends at once when a batch is full", async () => {
    const { reporter, send } = setup();
    for (let index = 0; index < MAX_REPORTS_PER_BATCH; index++) reporter.note(slow(index));
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].reports).toHaveLength(MAX_REPORTS_PER_BATCH);
  });

  it("tries a failed batch again later, then gives up", async () => {
    const { reporter, send, timers, runTimers } = setup([false, false, false]);
    reporter.note(slow());
    await runTimers();
    expect(timers.map((timer) => timer.delayMs)).toEqual([15_000]);
    await runTimers();
    expect(reporter.pending).toBe(1);
    await runTimers();
    expect(send).toHaveBeenCalledTimes(3);
    expect(reporter.pending).toBe(0);
    expect(timers).toHaveLength(0);
  });

  it("reports at most a fixed number per page", async () => {
    const { reporter, batches, runTimers } = setup();
    for (let index = 0; index < MAX_REPORTS_PER_PAGE + 30; index++) reporter.note(slow(index));
    await runTimers();
    for (let round = 0; round < 10; round++) await runTimers();
    expect(batches.reduce((total, batch) => total + batch.reports.length, 0)).toBe(MAX_REPORTS_PER_PAGE);
  });
});
