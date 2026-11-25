"use client";

import type { ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey, Translate } from "@/lib/i18n/translate";

/** correct/wrong: checked in this visit; solved: completed earlier, opened again. */
export type LessonVerdict = "correct" | "wrong" | "solved";

const PRAISE: MessageKey[] = ["footer.praise.0", "footer.praise.1", "footer.praise.2", "footer.praise.3"];

type Props = {
  taskId: number;
  questionType?: string;
  verdict: LessonVerdict | null;
  /** Right answer to show after a wrong check: option texts or the raw stored answer. */
  correctMath?: string[];
  correctText?: string | null;
  /** The check itself failed (network, rate limit): not a verdict on the answer. */
  errorText?: string | null;
  hasPrev: boolean;
  canGoNext: boolean;
  /** True/false tasks submit on tap, so they have no check button. */
  showCheck: boolean;
  checkDisabled: boolean;
  checking: boolean;
  /** Main button after a check; "Келесі" unless the page has a better word for the next step. */
  nextLabel?: string;
  /** One short line under the verdict, e.g. "Бұл қате түзетілді." */
  detail?: ReactNode;
  onCheck: () => void;
  onNext: () => void;
  onPrev?: () => void;
  /** Without it there is no "Шағым" button (mistake review twins cannot be reported). */
  onReport?: () => void;
};

const formatStoredAnswer = (value: string, t: Translate, questionType?: string): string => {
  const trimmed = value.trim();
  if (questionType === "tf") {
    const lowered = trimmed.toLowerCase();
    if (lowered === "true" || lowered === "1") return `\\text{${t("footer.tfTrue")}}`;
    if (lowered === "false" || lowered === "0") return `\\text{${t("footer.tfFalse")}}`;
  }
  if (
    (questionType === "select" || questionType === "mcq" || questionType === "mcq6" || questionType === "context") &&
    trimmed.startsWith("[")
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).join(", ");
    } catch {
      // Not JSON: show it as stored.
    }
  }
  return trimmed;
};

export default function LessonTaskFooter({
  taskId,
  questionType,
  verdict,
  correctMath = [],
  correctText,
  errorText,
  hasPrev,
  canGoNext,
  showCheck,
  checkDisabled,
  checking,
  nextLabel: nextLabelProp,
  detail,
  onCheck,
  onNext,
  onPrev,
  onReport,
}: Props) {
  const { t } = useI18n();
  const nextLabel = nextLabelProp ?? t("common.next");
  if (verdict === null) {
    return (
      <div className="shrink-0 rounded-b-3xl border-t border-white/60 bg-white/50 px-4 py-3 md:px-6 md:py-4">
        {errorText && (
          <p role="alert" className="mb-2 text-sm font-semibold text-amber-800">
            <Icon name="alert" className="mr-1.5" />
            {errorText}
          </p>
        )}
        {/*
          The full row (Алдыңғы, Шағым, Тексеру) only fits from lg up next to the desktop nav.
          Below lg the check button takes its own full-width line above the back and report buttons.
        */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 md:gap-y-3">
          {hasPrev && onPrev ? (
            <button
              type="button"
              onClick={onPrev}
              className="order-2 lg:order-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-3 sm:px-4 rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <Icon name="arrowLeft" /> {t("footer.prev")}
            </button>
          ) : (
            <div className="hidden lg:inline-flex lg:order-1 invisible py-2 px-3 sm:px-4 font-bold items-center gap-1.5 select-none" aria-hidden="true">
              <Icon name="arrowLeft" /> {t("footer.prev")}
            </div>
          )}
          {onReport && (
            <button
              type="button"
              onClick={onReport}
              className="order-3 lg:order-2 ml-auto lg:ml-0 min-h-10 inline-flex items-center gap-1.5 text-amber-700 hover:bg-orange-50 text-sm font-semibold py-2 px-3 sm:px-4 rounded-lg transition-colors"
            >
              <Icon name="report" /> {t("footer.report")}
            </button>
          )}
          {showCheck ? (
            <button
              type="button"
              onClick={onCheck}
              disabled={checkDisabled || checking}
              className="order-1 lg:order-3 w-full lg:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 lg:py-2 px-4 sm:px-5 rounded-xl inline-flex items-center justify-center transition-colors"
            >
              {checking ? t("review.checking") : t("review.check")}
            </button>
          ) : (
            <div className="hidden lg:inline-flex lg:order-3 invisible py-2 px-4 sm:px-5 font-bold items-center select-none" aria-hidden="true">
              {t("review.check")}
            </div>
          )}
        </div>
      </div>
    );
  }

  const wrong = verdict === "wrong";
  const title = wrong ? t("lesson.wrong") : verdict === "solved" ? t("footer.solvedBefore") : t(PRAISE[taskId % PRAISE.length]);
  const shownText = correctMath.length === 0 && correctText ? formatStoredAnswer(correctText, t, questionType) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`shrink-0 rounded-b-3xl border-t-2 px-4 pb-4 pt-3 md:px-6 animate-slide-up motion-reduce:animate-none ${
        wrong ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white animate-pop-in motion-reduce:animate-none ${
            wrong ? "bg-red-600" : "bg-green-600"
          }`}
        >
          <Icon name={wrong ? "close" : "check"} variant="outline" className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-lg font-extrabold leading-10 ${wrong ? "text-red-700" : "text-green-700"}`}>{title}</div>
          {wrong && (correctMath.length > 0 || shownText) && (
            <div className="text-sm text-red-800">
              <span className="font-semibold">{t("quizPlay.correctAnswerLabel")}</span>{" "}
              {correctMath.length > 0
                ? correctMath.map((answer, index) => (
                    <span key={`${taskId}-correct-${index}`} className="mr-2 inline-block font-semibold">
                      <MathRender inline latex={answer} />
                    </span>
                  ))
                : <span className="font-semibold"><MathRender inline latex={shownText!} /></span>}
            </div>
          )}
          {detail && <div className={`text-sm ${wrong ? "text-red-800" : "text-green-800"}`}>{detail}</div>}
        </div>
        {onReport && (
          <button
            type="button"
            onClick={onReport}
            aria-label={t("footer.report")}
            title={t("footer.report")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-amber-700 hover:bg-white/70 transition-colors"
          >
            <Icon name="report" />
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {hasPrev && onPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label={t("footer.prevTask")}
            title={t("footer.prevTask")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Icon name="arrowLeft" />
          </button>
        )}
        {canGoNext && (
          <button
            type="button"
            onClick={onNext}
            className={`h-12 flex-1 rounded-xl font-bold text-white inline-flex items-center justify-center gap-1.5 transition-colors ${
              wrong ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {nextLabel} <Icon name="arrowRight" />
          </button>
        )}
      </div>
    </div>
  );
}
