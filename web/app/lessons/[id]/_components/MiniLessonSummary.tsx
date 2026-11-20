"use client";

import Icon from "@/components/ui/Icon";

import StreakReminderPrompt from "./StreakReminderPrompt";
import { useI18n } from "@/lib/i18n/provider";

type Action = { label: string; onClick: () => void; disabled?: boolean };

type Props = {
  miniIndex: number;
  totalTasks: number;
  /** First-attempt mistakes; unknown until the server has counted the finished mini-lesson. */
  mistakes: number | null;
  pendingReview: number;
  primary: Action;
  onPrevTask: () => void;
  /** Null when the primary action already goes back to the section. */
  onBackToSection: (() => void) | null;
  /** Signed-in student: offers the daily streak reminder. */
  email?: string | null;
};

export default function MiniLessonSummary({
  miniIndex,
  totalTasks,
  mistakes,
  pendingReview,
  primary,
  onPrevTask,
  onBackToSection,
  email,
}: Props) {
  const { t } = useI18n();
  const firstTry = mistakes === null ? null : Math.max(0, totalTasks - mistakes);
  const share = firstTry === null || totalTasks === 0 ? null : Math.round((firstTry / totalTasks) * 100);
  const flawless = firstTry !== null && firstTry === totalTasks && totalTasks > 0;

  return (
    <div className="flex flex-col items-center py-4 text-center md:py-6">
      <span
        aria-hidden="true"
        className={`flex h-20 w-20 items-center justify-center rounded-full shadow-inner animate-pop-in motion-reduce:animate-none ${
          flawless ? "bg-amber-100 text-amber-500" : "bg-purple-100 text-purple-600"
        }`}
      >
        <Icon name={flawless ? "crown" : "trophy"} className="h-10 w-10" />
      </span>
      <h2 className="mt-4 text-2xl font-extrabold text-gray-900">{t("summary.miniDone", { n: miniIndex })}</h2>
      {flawless && <p className="mt-1 font-semibold text-amber-700">{t("summary.flawless")}</p>}

      <dl className="mt-5 grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("summary.tasks")}</dt>
          <dd className="mt-1 text-2xl font-extrabold text-gray-900">{totalTasks}</dd>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/80 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("summary.firstTry")}</dt>
          <dd className="mt-1 text-2xl font-extrabold text-green-700">
            {firstTry === null ? "—" : `${firstTry}/${totalTasks}`}
          </dd>
          {share !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${share}%` }} />
            </div>
          )}
        </div>
      </dl>

      {pendingReview > 0 && (
        <p className="mt-4 max-w-sm text-sm text-gray-700">
          {t("summary.pendingReview", { count: pendingReview })}
        </p>
      )}

      {/* Above the buttons, so a phone shows it without scrolling before "next" is tapped. */}
      {email && <StreakReminderPrompt email={email} />}

      <div className="mt-5 w-full max-w-sm space-y-2">
        <button
          type="button"
          onClick={primary.onClick}
          disabled={primary.disabled}
          className="h-12 w-full rounded-xl bg-purple-600 font-bold text-white hover:bg-purple-700 disabled:bg-gray-300 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          {primary.label} <Icon name="arrowRight" />
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onPrevTask}
            className="h-11 flex-1 rounded-xl bg-white/80 font-semibold text-gray-700 hover:bg-white inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon name="arrowLeft" /> {t("summary.lastTask")}
          </button>
          {onBackToSection && (
            <button
              type="button"
              onClick={onBackToSection}
              className="h-11 flex-1 rounded-xl bg-white/80 font-semibold text-gray-700 hover:bg-white transition-colors"
            >
              {t("lesson.backToSection")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
