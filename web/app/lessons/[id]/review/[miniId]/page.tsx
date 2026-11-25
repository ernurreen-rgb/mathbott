"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import Icon from "@/components/ui/Icon";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import TaskStatement from "@/components/student/TaskStatement";
import StudentAnswerField from "@/components/student/StudentAnswerField";
import { apiPath, getMiniLessonReview, submitMiniLessonReviewAnswer } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { consumeReviewOpenedFromLesson, markReviewFinished } from "@/lib/module-review-navigation";
import { playLessonCue, primeLessonSound } from "@/lib/lesson-sound";
import { getTaskMcqCorrectCount, parseMcqAnswerLabels } from "@/lib/question-options";
import { isTaskAnswerComplete } from "@/lib/task-answer";
import { parseWrittenAnswerSlots } from "@/lib/written-answer";
import type { LessonTask, MiniLessonReview, MiniLessonReviewAnswerResult, MiniLessonReviewTask } from "@/types";
import LessonTaskFooter from "../../_components/LessonTaskFooter";
import { useI18n } from "@/lib/i18n/provider";
import { tr, type Translate } from "@/lib/i18n/translate";

const toLessonTask = (task: MiniLessonReviewTask): LessonTask => ({
  id: task.bank_task_id,
  text: task.text,
  question_type: task.question_type,
  answer_mode: task.answer_mode,
  correct_count: task.correct_count,
  text_scale: task.text_scale,
  options: task.options,
  subquestions: task.subquestions,
  image_filename: task.image_filename,
  sort_order: 0,
});

/** Readable form of the graded answer: option texts for choices, slots for written answers. */
function correctAnswerParts(task: LessonTask, raw: string, t: Translate): string[] {
  if (task.question_type === "tf") {
    const lowered = raw.trim().toLowerCase();
    return [`\\text{${lowered === "false" || lowered === "0" ? t("footer.tfFalse") : t("footer.tfTrue")}}`];
  }
  if ((task.question_type === "mcq" || task.question_type === "mcq6" || task.question_type === "context") && getTaskAnswerMode(task) === "choices") {
    return parseMcqAnswerLabels(raw).map((label) => task.options?.find((option) => option.label.toUpperCase() === label)?.text || label);
  }
  if (task.question_type === "select" && getTaskAnswerMode(task) === "choices") {
    try {
      const labels: unknown = JSON.parse(raw);
      if (Array.isArray(labels)) return labels.map((label, index) => `${index + 1}\\to ${String(label)}`);
    } catch { /* Fall through to the raw answer. */ }
  }
  const count = task.question_type === "select" ? 2 : task.question_type === "mcq" || task.question_type === "mcq6" || task.question_type === "context" ? getTaskMcqCorrectCount(task) : 1;
  const slots = parseWrittenAnswerSlots(raw, count).filter(Boolean);
  return slots.length ? slots : [raw];
}

