import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale, type Locale } from "./config";
import { translate, type MessageKey, type MessageParams } from "./translate";

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
}

export async function getServerT() {
  const locale = await getRequestLocale();
  return {
    locale,
    t: (key: MessageKey, params?: MessageParams) => translate(locale, key, params),
  };
}
