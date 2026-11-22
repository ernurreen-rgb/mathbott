import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_FLAG_TTL_MS,
  forgetAdminFlag,
  knownAdminFlag,
  loadAdminFlag,
  rememberAdminFlag,
} from "@/lib/admin-flag";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const answer = (isAdmin: boolean) => vi.fn(async () => ({ data: { is_admin: isAdmin }, error: null }));

describe("the menu's admin check", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", memoryStorage());
    forgetAdminFlag();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the API once and answers later pages from memory", async () => {
    const check = answer(false);
    expect(await loadAdminFlag("Student@Example.com", check)).toBe(false);
    expect(await loadAdminFlag("student@example.com", check)).toBe(false);
    expect(knownAdminFlag("student@example.com")).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("shares one request between the two menus that mount together", async () => {
    const check = answer(true);
    const [desktop, mobile] = await Promise.all([
      loadAdminFlag("admin@example.com", check),
      loadAdminFlag("admin@example.com", check),
    ]);
    expect([desktop, mobile]).toEqual([true, true]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("keeps the answer across a reload of the tab", async () => {
    await loadAdminFlag("admin@example.com", answer(true));
    forgetMemoryOnly();
    const check = answer(false);
    expect(knownAdminFlag("admin@example.com")).toBeNull();
    expect(await loadAdminFlag("admin@example.com", check)).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it("asks again for another account and once the answer is old", async () => {
    let now = 1_000_000;
    await loadAdminFlag("admin@example.com", answer(true), () => now);

    const other = answer(false);
    expect(await loadAdminFlag("student@example.com", other, () => now)).toBe(false);
    expect(other).toHaveBeenCalledTimes(1);

    now += ADMIN_FLAG_TTL_MS;
    const later = answer(false);
    expect(await loadAdminFlag("student@example.com", later, () => now)).toBe(false);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("does not remember a failed check, so the next page asks again", async () => {
    const failing = vi.fn(async () => ({ data: null, error: "Network error" }));
    expect(await loadAdminFlag("admin@example.com", failing)).toBe(false);
    const thrown = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await loadAdminFlag("admin@example.com", thrown)).toBe(false);
    const check = answer(true);
    expect(await loadAdminFlag("admin@example.com", check)).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("takes an admin page's fresh answer over the remembered one", async () => {
    await loadAdminFlag("editor@example.com", answer(false));
    rememberAdminFlag("editor@example.com", true);
    expect(knownAdminFlag("editor@example.com")).toBe(true);
  });

  it("works without storage, as in a private window", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    const check = answer(true);
    expect(await loadAdminFlag("admin@example.com", check)).toBe(true);
    expect(await loadAdminFlag("admin@example.com", check)).toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("answers no without asking when nobody is signed in", async () => {
    const check = answer(true);
    expect(await loadAdminFlag(undefined, check)).toBe(false);
    expect(await loadAdminFlag("  ", check)).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
});

// A reload starts a fresh page: the in-memory answer is gone, sessionStorage stays.
function forgetMemoryOnly() {
  const saved = sessionStorage.getItem("qazmath.admin-flag");
  forgetAdminFlag();
  if (saved) sessionStorage.setItem("qazmath.admin-flag", saved);
}
