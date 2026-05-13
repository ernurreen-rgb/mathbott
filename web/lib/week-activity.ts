const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SPACE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const ISO_NO_TZ_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const TZ_SUFFIX_RE = /(Z|[+-]\d{2}:\d{2})$/i;

function parseUtcTimestamp(value: string): Date | null {
  const raw = value.trim();
  if (!raw) {
    return null;
  }

  let normalized = raw;
  if (SPACE_TIMESTAMP_RE.test(raw)) {
    normalized = `${raw.replace(" ", "T")}Z`;
  } else if (ISO_NO_TZ_RE.test(raw)) {
    normalized = `${raw}Z`;
  } else if (!TZ_SUFFIX_RE.test(raw) && DATE_ONLY_RE.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    const parsedLocalDate = new Date(year, month - 1, day);
    return Number.isNaN(parsedLocalDate.getTime()) ? null : parsedLocalDate;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCurrentLocalWeekRange(now: Date): { weekStart: Date; nextWeekStart: Date } {
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);

  const dayOffsetFromMonday = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - dayOffsetFromMonday);

  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  return { weekStart, nextWeekStart };
}

function getLegacyStreakDaysSet(
  streak: number | null | undefined,
  lastStreakDate: string | null | undefined,
  now: Date,
): Set<number> {
  const streakDaysSet = new Set<number>();
  const daysToMark = Math.min(Math.max(Number(streak || 0), 0), 7);

  if (daysToMark <= 0) {
    return streakDaysSet;
  }

  const lastStreakDay = lastStreakDate ? parseUtcTimestamp(lastStreakDate) : null;
  const baseWeekDay = (lastStreakDay ?? now).getDay();
  for (let i = 0; i < daysToMark; i += 1) {
    streakDaysSet.add((baseWeekDay - i + 7) % 7);
  }

  return streakDaysSet;
}

export function getProfileWeekActivityDaysSet({
  recentActivityTimestamps,
  streak,
  lastStreakDate,
  now = new Date(),
}: {
  recentActivityTimestamps?: string[] | null;
  streak?: number | null;
  lastStreakDate?: string | null;
  now?: Date;
}): Set<number> {
  if (Array.isArray(recentActivityTimestamps)) {
    const { weekStart, nextWeekStart } = getCurrentLocalWeekRange(now);
    const activeWeekDays = new Set<number>();

    for (const timestamp of recentActivityTimestamps) {
      const parsed = parseUtcTimestamp(timestamp);
      if (!parsed) {
        continue;
      }
      if (parsed >= weekStart && parsed < nextWeekStart) {
        activeWeekDays.add(parsed.getDay());
      }
    }

    return activeWeekDays;
  }

  return getLegacyStreakDaysSet(streak, lastStreakDate, now);
}
