import { DEFAULT_LOCALE, localeFromCookieString, type Locale } from "./config";
import { messages, type MessageKey } from "./messages";

export type { MessageKey };
export type MessageParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: MessageParams) => string;

const pluralRules: Partial<Record<Locale, Intl.PluralRules>> = {};

/**
 * Russian plural forms are written as "one|few|many", e.g. "{count} задача|{count} задачи|{count} задач",
 * and picked by params.count. Kazakh nouns do not change after numbers, so its strings have one form.
 */
function pickPluralForm(text: string, locale: Locale, params?: MessageParams): string {
  if (!text.includes("|")) return text;
  const forms = text.split("|");
  const count = Number(params?.count);
  if (!Number.isFinite(count)) return forms[forms.length - 1];
  const rules = (pluralRules[locale] ??= new Intl.PluralRules(locale));
  const category = rules.select(Math.abs(count));
  if (category === "one") return forms[0];
  if (category === "few") return forms[1] ?? forms[forms.length - 1];
  return forms[2] ?? forms[forms.length - 1];
}

export function formatMessage(text: string, locale: Locale, params?: MessageParams): string {
  const chosen = pickPluralForm(text, locale, params);
  if (!params) return chosen;
  return chosen.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const entry = messages[key];
  if (!entry) return key;
  return formatMessage(locale === "ru" ? entry[1] : entry[0], locale, params);
}

let runtimeLocale: Locale = DEFAULT_LOCALE;

/** Set by the I18nProvider in the browser; never read during server rendering. */
export function setRuntimeLocale(locale: Locale): void {
  runtimeLocale = locale;
}

export function getRuntimeLocale(): Locale {
  return runtimeLocale;
}

/**
 * Translation for code outside React (API errors, toasts in helpers). Only call it in the browser,
 * after an event or effect: on the server it always answers in Kazakh. Components use useI18n().t.
 */
export const tr: Translate = (key, params) => translate(runtimeLocale, key, params);

/**
 * Translation in the viewer's own language (the cookie), ignoring LocaleOverride. For the few
 * messages a student sees on an admin page, such as "no access" before the redirect. Browser only.
 */
export const trViewer: Translate = (key, params) =>
  translate(localeFromCookieString(typeof document === "undefined" ? "" : document.cookie), key, params);
