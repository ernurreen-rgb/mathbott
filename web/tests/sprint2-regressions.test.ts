import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatCsvCell } from "@/app/admin/statistics/_components/format";
import { clearApiGetCache, fetchWithErrorHandling } from "@/lib/api/client";

describe("Sprint 2 frontend regressions", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearApiGetCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearApiGetCache();
    vi.restoreAllMocks();
  });

  it("H-48: clears short-lived GET cache after mutating requests", async () => {
    let version = 1;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        version = 2;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const first = await fetchWithErrorHandling<{ version: number }>("/api/backend/items");
    expect(first.data).toEqual({ version: 1 });
    expect(first.status).toBe(200);

    // Cached within 1.5s
    const cached = await fetchWithErrorHandling<{ version: number }>("/api/backend/items");
    expect(cached.data).toEqual({ version: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mutating write must invalidate GET cache
    const write = await fetchWithErrorHandling<{ ok: boolean }>("/api/backend/items", { method: "POST" });
    expect(write.data).toEqual({ ok: true });

    const fresh = await fetchWithErrorHandling<{ version: number }>("/api/backend/items");
    expect(fresh.data).toEqual({ version: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("H-48: returns clean error message (never '{}') and HTTP status on non-JSON 502", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("Bad Gateway", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "content-type": "text/plain" },
      })
    ) as unknown as typeof fetch;

    const result = await fetchWithErrorHandling("/api/backend/broken");
    expect(result.data).toBeNull();
    expect(result.status).toBe(502);
    expect(result.error).toContain("502");
    expect(result.error).not.toBe("{}");
  });

  it("H-48: respects caller-provided AbortSignal", async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("Aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    ) as unknown as typeof fetch;

    const pending = fetchWithErrorHandling("/api/backend/slow", {
      signal: controller.signal,
      timeoutMs: 30_000,
    });
    controller.abort();

    const result = await pending;
    expect(result.data).toBeNull();
    expect(result.error).toBe("Сұрау тоқтатылды");
  });

  it("H-49: escapes CSV formula injection including leading whitespace/control chars", () => {
    expect(formatCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(formatCsvCell("  =cmd|' /C calc'!A0")).toBe("'  =cmd|' /C calc'!A0");
    expect(formatCsvCell("\t+1+1")).toBe("'\t+1+1");
    expect(formatCsvCell(" \n@HYPERLINK(\"http://evil\")")).toBe("\"' \n@HYPERLINK(\"\"http://evil\"\")\"");
    // Numeric negative values remain numeric (not quoted with apostrophe)
    expect(formatCsvCell(-5)).toBe("-5");
    expect(formatCsvCell("Normal text")).toBe("Normal text");
  });
});
