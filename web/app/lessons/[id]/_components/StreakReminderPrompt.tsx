"use client";

import { useEffect, useRef, useState } from "react";

import Icon from "@/components/ui/Icon";
import { recordReminderPromptEvent, type ReminderPromptAction } from "@/lib/api";
import type { ReminderState } from "@/lib/push-reminders";
import {
  isReminderPromptDue,
  readReminderPromptRecord,
  snoozeReminderPrompt,
  writeReminderPromptRecord,
} from "@/lib/reminder-prompt";
import { useStreakReminder } from "@/lib/use-streak-reminder";

// enable: the browser can ask for notifications; install: an iPhone or iPad, where Web Push only
// works once QazMath is added to the home screen.
type Offer = "enable" | "install";

function offerFor(state: ReminderState): Offer | null {
  if (state === "install") return "install";
  if (state === "off" && typeof Notification !== "undefined" && Notification.permission === "default") return "enable";
  return null;
}

/**
 * The daily streak reminder, offered on the mini-lesson summary, the moment a student has just kept
 * the streak going. "Кейін" puts it off for a few days (lib/reminder-prompt.ts). What the device
 * could do and what the student chose are recorded, to see how many students can get reminders at all.
 * The profile switch stays available either way.
 */
export default function StreakReminderPrompt({ email }: { email: string }) {
  const { state, busy, error, enable } = useStreakReminder(email);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [enabled, setEnabled] = useState(false);
  // The device's state when the summary appeared; turning reminders on changes `state` later.
  const deviceState = useRef<ReminderState | null>(null);

  const report = (action: ReminderPromptAction) => {
    if (deviceState.current) void recordReminderPromptEvent(email, deviceState.current, action);
  };

  useEffect(() => {
    if (state === null || deviceState.current !== null) return;
    deviceState.current = state;
    report("seen");
    const next = offerFor(state);
    if (next && isReminderPromptDue(readReminderPromptRecord(), Date.now())) {
      setOffer(next);
      report("offered");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (enabled) {
    return (
      <p role="status" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
        <Icon name="checkCircle" /> Еске салу қосылды
      </p>
    );
  }
  if (!offer) return null;

  const snooze = () => {
    writeReminderPromptRecord(snoozeReminderPrompt(readReminderPromptRecord(), Date.now()));
    report("snoozed");
    setOffer(null);
  };

  const turnOn = async () => {
    const ok = await enable();
    report(ok ? "enabled" : "failed");
    setEnabled(ok);
  };

  return (
    <section
      aria-labelledby="streak-reminder-offer-title"
      className="mt-5 w-full max-w-sm rounded-2xl border border-orange-200 bg-white/85 p-4 text-left"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Icon name="bell" className="h-5 w-5" />
        </span>
        <p className="text-sm text-gray-800">
          <span id="streak-reminder-offer-title" className="block font-bold text-gray-900">Серия үзілмесін</span>
          {offer === "enable"
            ? "Есеп шығармаған күні кешке еске салайық па?"
            : "iPhone-да еске салу басты экранға қосылған QazMath-та ғана келеді: Бөлісу → «Басты экранға», содан кейін сол жерден ашып, еске салуды қосыңыз."}
        </p>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        {offer === "enable" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void turnOn()}
            className="h-10 flex-1 rounded-xl bg-orange-500 font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
          >
            Қосу
          </button>
        )}
        <button
          type="button"
          onClick={snooze}
          className="h-10 flex-1 rounded-xl bg-gray-100 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
        >
          {offer === "enable" ? "Кейін" : "Түсіндім"}
        </button>
      </div>
    </section>
  );
}
