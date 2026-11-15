"use client";

import { useEffect, useState } from "react";

import Icon from "@/components/ui/Icon";
import { useStreakReminder } from "@/lib/use-streak-reminder";

const DISMISSED_KEY = "qm_streak_reminder_prompt";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "dismissed";
  } catch {
    return false;
  }
}

/**
 * Offered once on the mini-lesson summary, the moment a student has just kept the streak going.
 * Only shown while the browser has never asked for notifications; "Кейін" hides it for good.
 * The profile switch stays available either way.
 */
export default function StreakReminderPrompt({ email }: { email: string }) {
  const { state, busy, error, enable } = useStreakReminder(email);
  const [visible, setVisible] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (state === null) return;
    const neverAsked = typeof Notification !== "undefined" && Notification.permission === "default";
    setVisible(state === "off" && neverAsked && !wasDismissed());
  }, [state]);

  if (enabled) {
    return (
      <p role="status" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700">
        <Icon name="checkCircle" /> Еске салу қосылды
      </p>
    );
  }
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "dismissed");
    } catch {
      // Private mode: it simply shows again next time.
    }
    setVisible(false);
  };

  return (
    <div className="mt-5 w-full max-w-sm rounded-2xl border border-orange-200 bg-white/85 p-4 text-left">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Icon name="bell" className="h-5 w-5" />
        </span>
        <p className="text-sm text-gray-800">
          <span className="block font-bold text-gray-900">Серия үзілмесін</span>
          Есеп шығармаған күні кешке еске салайық па?
        </p>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable().then((ok) => setEnabled(ok))}
          className="h-10 flex-1 rounded-xl bg-orange-500 font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          Қосу
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="h-10 flex-1 rounded-xl bg-gray-100 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
        >
          Кейін
        </button>
      </div>
    </div>
  );
}
