import { describe, expect, it, vi } from "vitest";

import { WARM_UP_INTERVAL_MS, WARM_UP_STORAGE_KEY, warmUpScript } from "@/lib/warm-up";

/** Runs the inline script the way a browser would, with the globals it touches. */
function runScript(now: number, storage: Map<string, string> | null) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
  const sessionStorage = storage
    ? { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => void storage.set(key, value) }
    : {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      };
  const date = { now: () => now };
  new Function("fetch", "sessionStorage", "Date", warmUpScript("/api/backend/health"))(fetchMock, sessionStorage, date);
  return fetchMock;
}

describe("waking the API while the page loads", () => {
  it("asks the health check once, without cookies", () => {
    const storage = new Map<string, string>();
    const fetchMock = runScript(1_000_000, storage);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/backend/health", { cache: "no-store", credentials: "omit" });
    expect(storage.get(WARM_UP_STORAGE_KEY)).toBe("1000000");
  });

  it("does not ask again from the same tab within the interval", () => {
    const storage = new Map<string, string>();
    runScript(1_000_000, storage);
    expect(runScript(1_000_000 + WARM_UP_INTERVAL_MS - 1, storage)).not.toHaveBeenCalled();
    expect(runScript(1_000_000 + WARM_UP_INTERVAL_MS, storage)).toHaveBeenCalledTimes(1);
  });

  it("still wakes the API when storage is blocked, and never throws", () => {
    expect(runScript(5, null)).toHaveBeenCalledTimes(1);
    expect(() =>
      new Function("fetch", "sessionStorage", "Date", warmUpScript("/x"))(
        () => {
          throw new Error("no fetch");
        },
        null,
        { now: () => 1 },
      ),
    ).not.toThrow();
  });

  it("keeps the URL a plain string in the script", () => {
    expect(warmUpScript('/a"b')).toContain('fetch("/a\\"b"');
  });
});
