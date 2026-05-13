import { describe, expect, it } from "@jest/globals";

import { getProfileWeekActivityDaysSet } from "../week-activity";

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("week activity helpers", () => {
  it("marks solved days from the current local week instead of rebuilding them from streak", () => {
    const monday = new Date(2026, 2, 16, 12, 0, 0);
    const wednesday = new Date(2026, 2, 18, 12, 0, 0);
    const previousSunday = new Date(2026, 2, 15, 12, 0, 0);
    const nextMonday = new Date(2026, 2, 23, 12, 0, 0);

    const result = getProfileWeekActivityDaysSet({
      recentActivityTimestamps: [
        monday.toISOString(),
        wednesday.toISOString(),
        previousSunday.toISOString(),
        nextMonday.toISOString(),
      ],
      streak: 1,
      lastStreakDate: formatLocalDate(wednesday),
      now: wednesday,
    });

    expect(Array.from(result).sort()).toEqual([monday.getDay(), wednesday.getDay()].sort());
  });

  it("does not fall back to streak when the API explicitly reports no activity this week", () => {
    const now = new Date(2026, 2, 18, 12, 0, 0);

    const result = getProfileWeekActivityDaysSet({
      recentActivityTimestamps: [],
      streak: 4,
      lastStreakDate: formatLocalDate(now),
      now,
    });

    expect(Array.from(result)).toEqual([]);
  });

  it("keeps the legacy streak-based rendering only when activity timestamps are unavailable", () => {
    const wednesday = new Date(2026, 2, 18, 12, 0, 0);

    const result = getProfileWeekActivityDaysSet({
      streak: 2,
      lastStreakDate: formatLocalDate(wednesday),
      now: wednesday,
    });

    expect(Array.from(result).sort()).toEqual([2, 3]);
  });
});