export default function MiniLessonReviewPage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const rawLessonId = Number(params.id);
  const rawMiniLessonId = Number(params.miniId);
  const lessonId = Number.isInteger(rawLessonId) && rawLessonId > 0 ? rawLessonId : 0;
  const miniLessonId = Number.isInteger(rawMiniLessonId) && rawMiniLessonId > 0 ? rawMiniLessonId : 0;
  const isValidRoute = lessonId > 0 && miniLessonId > 0;
  const email = session?.user?.email || null;

  const [review, setReview] = useState<MiniLessonReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<MiniLessonReviewAnswerResult | null>(null);
  const loadGenerationRef = useRef(0);
  const submittingRef = useRef(false);
  const continuedRef = useRef(false);

  useEffect(() => {
    continuedRef.current = false;
    submittingRef.current = false;
    setReview(null);
    setAnswer("");
    setResult(null);
    setError(null);
  }, [lessonId, miniLessonId]);

  const load = useCallback(async () => {
    if (!isValidRoute) {
      setError(tr("mreview.notFound"));
      setLoading(false);
      return;
    }
    if (!email) return;
    const gen = ++loadGenerationRef.current;
    setLoading(true); setError(null);
    const { data, error: err } = await getMiniLessonReview(miniLessonId, email);
    if (gen !== loadGenerationRef.current) return;
    setReview(data); setError(err); setAnswer(""); setResult(null); setLoading(false);
  }, [email, isValidRoute, miniLessonId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (value: string) => {
    const current = review?.current;
    if (!email || !current || submittingRef.current || checking || result) return;
    submittingRef.current = true;
    // Unlock audio inside the click: iOS refuses to start it after the request returns.
    primeLessonSound();
    setChecking(true); setError(null);
    const gen = loadGenerationRef.current;
    try {
      const { data, error: err } = await submitMiniLessonReviewAnswer(
        miniLessonId, { task_id: current.task_id, bank_task_id: current.task.bank_task_id, answer: value }, email,
      );
      if (gen !== loadGenerationRef.current) return;
      if (data) {
        setResult(data);
        setReview((previous) => previous && { ...previous, summary: data.summary });
        playLessonCue(data.correct ? "correct" : "wrong");
      }
      else setError(err || tr("mreview.checkFailed"));
    } finally {
      submittingRef.current = false;
      setChecking(false);
    }
  };

  const backHref = review?.lesson_id ? `/lessons/${review.lesson_id}` : lessonId ? `/lessons/${lessonId}` : "/modules";
  // Opened from the lesson: step back. Opened directly: replace, so the review never sits between two lesson visits.
  const returnToLesson = () => {
    if (consumeReviewOpenedFromLesson(window.location.pathname)) router.back();
    else router.replace(backHref);
  };
  // A finished review has no screen of its own: the lesson goes straight on to the next step.
  const continueAfterReview = useCallback(() => {
    if (continuedRef.current) return;
    continuedRef.current = true;
    const targetLessonId = review?.lesson_id ?? lessonId;
    if (targetLessonId > 0 && miniLessonId > 0) {
      markReviewFinished(targetLessonId, miniLessonId);
    }
    if (consumeReviewOpenedFromLesson(window.location.pathname)) router.back();
    else router.replace(targetLessonId > 0 ? `/lessons/${targetLessonId}` : "/modules");
  }, [lessonId, miniLessonId, review?.lesson_id, router]);
  const finished = !!review && !review.current && review.summary.mistakes > 0;
  useEffect(() => { if (finished) continueAfterReview(); }, [finished, continueAfterReview]);
  // On phones the review is exactly one screen tall with no bottom nav, like the lesson.
  const shell = (children: ReactNode) => <div className="flex h-dvh flex-col overflow-hidden bg-gradient-math animate-gradient relative md:block md:h-auto md:min-h-screen md:overflow-visible">
    <div className="absolute inset-0 bg-black/5" />
    <DesktopNav />
    <main className="md:ml-64 flex min-h-0 flex-1 justify-center px-3 sm:px-6 lg:px-8 py-4 md:py-8 relative z-10">
      <div className="flex h-full min-h-0 w-full max-w-4xl flex-col gap-4 md:block md:h-auto md:space-y-6">{children}</div>
    </main>
  </div>;

  if (status === "loading" || !session) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }
  if ((loading && !review) || finished) return shell(<><SkeletonLoader variant="card" /><SkeletonLoader variant="card" /></>);

  const summary = review?.summary;
  const current = review?.current;
  const task = current ? toLessonTask(current.task) : null;
  const done = summary ? summary.resolved + summary.weak : 0;
  // After a checked answer: another twin of the same mistake, the next mistake, or on out of the review.
  const after = !result ? null : !result.correct && result.has_next_twin ? "twin" : result.summary.pending > 0 ? "mistake" : "finish";

  return shell(<>
    <section className="glass shrink-0 rounded-3xl shadow-2xl p-4 md:p-6 border border-white/30">
      <button type="button" onClick={returnToLesson} className="text-gray-700 hover:text-gray-900 inline-flex items-center gap-1.5"><Icon name="arrowLeft" /> {t("mreview.backToLesson")}</button>
      <h1 className="mt-2 text-xl font-extrabold text-gray-900 md:mt-4 md:text-2xl">{t("lesson.reviewMistakes")}</h1>
      {summary && summary.mistakes > 0 && (
        <div className="mt-4 h-2 rounded-full bg-white/60 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={summary.mistakes} aria-valuenow={done} aria-label={t("mreview.progressAria")}>
          <div className="h-2 rounded-full bg-purple-600 transition-all" style={{ width: `${(done / summary.mistakes) * 100}%` }} />
        </div>
      )}
    </section>

    {error && <div role="alert" className="shrink-0 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-800">
      {error} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">{t("profile.reload")}</button>
    </div>}

    {current && task ? <section className="glass flex min-h-0 flex-1 flex-col rounded-3xl shadow-2xl border border-white/30 md:block md:flex-none">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 md:overflow-visible md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
          <span>{t("mreview.mistakeOf", { n: current.position, total: summary?.mistakes ?? current.position })}{current.attempt > 1 ? ` · ${t("mreview.attemptN", { n: current.attempt })}` : ""}</span>
          <span className={`rounded-full px-3 py-1 font-semibold ${current.kind === "twin" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-700"}`}>
            {current.kind === "twin" ? t("mreview.twin") : t("mreview.sameTask")}
          </span>
        </div>
        <div className="bg-white/70 rounded-2xl p-4 border border-white/40 space-y-4">
          <TaskStatement task={task} />
          <StudentAnswerField key={`${current.task_id}-${task.id}`} task={task} value={answer} onChange={setAnswer}
            result={result ? { correct: result.correct, correctAnswer: result.correct_answer } : null}
            checking={checking} onSubmit={(value) => void submit(value)} />
        </div>

        {/* The solution stays with the task, so the footer panel keeps to one compact block on phones. */}
        {result && !result.correct && (
          <div className="space-y-3 rounded-2xl border border-red-200 bg-white/80 p-4 text-red-800">
            {result.solution_filename && <Image src={apiPath(`images/${result.solution_filename}`)} alt={t("mreview.solutionAlt")} width={1280} height={720} unoptimized
              className="max-h-80 w-auto max-w-full rounded-lg border border-red-200 bg-white object-contain" />}
            <p className="text-sm">{result.has_next_twin
              ? t("mreview.seeSolution")
              : t("mreview.addedToWeak")}</p>
          </div>
        )}
      </div>

      <LessonTaskFooter
        taskId={task.id}
        questionType={task.question_type}
        verdict={result ? (result.correct ? "correct" : "wrong") : null}
        correctMath={result && !result.correct && result.correct_answer ? correctAnswerParts(task, result.correct_answer, t) : []}
        detail={result?.correct ? t("mreview.fixed") : undefined}
        hasPrev={false}
        canGoNext={!!result}
        nextLabel={after === "twin" ? t("mreview.anotherTwin") : after === "mistake" ? t("mreview.nextMistake") : t("mreview.continue")}
        showCheck={task.question_type !== "tf"}
        checkDisabled={!isTaskAnswerComplete(task, answer)}
        checking={checking}
        onCheck={() => void submit(answer)}
        onNext={() => (after === "finish" ? continueAfterReview() : void load())}
      />
    </section>
    : review && <section className="glass min-h-0 overflow-y-auto rounded-3xl shadow-2xl p-6 border border-white/30 text-center space-y-3 md:overflow-visible">
      <p className="text-gray-700">{t("mreview.nothing")}</p>
      <button type="button" onClick={returnToLesson} className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-5 rounded-lg">{t("mreview.backToLesson")} <Icon name="arrowRight" /></button>
    </section>}
  </>);
}
