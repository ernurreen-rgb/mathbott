// Whether the signed-in user is an admin, asked once per tab instead of on every page.
//
// Every page renders its own menu, and the menu only needs this to decide whether to show the
// "Admin" link; for students the answer is always "no". So the answer is kept for a while in
// memory (shared by the desktop and mobile menus) and in sessionStorage (kept across reloads of
// the tab). It grants nothing: admin pages check their access fresh through useAdminPageAccess,
// and the API checks the role on every admin request.

export const ADMIN_FLAG_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "qazmath.admin-flag";

type Remembered = { email: string; isAdmin: boolean; checkedAt: number };
type Check = (email: string) => Promise<{ data: { is_admin?: boolean } | null; error: string | null }>;

let memo: Remembered | null = null;
let pending: { email: string; promise: Promise<boolean> } | null = null;

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

function fresh(entry: Remembered | null, email: string, now: number): entry is Remembered {
  return Boolean(entry && entry.email === email && now - entry.checkedAt >= 0 && now - entry.checkedAt < ADMIN_FLAG_TTL_MS);
}

function readStored(): Remembered | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.email !== "string" || typeof parsed?.isAdmin !== "boolean" || typeof parsed?.checkedAt !== "number") {
      return null;
    }
    return { email: parsed.email, isAdmin: parsed.isAdmin, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

/** The answer already in memory, without touching storage: safe for a component's first render. */
export function knownAdminFlag(email: string | null | undefined, now = Date.now()): boolean | null {
  const key = normalizeAdminEmail(email);
  return key && fresh(memo, key, now) ? memo.isAdmin : null;
}

/** Keep an answer that some other check (an admin page's own) just got from the API. */
export function rememberAdminFlag(email: string | null | undefined, isAdmin: boolean, now = Date.now()): void {
  const key = normalizeAdminEmail(email);
  if (!key) return;
  memo = { email: key, isAdmin, checkedAt: now };
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(memo));
  } catch {
    // Private mode or storage turned off: the in-memory answer still covers this tab's pages.
  }
}

export function forgetAdminFlag(): void {
  memo = null;
  pending = null;
  try {
    globalThis.sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
}

/**
 * The remembered answer, or one request to the API when there is none. Both menus mount together,
 * so they share one request. A failed request answers "no" and is not remembered: the next page asks again.
 */
export function loadAdminFlag(email: string | null | undefined, check: Check, now = Date.now): Promise<boolean> {
  const key = normalizeAdminEmail(email);
  if (!key) return Promise.resolve(false);
  if (fresh(memo, key, now())) return Promise.resolve(memo.isAdmin);
  const stored = readStored();
  if (fresh(stored, key, now())) {
    memo = stored;
    return Promise.resolve(stored.isAdmin);
  }
  if (pending?.email === key) return pending.promise;

  const promise = check(key)
    .then(({ data, error }) => {
      if (error || !data) return false;
      const isAdmin = Boolean(data.is_admin);
      rememberAdminFlag(key, isAdmin, now());
      return isAdmin;
    })
    .catch(() => false)
    .finally(() => {
      if (pending?.promise === promise) pending = null;
    });
  pending = { email: key, promise };
  return promise;
}
