// When the mini-lesson summary offers the daily streak reminder. "Кейін" puts the offer off for a few
// days instead of for good, and after a few refusals it stops; the profile switch always stays.

export const REMINDER_PROMPT_KEY = "qm_streak_reminder_prompt";
export const REMINDER_SNOOZE_DAYS = 3;
export const REMINDER_MAX_SNOOZES = 3;

export type ReminderPromptRecord = { snoozes: number; until: number };

const NONE: ReminderPromptRecord = { snoozes: 0, until: 0 };

/** Reads the stored record. The old value "dismissed" (hidden for good) counts as one refusal now over. */
export function parseReminderPromptRecord(raw: string | null): ReminderPromptRecord {
  if (!raw) return NONE;
  if (raw === "dismissed") return { snoozes: 1, until: 0 };
  try {
    const value = JSON.parse(raw) as Partial<ReminderPromptRecord>;
    const snoozes = Number.isInteger(value.snoozes) && value.snoozes! > 0 ? value.snoozes! : 0;
    const until = typeof value.until === "number" && Number.isFinite(value.until) ? value.until : 0;
    return { snoozes, until };
  } catch {
    return NONE;
  }
}

export function isReminderPromptDue(record: ReminderPromptRecord, now: number): boolean {
  return record.snoozes < REMINDER_MAX_SNOOZES && now >= record.until;
}

export function snoozeReminderPrompt(record: ReminderPromptRecord, now: number): ReminderPromptRecord {
  return { snoozes: record.snoozes + 1, until: now + REMINDER_SNOOZE_DAYS * 24 * 60 * 60 * 1000 };
}

export function readReminderPromptRecord(): ReminderPromptRecord {
  try {
    return parseReminderPromptRecord(localStorage.getItem(REMINDER_PROMPT_KEY));
  } catch {
    return NONE;
  }
}

export function writeReminderPromptRecord(record: ReminderPromptRecord): void {
  try {
    localStorage.setItem(REMINDER_PROMPT_KEY, JSON.stringify(record));
  } catch {
    // Private mode: the offer simply comes back on the next summary.
  }
}
