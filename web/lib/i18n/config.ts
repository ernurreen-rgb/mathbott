/** Student interface languages. The admin panel stays Kazakh (see app/admin/layout.tsx). */
export type Locale = "kk" | "ru";

export const LOCALES: readonly Locale[] = ["kk", "ru"];
export const DEFAULT_LOCALE: Locale = "kk";
export const LOCALE_COOKIE = "qazmath_locale";
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Each language is named in itself, so a student who cannot read the current one still finds theirs. */
export const LOCALE_LABELS: Record<Locale, string> = { kk: "Қазақша", ru: "Русский" };

/** BCP 47 tags for Intl date and number formatting. */
export const INTL_LOCALE: Record<Locale, string> = { kk: "kk-KZ", ru: "ru-RU" };

export function isLocale(value: unknown): value is Locale {
  return value === "kk" || value === "ru";
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Reads the locale from a Cookie header or document.cookie string. */
export function localeFromCookieString(cookies: string | null | undefined): Locale {
  if (!cookies) return DEFAULT_LOCALE;
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return normalizeLocale(decodeURIComponent(rest.join("=")));
  }
  return DEFAULT_LOCALE;
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}
