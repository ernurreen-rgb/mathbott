"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { INTL_LOCALE, isLocale, writeLocaleCookie, type Locale } from "./config";
import { setRuntimeLocale, translate, type Translate } from "./translate";
import { getUserLanguage, updateUserLanguage } from "@/lib/api/user";

interface I18nValue {
  locale: Locale;
  /** Intl tag for dates and numbers: "kk-KZ" or "ru-RU". */
  intlLocale: string;
  t: Translate;
  /** Switches the language, remembers it in a cookie and, for a signed-in student, in the profile. */
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

function useI18nValue(locale: Locale, setLocale: (locale: Locale) => void): I18nValue {
  return useMemo(
    () => ({
      locale,
      intlLocale: INTL_LOCALE[locale],
      t: (key, params) => translate(locale, key, params),
      setLocale,
    }),
    [locale, setLocale]
  );
}

const SYNCED_KEY = "qazmath_locale_synced";

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const email = session?.user?.email?.trim().toLowerCase() || "";
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const localeRef = useRef(locale);

  // Set during render so helpers called while rendering (and before any effect) already see it.
  if (typeof window !== "undefined") setRuntimeLocale(locale);

  const applyLocale = useCallback(
    (next: Locale) => {
      if (next === localeRef.current) return;
      localeRef.current = next;
      writeLocaleCookie(next);
      setRuntimeLocale(next);
      setLocaleState(next);
      document.documentElement.lang = next;
      // Server-rendered parts (the page title) read the cookie.
      router.refresh();
    },
    [router]
  );

  const setLocale = useCallback(
    (next: Locale) => {
      applyLocale(next);
      if (email) {
        try {
          sessionStorage.setItem(SYNCED_KEY, email);
        } catch {}
        void updateUserLanguage(email, next);
      }
    },
    [applyLocale, email]
  );

  // Once per browser session: a language saved in the profile follows the student to this device,
  // and a language picked before signing in (on /join) is saved to the profile.
  useEffect(() => {
    if (status !== "authenticated" || !email) return;
    try {
      if (sessionStorage.getItem(SYNCED_KEY) === email) return;
    } catch {}
    let cancelled = false;
    void getUserLanguage(email).then(({ data, error }) => {
      if (cancelled || error) return;
      try {
        sessionStorage.setItem(SYNCED_KEY, email);
      } catch {}
      if (isLocale(data)) applyLocale(data);
      else if (localeRef.current !== "kk") void updateUserLanguage(email, localeRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [status, email, applyLocale]);

  const value = useI18nValue(locale, setLocale);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const noop = () => {};

/** Pins a subtree to one language: the admin panel is not translated yet. */
export function LocaleOverride({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const parent = useContext(I18nContext);
  const parentLocale = parent?.locale;
  if (typeof window !== "undefined") setRuntimeLocale(locale);

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.lang;
    html.lang = locale;
    setRuntimeLocale(locale);
    return () => {
      html.lang = previous;
      if (parentLocale) setRuntimeLocale(parentLocale);
    };
  }, [locale, parentLocale]);

  const value = useI18nValue(locale, noop);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

const fallback: I18nValue = {
  locale: "kk",
  intlLocale: INTL_LOCALE.kk,
  t: (key, params) => translate("kk", key, params),
  setLocale: noop,
};

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? fallback;
}
