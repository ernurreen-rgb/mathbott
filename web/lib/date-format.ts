const SHORT_MONTHS_KK = [
  "қаң.",
  "ақп.",
  "нау.",
  "сәу.",
  "мам.",
  "мау.",
  "шіл.",
  "там.",
  "қыр.",
  "қаз.",
  "қар.",
  "жел.",
] as const;

const SHORT_MONTHS_RU = [
  "янв.",
  "фев.",
  "мар.",
  "апр.",
  "мая",
  "июн.",
  "июл.",
  "авг.",
  "сен.",
  "окт.",
  "нояб.",
  "дек.",
] as const;

/** Parses API UTC timestamps ("YYYY-MM-DD HH:MM:SS" or ISO 8601 with/without timezone). */
export function parseApiTimestamp(value: string): Date {
  const trimmed = (value || "").trim();
  if (!trimmed) return new Date(NaN);
  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

/**
 * Formats a timestamp as e.g. "25 қар., 12:38" (kk) or "25 нояб., 12:38" (ru) in the viewer's
 * local time zone. Avoids Intl.DateTimeFormat("kk-KZ", { month: "short" }), which renders
 * placeholder month codes ("M11") in Chromium.
 */
export function formatShortDateTime(value: string, localeOrIntl: string, now: Date = new Date()): string {
  const date = parseApiTimestamp(value);
  if (Number.isNaN(date.getTime())) return value;

  const isRussian = localeOrIntl.toLowerCase().startsWith("ru");
  const months = isRussian ? SHORT_MONTHS_RU : SHORT_MONTHS_KK;
  const day = date.getDate();
  const month = months[date.getMonth()];
  const yearPart = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day} ${month}${yearPart}, ${hours}:${minutes}`;
}
