import { describe, expect, it } from "vitest";

import {
  isReminderPromptDue,
  parseReminderPromptRecord,
  REMINDER_MAX_SNOOZES,
  snoozeReminderPrompt,
} from "@/lib/reminder-prompt";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 19, 12);

describe("the streak reminder offer on the mini-lesson summary", () => {
  it("is offered to a student who was never asked", () => {
    expect(isReminderPromptDue(parseReminderPromptRecord(null), NOW)).toBe(true);
  });

  it("comes back three days after «Кейін», not the next summary", () => {
    const snoozed = snoozeReminderPrompt(parseReminderPromptRecord(null), NOW);
    expect(isReminderPromptDue(snoozed, NOW + DAY)).toBe(false);
    expect(isReminderPromptDue(snoozed, NOW + 3 * DAY)).toBe(true);
  });

  it("stops after three refusals", () => {
    let record = parseReminderPromptRecord(null);
    for (let refusal = 0; refusal < REMINDER_MAX_SNOOZES; refusal++) record = snoozeReminderPrompt(record, NOW);
    expect(isReminderPromptDue(record, NOW + 30 * DAY)).toBe(false);
  });

  it("gives students who hid the old offer for good one more chance", () => {
    const legacy = parseReminderPromptRecord("dismissed");
    expect(legacy).toEqual({ snoozes: 1, until: 0 });
    expect(isReminderPromptDue(legacy, NOW)).toBe(true);
  });

  it("treats a damaged record as never asked", () => {
    expect(parseReminderPromptRecord("{oops")).toEqual({ snoozes: 0, until: 0 });
    expect(parseReminderPromptRecord('{"snoozes":-2,"until":"soon"}')).toEqual({ snoozes: 0, until: 0 });
  });
});
