"use client";

import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";

/** correct/wrong: checked in this visit; solved: completed earlier, opened again. */
export type LessonVerdict = "correct" | "wrong" | "solved";

const PRAISE = ["Дұрыс!", "Керемет!", "Жарайсың!", "Тамаша!"];

type Props = {
  taskId: number;
  verdict: LessonVerdict | null;
  /** Right answer to show after a wrong check: option texts or the raw stored answer. */
  correctMath?: string[];
  correctText?: string | null;
  /** The check itself failed (network, rate limit): not a verdict on the answer. */
  errorText?: string | null;
  hasPrev: boolean;
  canGoNext: boolean;
  canRetry: boolean;
  /** True/false tasks submit on tap, so they have no check button. */
  showCheck: boolean;
  checkDisabled: boolean;
  checking: boolean;
  onCheck: () => void;
  onRetry: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReport: () => void;
};

const formatStoredAnswer = (value: string): string => {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  if (lowered === "true" || lowered === "1") return "Дұрыс";
  if (lowered === "false" || lowered === "0") return "Жалған";
  if (trimmed.startsWith("[")) {
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
  verdict,
  correctMath = [],
  correctText,
  errorText,
  hasPrev,
  canGoNext,
  canRetry,
  showCheck,
  checkDisabled,
  checking,
  onCheck,
  onRetry,
  onNext,
  onPrev,
  onReport,
}: Props) {
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
          {hasPrev ? (
            <button
              type="button"
              onClick={onPrev}
              className="order-2 lg:order-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-3 sm:px-4 rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <Icon name="arrowLeft" /> Алдыңғы
            </button>
          ) : (
            <div className="hidden lg:inline-flex lg:order-1 invisible py-2 px-3 sm:px-4 font-bold items-center gap-1.5 select-none" aria-hidden="true">
              <Icon name="arrowLeft" /> Алдыңғы
            </div>
          )}
          <button
            type="button"
            onClick={onReport}
            className="order-3 lg:order-2 ml-auto lg:ml-0 min-h-10 inline-flex items-center gap-1.5 text-amber-700 hover:bg-orange-50 text-sm font-semibold py-2 px-3 sm:px-4 rounded-lg transition-colors"
          >
            <Icon name="report" /> Шағым
          </button>
          {showCheck ? (
            <button
              type="button"
              onClick={onCheck}
              disabled={checkDisabled || checking}
              className="order-1 lg:order-3 w-full lg:w-auto bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 lg:py-2 px-4 sm:px-5 rounded-xl inline-flex items-center justify-center transition-colors"
            >
              {checking ? "Тексерілуде..." : "Тексеру"}
            </button>
          ) : (
            <div className="hidden lg:inline-flex lg:order-3 invisible py-2 px-4 sm:px-5 font-bold items-center select-none" aria-hidden="true">
              Тексеру
            </div>
          )}
        </div>
      </div>
    );
  }

  const wrong = verdict === "wrong";
  const title = wrong ? "Қате" : verdict === "solved" ? "Бұл есеп шығарылған" : PRAISE[taskId % PRAISE.length];
  const shownText = correctMath.length === 0 && correctText ? formatStoredAnswer(correctText) : null;

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
              <span className="font-semibold">Дұрыс жауап:</span>{" "}
              {correctMath.length > 0
                ? correctMath.map((answer, index) => (
                    <span key={`${taskId}-correct-${index}`} className="mr-2 inline-block font-semibold">
                      <MathRender inline latex={answer} />
                    </span>
                  ))
                : <span className="font-semibold"><MathRender inline latex={shownText!} /></span>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onReport}
          aria-label="Шағым"
          title="Шағым"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-amber-700 hover:bg-white/70 transition-colors"
        >
          <Icon name="report" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {hasPrev && (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Алдыңғы есеп"
            title="Алдыңғы есеп"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Icon name="arrowLeft" />
          </button>
        )}
        {wrong && canRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-12 flex-1 rounded-xl border-2 border-red-300 bg-white font-bold text-red-700 hover:bg-red-100 transition-colors"
          >
            Қайта көру
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
            Келесі <Icon name="arrowRight" />
          </button>
        )}
      </div>
    </div>
  );
}
