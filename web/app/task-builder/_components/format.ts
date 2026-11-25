import { formatShortDateTime } from "@/lib/date-format";

/** "2026-11-24 18:05:00" (UTC, as the API stores it) in the viewer's language and time zone. */
export function formatCollectionDate(value: string, intlLocale: string): string {
  return formatShortDateTime(value, intlLocale);
}
