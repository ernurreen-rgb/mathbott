import { describe, expect, it } from "vitest";

import { localeFromCookieString, normalizeLocale } from "@/lib/i18n/config";
import { messageTables, messages, type MessageKey } from "@/lib/i18n/messages";
import { translate } from "@/lib/i18n/translate";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("the student message tables", () => {
  it("define every key once", () => {
    const total = messageTables.reduce((sum, table) => sum + Object.keys(table).length, 0);
    expect(Object.keys(messages)).toHaveLength(total);
  });

  it("have both a Kazakh and a Russian text for every key", () => {
    for (const [key, [kk, ru]] of Object.entries(messages)) {
      expect(kk.trim(), key).not.toBe("");
      expect(ru.trim(), key).not.toBe("");
    }
  });

  it("use the same placeholders in both languages", () => {
    for (const [key, [kk, ru]] of Object.entries(messages)) {
      const expected = [...new Set(placeholders(kk))].sort();
      for (const form of ru.split("|")) {
        // A plural form may leave out {count} ("день|дня|дней" next to a number shown apart).
        const got = [...new Set(placeholders(form))].sort().filter((name) => name !== "count");
        expect(got, key).toEqual(expected.filter((name) => name !== "count"));
      }
    }
  });

  it("give Russian plurals exactly three forms and Kazakh none", () => {
    for (const [key, [kk, ru]] of Object.entries(messages)) {
      expect(kk.includes("|"), key).toBe(false);
      if (ru.includes("|")) expect(ru.split("|"), key).toHaveLength(3);
    }
  });
});

describe("translate", () => {
  it("fills placeholders", () => {
    expect(translate("ru", "journey.lessonN", { n: 4 })).toBe("Урок 4");
    expect(translate("kk", "journey.lessonN", { n: 4 })).toBe("Сабақ 4");
  });

  it("picks the Russian plural form by count", () => {
    const players = (count: number) => translate("ru", "quizPlay.playersCount", { count });
    expect(players(1)).toBe("1 игрок");
    expect(players(3)).toBe("3 игрока");
    expect(players(5)).toBe("5 игроков");
    expect(players(11)).toBe("11 игроков");
    expect(players(21)).toBe("21 игрок");
    expect(translate("kk", "quizPlay.playersCount", { count: 5 })).toBe("5 ойыншы");
  });

  it("answers with the key itself for an unknown key", () => {
    expect(translate("ru", "no.such.key" as MessageKey)).toBe("no.such.key");
  });
});

describe("the locale cookie", () => {
  it("defaults to Kazakh", () => {
    expect(localeFromCookieString("")).toBe("kk");
    expect(localeFromCookieString("other=1")).toBe("kk");
    expect(localeFromCookieString("qazmath_locale=en")).toBe("kk");
    expect(normalizeLocale(undefined)).toBe("kk");
  });

  it("reads Russian among other cookies", () => {
    expect(localeFromCookieString("a=1; qazmath_locale=ru; b=2")).toBe("ru");
  });
});
