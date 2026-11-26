// The theme choice: light, dark or "system" (the default: follow the device). It is remembered per
// browser in localStorage and applies only while signed in; signed-out visitors follow the system.
//
// The page gets `data-theme="light" | "dark"` on <html> twice: before the first paint by the inline
// script from themeInitScript() (app/layout.tsx), and afterwards by ThemeProvider whenever the
// choice, the system setting or the session changes. Both use the rules below.

/** Colour of the browser UI (theme-color meta): the brand purple, or the dark page top. */
export const THEME_COLOR = { light: "#7c3aed", dark: "#15121d" } as const;

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];
export const THEME_STORAGE_KEY = "qazmath.theme";
export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
/** The theme-color meta the script adds for an explicit choice (the media-specific ones stay). */
export const THEME_COLOR_META_ID = "qm-theme-color";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // Storage blocked (private mode, sandboxed frame).
  }
}

export function readThemePreference(storage: ReadableStorage | null = browserStorage()): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** "system" removes the key, so the default stays the default. */
export function saveThemePreference(preference: ThemePreference, storage: WritableStorage | null = browserStorage()): void {
  try {
    if (preference === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked storage: the choice still applies to this page.
  }
}

// NextAuth's JWT session cookie; "__Secure-" on HTTPS, ".0", ".1", ... when it is split in chunks.
const SESSION_COOKIE = /^(__Secure-)?next-auth\.session-token(\.\d+)?$/;

/** Whether the request carries a session: the server's hint for the script, before useSession knows. */
export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (SESSION_COOKIE.test(name)) return true;
  return false;
}

/** The choice that applies: a saved choice only counts while signed in. */
export function effectivePreference(preference: ThemePreference, signedIn: boolean): ThemePreference {
  return signedIn ? preference : "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function systemPrefersDark(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.(DARK_SCHEME_QUERY).matches;
  } catch {
    return false;
  }
}

/** Sets data-theme on <html> and, for an explicit choice, the browser UI colour. */
export function applyTheme(doc: Document, theme: ResolvedTheme, preference: ThemePreference): void {
  const root = doc.documentElement;
  if (root.getAttribute("data-theme") !== theme) root.setAttribute("data-theme", theme);
  let meta = doc.getElementById(THEME_COLOR_META_ID) as HTMLMetaElement | null;
  if (preference === "system") {
    meta?.remove();
    return;
  }
  if (!meta) {
    meta = doc.createElement("meta");
    meta.id = THEME_COLOR_META_ID;
    meta.name = "theme-color";
    // The first theme-color meta wins over the media-specific ones from the root layout.
    doc.head.insertBefore(meta, doc.head.firstChild);
  }
  meta.content = THEME_COLOR[theme];
}

/**
 * The inline script for the root layout: the same rules as above, in plain ES5, run before the
 * first paint. `signedIn` comes from the session cookie (the server knows it, the script cannot).
 */
export function themeInitScript(signedIn: boolean): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const query = JSON.stringify(DARK_SCHEME_QUERY);
  const metaId = JSON.stringify(THEME_COLOR_META_ID);
  const colors = JSON.stringify(THEME_COLOR);
  return (
    "(function(){try{var p='system';" +
    (signedIn ? `try{var s=localStorage.getItem(${key});if(s==='light'||s==='dark')p=s}catch(e){}` : "") +
    `var d=p==='dark'||(p==='system'&&!!(window.matchMedia&&window.matchMedia(${query}).matches));` +
    "var t=d?'dark':'light';document.documentElement.setAttribute('data-theme',t);" +
    "if(p!=='system'){var m=document.createElement('meta');" +
    `m.id=${metaId};m.name='theme-color';m.content=${colors}[t];` +
    "document.head.insertBefore(m,document.head.firstChild)}" +
    "}catch(e){}})()"
  );
}
