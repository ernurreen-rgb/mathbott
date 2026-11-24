/** "2026-11-24 18:05:00" (UTC, as the API stores it) in the viewer's language and time zone. */
export function formatCollectionDate(value: string, intlLocale: string): string {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
