"use client";

import Icon from "@/components/ui/Icon";
import type { ReminderState } from "@/lib/push-reminders";
import { useStreakReminder } from "@/lib/use-streak-reminder";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

const DESCRIPTIONS: Record<Exclude<ReminderState, "unsupported">, MessageKey> = {
  off: "profile.reminder.off",
  on: "profile.reminder.on",
  denied: "profile.reminder.denied",
  install: "profile.reminder.install",
};

/** Profile switch for the daily streak reminder; hidden where the browser has no Web Push. */
export default function StreakReminderCard({ email }: { email: string }) {
  const { state, busy, error, enable, disable } = useStreakReminder(email, { sync: true });
  const { t } = useI18n();
  if (!state || state === "unsupported") return null;
  const on = state === "on";
  const switchable = state === "on" || state === "off";

  return (
    <section className="glass flex items-start gap-4 rounded-3xl border border-white/30 p-5 shadow-xl">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
        <Icon name="bell" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="streak-reminder-title" className="text-lg font-bold text-gray-900">{t("profile.reminder.title")}</h2>
        <p id="streak-reminder-description" className="text-sm text-gray-600">{t(DESCRIPTIONS[state])}</p>
        {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      </div>
      {switchable && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="streak-reminder-title"
          aria-describedby="streak-reminder-description"
          disabled={busy}
          onClick={() => void (on ? disable() : enable())}
          className={`relative mt-1 h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-purple-600" : "bg-gray-300"}`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${on ? "translate-x-7" : "translate-x-1"}`}
          />
        </button>
      )}
    </section>
  );
}
