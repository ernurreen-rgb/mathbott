import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/provider";

const KEEP = "keep";
const NONE = "none";
const FIELD = "h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white placeholder:text-slate-400 focus:border-purple-300 focus:outline-none";

export interface QuizBulkBarProps {
  count: number;
  /** How many quizzes on this page can be selected, and whether all of them already are. */
  pageCount: number;
  pageSelected: boolean;
  topics: string[];
  busy: boolean;
  onTogglePage: () => void;
  onApply: (change: { grade?: number | null; topic?: string }) => void;
  onCancel: () => void;
}

/** Floating bar of the catalog's selection mode: one grade and/or topic for every picked quiz. */
export default function QuizBulkBar({ count, pageCount, pageSelected, topics, busy, onTogglePage, onApply, onCancel }: QuizBulkBarProps) {
  const { t } = useI18n();
  const [grade, setGrade] = useState(KEEP);
  const [topic, setTopic] = useState("");
  const change = {
    ...(grade === KEEP ? {} : { grade: grade === NONE ? null : Number(grade) }),
    ...(topic.trim() ? { topic: topic.trim() } : {}),
  };
  const ready = count > 0 && Object.keys(change).length > 0 && !busy;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-5 md:left-64 md:px-6">
      <form
        onSubmit={(event) => { event.preventDefault(); if (ready) onApply(change); }}
        aria-label={t("catalog.bulkAria")}
        className="pointer-events-auto relative mx-auto grid max-w-4xl gap-2 rounded-2xl bg-slate-900 p-3 text-white shadow-2xl sm:flex sm:flex-wrap sm:items-center"
      >
        {/* Phone: three stacked lines with the close button in the corner. Wider: one line. */}
        <div className="flex min-h-[2.5rem] items-center gap-2 pr-10 sm:mr-auto sm:pr-0">
          <span role="status" className="px-1 text-sm font-bold tabular-nums">{t("catalog.selected", { count })}</span>
          {pageCount > 0 && (
            <button type="button" onClick={onTogglePage} className="rounded-lg px-2 py-1 text-left text-sm font-semibold text-purple-200 hover:bg-white/10">
              {pageSelected ? t("catalog.unselectPage") : t("catalog.selectPage", { count: pageCount })}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select value={grade} onChange={(event) => setGrade(event.target.value)} aria-label={t("catalog.grade")} className={`${FIELD} min-w-0 [&>option]:text-slate-900`}>
            <option value={KEEP}>{t("catalog.gradeKeep")}</option>
            {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{t("catalog.gradeN", { n: g })}</option>)}
            <option value={NONE}>{t("catalog.noGrade")}</option>
          </select>
          <input
            type="text"
            list="quiz-bulk-topics"
            maxLength={80}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t("catalog.topicKeep")}
            aria-label={t("catalog.topic")}
            className={`${FIELD} min-w-0 sm:w-56`}
          />
          <datalist id="quiz-bulk-topics">
            {topics.map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>
        <button type="submit" disabled={!ready} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-purple-500 px-4 text-sm font-bold text-white transition-colors hover:bg-purple-400 disabled:opacity-40 disabled:hover:bg-purple-500">
          <Icon name={busy ? "loader" : "check"} className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {t("catalog.apply")}
        </button>
        <button type="button" onClick={onCancel} aria-label={t("catalog.closeSelection")} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white sm:static">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
