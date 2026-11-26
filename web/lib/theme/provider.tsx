"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import {
  DARK_SCHEME_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  effectivePreference,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemePreference,
} from "./preference";

type ThemeContextValue = {
  /** What the student picked (also when it does not apply: signed out). */
  preference: ThemePreference;
  /** The theme on the page now. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const CHANGE_EVENT = "qazmath:theme-change";

// A choice made while storage is blocked still holds for this page.
let pagePreference: ThemePreference | null = null;
const getPreference = () => pagePreference ?? readThemePreference();
const getServerPreference = (): ThemePreference => "system";

function subscribePreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    pagePreference = null; // Another tab saved a choice: storage works and has the latest one.
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function subscribeSystem(onChange: () => void) {
  const query = window.matchMedia?.(DARK_SCHEME_QUERY);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

export function ThemeProvider({ initialSignedIn, children }: { initialSignedIn: boolean; children: React.ReactNode }) {
  const { status } = useSession();
  const signedIn = status === "loading" ? initialSignedIn : status === "authenticated";
  // The server renders "system" and no dark preference; the client value follows right after hydration.
  const preference = useSyncExternalStore(subscribePreference, getPreference, getServerPreference);
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false);
  const applied = effectivePreference(preference, signedIn);
  const theme = resolveTheme(applied, systemDark);

  useEffect(() => {
    // Read the sources again: while hydrating, the render above still holds the server values, and
    // the theme the inline script set before the first paint must not flicker back.
    const current = effectivePreference(getPreference(), signedIn);
    applyTheme(document, resolveTheme(current, systemPrefersDark()), current);
  }, [preference, systemDark, signedIn]);

  const setPreference = useCallback((next: ThemePreference) => {
    pagePreference = next;
    saveThemePreference(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
