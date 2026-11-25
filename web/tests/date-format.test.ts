import { describe, expect, it } from "vitest";
import { formatShortDateTime, parseApiTimestamp } from "@/lib/date-format";

describe("formatShortDateTime", () => {
  it("formats Kazakh and Russian short dates without Chromium M01..M12 placeholders", () => {
    // Use an explicit local timestamp with offset so the expected wall clock is timezone-independent.
    const sample = "2026-11-25T12:38:00+05:00";
    const parsed = parseApiTimestamp(sample);
    const localDay = parsed.getDate();
    const localHours = String(parsed.getHours()).padStart(2, "0");
    const localMinutes = String(parsed.getMinutes()).padStart(2, "0");
    const sameYearNow = new Date(2026, 10, 25, 12, 0, 0);

    const kk = formatShortDateTime(sample, "kk-KZ", sameYearNow);
    const ru = formatShortDateTime(sample, "ru-RU", sameYearNow);

    expect(kk).toBe(`${localDay} қар., ${localHours}:${localMinutes}`);
    expect(ru).toBe(`${localDay} нояб., ${localHours}:${localMinutes}`);
    expect(kk).not.toMatch(/\bM\d{1,2}\b/);
  });

  it("includes the year for dates outside the current year and handles naive UTC strings", () => {
    const raw = "2025-05-09 07:05:00";
    const parsed = parseApiTimestamp(raw);
    expect(parsed.toISOString()).toBe("2025-05-09T07:05:00.000Z");

    const now2026 = new Date(2026, 10, 25, 12, 0, 0);
    const kk = formatShortDateTime(raw, "kk", now2026);
    const ru = formatShortDateTime(raw, "ru", now2026);
    expect(kk).toContain("мам. 2025, ");
    expect(ru).toContain("мая 2025, ");
  });

  it("falls back to the original string for invalid dates", () => {
    expect(formatShortDateTime("not-a-date", "kk-KZ")).toBe("not-a-date");
  });
});
