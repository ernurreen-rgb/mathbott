"use client";
import Icon from "@/components/ui/Icon";


import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { apiPath, clearApiGetCache, getLessonDetails, reportLessonTask } from "@/lib/api";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { useRequireAuth } from "@/lib/use-require-auth";
import { getTaskMcqCorrectCount, parseMcqAnswerLabels } from "@/lib/question-options";
import { isTaskAnswerComplete } from "@/lib/task-answer";
import { parseWrittenAnswerSlots } from "@/lib/written-answer";
import TaskStatement from "@/components/student/TaskStatement";
import { LessonDetails, LessonMiniLesson, LessonTask } from "@/types";
import { consumeFinishedReview, markReviewOpenedFromLesson } from "@/lib/module-review-navigation";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import StudentAnswerField from "@/components/student/StudentAnswerField";
import { TaskReportDialog, useTaskReport } from "@/components/student/TaskReportDialog";
import { isLessonSoundEnabled, playLessonCue, primeLessonSound, setLessonSoundEnabled } from "@/lib/lesson-sound";
import { pickNextTaskId, pickStepAfterReview } from "@/lib/lesson-flow";
import { useI18n } from "@/lib/i18n/provider";
import { timedFetch } from "@/lib/request-timing";
import LessonTaskFooter, { type LessonVerdict } from "./_components/LessonTaskFooter";
import MiniLessonSummary from "./_components/MiniLessonSummary";

type CheckResult = { correct: boolean; correct_answer?: string | null };

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function LessonPage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const rawLessonId = Number(params.id);
  const isValidLessonId = Number.isInteger(rawLessonId) && rawLessonId > 0;
  const lessonId = isValidLessonId ? rawLessonId : 0;

  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingSummary, setRefreshingSummary] = useState(false);
  const [summaryRefreshError, setSummaryRefreshError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMiniId, setSelectedMiniId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<
    Record<number, { ok: boolean; text: string; error?: boolean; correctMath?: string[]; correctText?: string | null }>
  >({});
  const [soundOn, setSoundOn] = useState(true);
  // Tasks answered wrong in this visit that came back to be corrected.
  const [retryTaskIds, setRetryTaskIds] = useState<Set<number>>(() => new Set());
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, string>>({});
  const [showCongrats, setShowCongrats] = useState(false);
  // Mini-lesson whose mistake review the congratulations dialog offers instead of redirecting.
  const [congratsReviewMiniId, setCongratsReviewMiniId] = useState<number | null>(null);

  const email = session?.user?.email || null;
  const report = useTaskReport(email ? (taskId, message) => reportLessonTask(email, taskId, message) : null);

  const prevLessonCompletedRef = useRef<boolean | null>(null);
  const congratsShownRef = useRef(false);
  const continuationCheckedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchGenerationRef = useRef(0);
  const checkingTasksRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setSoundOn(isLessonSoundEnabled());
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  // Reset per-lesson transient state whenever navigating between lessons.
  useEffect(() => {
    fetchGenerationRef.current += 1;
    checkingTasksRef.current.clear();
    prevLessonCompletedRef.current = null;
    congratsShownRef.current = false;
    continuationCheckedRef.current = false;
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
    setLesson(null);
    setError(null);
    setSelectedMiniId(null);
    setActiveTaskId(null);
    setAnswers({});
    setChecking({});
    setFeedback({});
    setRetryTaskIds(new Set());
    setSelectedAnswers({});
    setCorrectAnswers({});
    setShowCongrats(false);
    setCongratsReviewMiniId(null);
    setRefreshingSummary(false);
    setSummaryRefreshError(null);
  }, [lessonId]);

  const toggleSound = () => {
    const next = !soundOn;
    setLessonSoundEnabled(next);
    setSoundOn(next);
    if (next) primeLessonSound();
  };

  const fetchLesson = async (opts?: { silent?: boolean }) => {
    if (!isValidLessonId) {
      setError(t("lesson.notFound"));
      setLoading(false);
      return;
    }
    if (!email) return;
    const silent = opts?.silent === true;
    const gen = ++fetchGenerationRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    } else {
      setSummaryRefreshError(null);
      setRefreshingSummary(true);
    }
    const { data, error: err } = await getLessonDetails(lessonId, email);
    if (gen !== fetchGenerationRef.current) return;
    if (err) {
      if (!silent) setError(err);
      else {
        console.error("Failed to fetch lesson:", err);
        setSummaryRefreshError(err);
      }
    }
    if (data) {
      setSummaryRefreshError(null);
      setLesson((prev) => {
        if (!prev || prev.id !== data.id) return data;
        // Preserve any tasks completed locally
        return {
          ...data,
          mini_lessons: data.mini_lessons.map((ml) => {
            const prevMl = prev.mini_lessons.find((m) => m.id === ml.id);
            return {
              ...ml,
              tasks: ml.tasks.map((t) => {
                const prevTask = prevMl?.tasks.find((pt) => pt.id === t.id);
                if (prevTask?.status === "completed") {
                  return { ...t, status: "completed" };
                }
                return t;
              }),
            };
          }),
        };
      });
      setSelectedMiniId((prevSelected) => {
        if (prevSelected && data.mini_lessons.some((ml) => ml.id === prevSelected)) {
          return prevSelected;
        }
        const firstNotCompleted = data.mini_lessons.find((ml) => !ml.progress?.completed);
        return (firstNotCompleted || data.mini_lessons[0])?.id ?? null;
      });
    }
    if (!silent) setLoading(false);
    else setRefreshingSummary(false);
  };

  useEffect(() => {
    if (!isValidLessonId) {
      setError(t("lesson.notFound"));
      setLoading(false);
      return;
    }
    if (email) {
      void fetchLesson();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, lessonId, isValidLessonId]);

  // Congrats + redirect when the lesson becomes completed (transition false -> true)
  useEffect(() => {
    if (!lesson) return;

    const completed = !!lesson.progress?.completed;

    // First value (initial load) -> don't trigger
    if (prevLessonCompletedRef.current === null) {
      prevLessonCompletedRef.current = completed;
      return;
    }

    // Trigger only once per page visit
    if (!congratsShownRef.current && prevLessonCompletedRef.current === false && completed === true) {
      congratsShownRef.current = true;
      setShowCongrats(true);

      // With mistakes left to review, the student chooses instead of being redirected.
      const reviewMini = lesson.mini_lessons
        .slice()
        .sort((a, b) => a.mini_index - b.mini_index)
        .find((ml) => (ml.review?.pending ?? 0) > 0);
      setCongratsReviewMiniId(reviewMini?.id ?? null);
      if (!reviewMini) {
        const moduleId = lesson?.module_id;
        const sectionId = lesson?.section_id;
        const target =
          moduleId && sectionId ? `/modules/${moduleId}#section-${sectionId}` : "/modules";

        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = setTimeout(() => {
          router.push(target);
        }, 2200);
      }
    }

    prevLessonCompletedRef.current = completed;
  }, [lesson, router]);

  const sectionHref =
    lesson?.module_id && lesson?.section_id ? `/modules/${lesson.module_id}#section-${lesson.section_id}` : "/modules";
  const reviewHref = (miniLessonId: number) => `/lessons/${lessonId}/review/${miniLessonId}`;
  const openReview = (miniLessonId: number) => {
    markReviewOpenedFromLesson(reviewHref(miniLessonId));
    router.push(reviewHref(miniLessonId));
  };

  // Back from a finished mistake review: go straight on instead of showing that mini-lesson again.
  useEffect(() => {
    if (!lesson || continuationCheckedRef.current) return;
    continuationCheckedRef.current = true;
    const reviewedMiniId = consumeFinishedReview(lesson.id);
    if (reviewedMiniId === null || lesson.lock) return;
    const step = pickStepAfterReview(
      lesson.mini_lessons.map((ml) => ({
        id: ml.id,
        index: ml.mini_index,
        completed: !!ml.progress?.completed,
        pendingReview: ml.review?.pending ?? 0,
      })),
      reviewedMiniId,
      lesson.next_lesson
    );
    if (step.kind === "mini") setSelectedMiniId(step.id);
    else if (step.kind === "review") openReview(step.id);
    else if (step.kind === "lesson") router.replace(`/lessons/${step.id}`);
    else router.replace(sectionHref);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson]);

  const selectedMini: LessonMiniLesson | null = useMemo(() => {
    if (!lesson || !selectedMiniId) return null;
    return lesson.mini_lessons.find((ml) => ml.id === selectedMiniId) || null;
  }, [lesson, selectedMiniId]);

  const orderedMiniTasks = useMemo(() => {
    if (!selectedMini) return [];
    return selectedMini.tasks
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }, [selectedMini]);

  const nextMiniId = useMemo(() => {
    if (!lesson || !selectedMiniId) return null;
    const minis = lesson.mini_lessons.slice().sort((a, b) => a.mini_index - b.mini_index);
    const idx = minis.findIndex((m) => m.id === selectedMiniId);
    if (idx < 0) return null;
    return minis[idx + 1]?.id ?? null;
  }, [lesson, selectedMiniId]);

  const activeTask = useMemo(() => {
    if (!activeTaskId) return null;
    return orderedMiniTasks.find((t) => t.id === activeTaskId) || null;
  }, [orderedMiniTasks, activeTaskId]);

  const currentTaskIndex = useMemo(() => {
    if (!activeTaskId) return -1;
    return orderedMiniTasks.findIndex((t) => t.id === activeTaskId);
  }, [orderedMiniTasks, activeTaskId]);

  const isTaskCompleted = activeTask ? activeTask.status === "completed" || !!feedback[activeTask.id]?.ok : false;
  const isActiveTaskAnswered = activeTask
    ? activeTask.status === "completed" || selectedAnswers[activeTask.id] !== undefined
    : false;
  // After any answer the student moves on; unsolved tasks come back once the others are done.
  const canGoNext = isTaskCompleted || isActiveTaskAnswered;
  const activeFeedback = activeTask ? feedback[activeTask.id] : undefined;
  const summaryPrimary = (() => {
    if (refreshingSummary && selectedMini && !selectedMini.progress?.completed) {
      return { label: t("lesson.resultLoading"), onClick: () => {}, disabled: true };
    }
    if (summaryRefreshError && selectedMini && !selectedMini.progress?.completed) {
      return {
        label: t("common.retry"),
        onClick: () => void fetchLesson({ silent: true }),
      };
    }
    const pending = selectedMini?.review?.pending ?? 0;
    if (selectedMini && pending > 0) {
      return { label: t("lesson.reviewMistakesN", { count: pending }), onClick: () => openReview(selectedMini.id) };
    }
    if (nextMiniId) return { label: t("lesson.nextMini"), onClick: () => setSelectedMiniId(nextMiniId) };
    const unfinished = lesson?.mini_lessons
      .slice()
      .sort((a, b) => a.mini_index - b.mini_index)
      .find((ml) => ml.id !== selectedMini?.id && !ml.progress?.completed);
    if (unfinished) {
      return { label: t("lesson.goToMini", { n: unfinished.mini_index }), onClick: () => setSelectedMiniId(unfinished.id) };
    }
    const nextLesson = lesson?.next_lesson;
    if (nextLesson && !nextLesson.locked) {
      return { label: t("lesson.nextLesson"), onClick: () => router.push(`/lessons/${nextLesson.id}`) };
    }
    return { label: t("lesson.backToSection"), onClick: () => router.push(sectionHref), backToSection: true };
  })();
  const verdict: LessonVerdict | null = !activeTask
    ? null
    : activeFeedback && !activeFeedback.error
      ? activeFeedback.ok ? "correct" : "wrong"
      : activeTask.status === "completed" ? "solved" : null;

  // When mini-lesson changes or tasks update, pick the first not completed task
  useEffect(() => {
    if (!selectedMini) {
      setActiveTaskId(null);
      return;
    }
    const firstPending = orderedMiniTasks.find((t) => t.status !== "completed");
    setActiveTaskId((prev) => {
      // If current task still exists in the selected mini-lesson, keep it
      if (prev && orderedMiniTasks.some((t) => t.id === prev)) return prev;
      return (firstPending || orderedMiniTasks[0])?.id ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMiniId, selectedMini?.id, orderedMiniTasks.length]);

  const updateTaskStatusLocal = (taskId: number, status: LessonTask["status"]) => {
    setLesson((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mini_lessons: prev.mini_lessons.map((ml) => ({
          ...ml,
          tasks: ml.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
        })),
      };
    });
  };

  const resetTaskAttempt = (taskId: number) => {
    setSelectedAnswers((m) => {
      const next = { ...m };
      delete next[taskId];
      return next;
    });
    setFeedback((m) => {
      const next = { ...m };
      delete next[taskId];
      return next;
    });
    setCorrectAnswers((m) => {
      const next = { ...m };
      delete next[taskId];
      return next;
    });
    setAnswers((m) => {
      const next = { ...m };
      delete next[taskId];
      return next;
    });
  };

  const goToNextTaskOrMini = (currentTaskId: number) => {
    const idx = orderedMiniTasks.findIndex((t) => t.id === currentTaskId);
    if (idx < 0) return;
    const allSolved = orderedMiniTasks.every((t) => t.status === "completed");
    // In an already-completed mini-lesson, allow stepping sequentially through solved tasks (H-33).
    const browseCompleted =
      allSolved &&
      !!selectedMini?.progress?.completed &&
      !feedback[currentTaskId];
    const nextId = pickNextTaskId(
      orderedMiniTasks.map((t) => ({ id: t.id, solved: t.status === "completed" })),
      idx,
      { browseCompleted }
    );
    if (nextId === null) {
      // Every task is solved: stop on the summary, which offers the mistake review or the next step.
      setActiveTaskId(null);
      if (selectedMini && !selectedMini.progress?.completed && !refreshingSummary) {
        void fetchLesson({ silent: true });
      }
      playLessonCue("complete");
      return;
    }
    // A task answered wrong in this visit comes back clean and marked as a mistake to correct.
    if (selectedAnswers[nextId] !== undefined) {
      resetTaskAttempt(nextId);
      setRetryTaskIds((ids) => new Set(ids).add(nextId));
    }
    setActiveTaskId(nextId);
  };

  const goToPrevTaskOrMini = (currentTaskId: number) => {
    const idx = orderedMiniTasks.findIndex((t) => t.id === currentTaskId);
    if (idx > 0) {
      setActiveTaskId(orderedMiniTasks[idx - 1].id);
    }
  };

  const submitCheck = async (task: LessonTask, answer: string) => {
    if (!email || checkingTasksRef.current.has(task.id)) return;
    checkingTasksRef.current.add(task.id);
    const submitLessonId = lessonId;
    // Unlock audio inside the click: iOS refuses to start it after the request returns.
    primeLessonSound();
    setChecking((m) => ({ ...m, [task.id]: true }));
    setFeedback((m) => {
      const next = { ...m };
      delete next[task.id];
      return next;
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      clearApiGetCache();
      const res = await timedFetch(apiPath("task/check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, answer, email }),
        signal: controller.signal,
      });
      const rawText = await res.text();
      let data: (CheckResult & { detail?: unknown; error?: { detail?: unknown } }) | null = null;
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = null;
        }
      }
      if (submitLessonId !== lessonId) return;
      if (!res.ok || !data) {
        const detail = data?.error?.detail || data?.detail;
        const text =
          res.status === 429
            ? t("lesson.tooFrequent")
            : typeof detail === "string"
              ? detail
              : t("lesson.checkError");
        setFeedback((m) => ({ ...m, [task.id]: { ok: false, error: true, text } }));
        // The lesson waits for an earlier mistake review: reload to show why.
        if (res.status === 423) void fetchLesson();
        return;
      }
      setSelectedAnswers((m) => ({ ...m, [task.id]: answer }));
      if (data.correct) {
        updateTaskStatusLocal(task.id, "completed");
        setFeedback((m) => ({ ...m, [task.id]: { ok: true, text: t("review.correct") } }));
        playLessonCue("correct");
        // Save correct answer - if API provides it, use it; otherwise the selected answer is correct
        const correctAns = data.correct_answer || answer;
        setCorrectAnswers((m) => ({ ...m, [task.id]: correctAns }));

        // Quietly refresh lesson progress without showing the full-page loader
        void fetchLesson({ silent: true });
      } else {
        const qType = task.question_type || "input";
        const isChoicesMode = getTaskAnswerMode(task) === "choices";
        const isChoicesMcq = (qType === "mcq" || qType === "mcq6") && isChoicesMode;
        const rawCorrect = data.correct_answer ?? "";
        let correctMath: string[] = [];
        let correctText: string | null = data.correct_answer ?? null;

        if (isChoicesMcq) {
          correctMath = parseMcqAnswerLabels(rawCorrect)
            .map((label) => task.options?.find((option) => option.label.toUpperCase() === label)?.text || label)
            .filter(Boolean);
          correctText = correctMath.length > 0 ? null : data.correct_answer ?? null;
        } else if (!isChoicesMode && (qType === "mcq" || qType === "mcq6" || qType === "select") && rawCorrect) {
          const count = qType === "select" ? 2 : getTaskMcqCorrectCount(task);
          const slots = parseWrittenAnswerSlots(rawCorrect, count).filter(Boolean);
          if (slots.length > 0) {
            correctMath = slots;
            correctText = null;
          }
        }
        setFeedback((m) => ({
          ...m,
          [task.id]: { ok: false, text: t("lesson.wrong"), correctMath, correctText },
        }));
        playLessonCue("wrong");
        // Save correct answer even if wrong
        if (data.correct_answer) {
          setCorrectAnswers((m) => ({ ...m, [task.id]: data.correct_answer! }));
        }
      }
    } catch (e: unknown) {
      if (submitLessonId !== lessonId) return;
      const isAbort = e instanceof Error && e.name === "AbortError";
      const message = isAbort
        ? t("lesson.serverSlow")
        : e instanceof Error && e.message
          ? e.message
          : t("lesson.networkError");
      setFeedback((m) => ({ ...m, [task.id]: { ok: false, error: true, text: message } }));
    } finally {
      clearApiGetCache();
      clearTimeout(timeoutId);
      checkingTasksRef.current.delete(task.id);
      setChecking((m) => ({ ...m, [task.id]: false }));
    }
  };

  const getTaskCurrentAnswer = (task: LessonTask) =>
    answers[task.id] ||
    selectedAnswers[task.id] ||
    (task.status === "completed" ? task.answer || "" : "");

  const renderTaskControls = (task: LessonTask) => {
    const answered = task.status === "completed" || selectedAnswers[task.id] !== undefined;
    const correct = task.status === "completed" || !!feedback[task.id]?.ok;
    const value = getTaskCurrentAnswer(task);
    return (
      <StudentAnswerField
        task={task}
        value={value}
        onChange={(next) => setAnswers((m) => ({ ...m, [task.id]: next }))}
        result={answered ? { correct, correctAnswer: correctAnswers[task.id] || (correct && value ? value : task.answer || "") } : null}
        onSubmit={(next) => void submitCheck(task, next)}
        checking={!!checking[task.id]}
      />
    );
  };

  if (status === "loading" || !session) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="modules" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-4xl mx-auto">
            <SkeletonLoader variant="card" className="mb-4" />
            <SkeletonLoader variant="card" className="mb-4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <main className="md:ml-64 min-h-screen flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md glass rounded-3xl shadow-2xl border border-white/30 p-6 text-center space-y-4">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
              {error || t("lesson.loadFailed")}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {isValidLessonId && (
                <button
                  type="button"
                  onClick={() => void fetchLesson()}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition-colors"
                >
                  {t("common.retry")}
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push("/modules")}
                className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm transition-colors"
              >
                {t("module.backToModules")}
              </button>
            </div>
          </div>
        </main>
        <MobileNav currentPage="modules" />
      </div>
    );
  }

  if (lesson.lock) {
    const lock = lesson.lock;
    const lockReviewHref = `/lessons/${lock.lesson_id}/review/${lock.mini_lesson_id}`;
    const previousName = lock.lesson_title?.trim() || t("journey.lessonN", { n: lock.lesson_number ?? lock.lesson_id });
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
        <div className="absolute inset-0 bg-black/5"></div>
        <DesktopNav />
        <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="w-full max-w-xl glass rounded-3xl shadow-2xl p-6 sm:p-8 border border-white/30 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Icon name="lock" className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900">{t("lesson.lockedTitle")}</h1>
            <p className="mt-3 text-gray-700">
              {t("lesson.lockedBody", { name: previousName, count: lock.pending })}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  // Back from the review lands here again, now open or pointing at the next review.
                  markReviewOpenedFromLesson(lockReviewHref);
                  router.push(lockReviewHref);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-5 rounded-lg inline-flex items-center justify-center gap-1.5"
              >
                {t("lesson.reviewMistakesN", { count: lock.pending })} <Icon name="arrowRight" />
              </button>
              <button
                type="button"
                onClick={() => router.push(sectionHref)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2.5 px-5 rounded-lg"
              >
                {t("lesson.backToSection")}
              </button>
            </div>
          </div>
        </main>
        <MobileNav currentPage="modules" />
      </div>
    );
  }

  return (
    // On phones the lesson is exactly one screen tall with no bottom nav: the page itself never scrolls.
    <div className="flex h-dvh flex-col overflow-hidden bg-gradient-math animate-gradient relative md:block md:h-auto md:min-h-screen md:overflow-visible">
      <div className="absolute inset-0 bg-black/5"></div>

      {showCongrats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-white/40 w-full max-w-sm p-8 text-center">
            <div className="text-6xl mb-3 animate-bounce"><Icon name="sparkles" /></div>
            <div className="text-2xl font-extrabold text-gray-900">{t("lesson.congrats")}</div>
            <div className="text-sm text-gray-600 mt-1">{t("lesson.finished")}</div>
            {congratsReviewMiniId ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm text-gray-700">
                  {t("lesson.reviewHint")}
                  {lesson.next_lesson?.locked && ` ${t("lesson.nextOpensAfterReview")}`}
                </p>
                <button
                  type="button"
                  onClick={() => openReview(congratsReviewMiniId)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-lg"
                >
                  {t("lesson.reviewMistakes")}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(sectionHref)}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-2.5 px-4 rounded-lg"
                >
                  {t("lesson.backToSection")}
                </button>
              </div>
            ) : (
              <div className="mt-5 flex items-center justify-center gap-2 text-gray-700">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                <span className="text-sm font-semibold">{t("lesson.backToSection")}...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <DesktopNav />
      <main className="md:ml-64 flex min-h-0 flex-1 justify-center px-3 sm:px-6 lg:px-8 py-4 md:py-8 relative z-10">
        <div className="flex h-full min-h-0 w-full max-w-4xl flex-col md:block md:h-auto">
          <div className="glass rounded-3xl shadow-2xl p-4 md:p-6 border border-white/30 mb-4 md:mb-6 shrink-0">
            <div className="mb-2 flex items-center justify-between gap-3 md:mb-4">
              {/* The parent section, not history: after a mistake review, history-back returned to the review. */}
              <button
                onClick={() => router.push(sectionHref)}
                className="text-gray-700 hover:text-gray-900"
              >
                <Icon name="arrowLeft" /> {t("common.back")}
              </button>
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={soundOn}
                aria-label={soundOn ? t("lesson.soundOffAria") : t("lesson.soundOnAria")}
                title={soundOn ? t("lesson.soundOff") : t("lesson.soundOn")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 hover:bg-white/70 hover:text-gray-900 transition-colors"
              >
                <Icon name={soundOn ? "volume" : "volumeOff"} className="h-5 w-5" />
              </button>
            </div>

            {/* 4-step progress bar */}
            <div className="mt-2 md:mt-4">
              <div className="flex items-center justify-between gap-2">
                {lesson.mini_lessons
                  .slice()
                  .sort((a, b) => a.mini_index - b.mini_index)
                  .map((ml, idx, arr) => {
                    const completed = !!ml.progress?.completed;
                    const active = selectedMiniId === ml.id;
                    const pendingReview = completed ? ml.review?.pending ?? 0 : 0;
                    return (
                      <div key={ml.id} className="flex-1 flex items-center">
                        <button
                          onClick={() => setSelectedMiniId(ml.id)}
                          aria-label={pendingReview ? t("lesson.miniPendingAria", { n: ml.mini_index, count: pendingReview }) : undefined}
                          className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold transition-colors ${
                            completed
                              ? "bg-green-600 border-green-700 text-white"
                              : active
                                ? "bg-purple-600 border-purple-700 text-white"
                                : "bg-white/70 border-gray-300 text-gray-700 hover:border-purple-400"
                          }`}
                        >
                          {ml.mini_index}
                          {pendingReview > 0 && (
                            <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-white text-[11px] leading-5 text-center">
                              {pendingReview}
                            </span>
                          )}
                        </button>
                        {idx < arr.length - 1 && (
                          <div className="flex-1 h-1 mx-2 rounded bg-gray-200">
                            <div
                              className={`h-1 rounded ${completed ? "bg-green-500" : "bg-purple-500"}`}
                              style={{ width: `${clamp01(ml.progress?.progress ?? 0) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Selected mini-lesson: on phones the task scrolls and the answer footer stays at the bottom. */}
          {selectedMini ? (
            <div className="glass flex min-h-0 flex-1 flex-col rounded-3xl shadow-2xl border border-white/30 md:block md:flex-none">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:overflow-visible md:p-6">
                {activeTask && selectedMini.progress?.completed && (selectedMini.review?.mistakes ?? 0) > 0 && (
                  selectedMini.review!.pending > 0 ? (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                      <div className="text-gray-800">
                        <div className="font-bold">{t("lesson.reviewMistakes")}</div>
                        <div className="text-sm">{t("lesson.firstTryMistakes", { count: selectedMini.review!.mistakes })}</div>
                        {lesson.next_lesson?.locked && (
                          <div className="mt-1 text-sm font-semibold text-amber-800">
                            <Icon name="lock" className="mr-1" />{t("lesson.nextOpensAfterMistakes")}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openReview(selectedMini.id)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-1.5"
                      >
                        {t("lesson.startReview", { count: selectedMini.review!.pending })} <Icon name="arrowRight" />
                      </button>
                    </div>
                  ) : (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
                      <span><Icon name="checkCircle" className="mr-1.5 text-green-600" />{t("lesson.reviewedSummary", { resolved: selectedMini.review!.resolved })}{selectedMini.review!.weak ? t("lesson.reviewedWeak", { weak: selectedMini.review!.weak }) : ""}.</span>
                      <button type="button" onClick={() => openReview(selectedMini.id)} className="font-semibold text-purple-700 hover:underline">
                        {t("lesson.viewResult")}
                      </button>
                    </div>
                  )
                )}

                {orderedMiniTasks.length === 0 ? (
                  <div className="text-gray-600">{t("lesson.noTasks")}</div>
                ) : !activeTask ? (
                  <div className="space-y-3">
                    {summaryRefreshError && !selectedMini.progress?.completed && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
                        <span>{summaryRefreshError}</span>
                        <button
                          type="button"
                          onClick={() => void fetchLesson({ silent: true })}
                          className="font-bold text-purple-700 hover:underline"
                        >
                          {t("common.retry")}
                        </button>
                      </div>
                    )}
                    <MiniLessonSummary
                      miniIndex={selectedMini.mini_index}
                      totalTasks={orderedMiniTasks.length}
                      mistakes={selectedMini.progress?.completed && selectedMini.review ? selectedMini.review.mistakes : null}
                      pendingReview={selectedMini.review?.pending ?? 0}
                      primary={summaryPrimary}
                      onPrevTask={() => setActiveTaskId(orderedMiniTasks[orderedMiniTasks.length - 1].id)}
                      onBackToSection={"backToSection" in summaryPrimary ? null : () => router.push(sectionHref)}
                      email={email}
                    />
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <span>{t("lesson.taskOf", { n: currentTaskIndex + 1, total: orderedMiniTasks.length })}</span>
                      {retryTaskIds.has(activeTask.id) && activeTask.status !== "completed" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          <Icon name="target" /> {t("lesson.fixMistake")}
                        </span>
                      )}
                    </div>
                    <div className="bg-white/70 rounded-2xl p-3 md:p-4 border border-white/40">
                      <div className="mb-3">
                        <TaskStatement task={activeTask} />
                      </div>
                      {renderTaskControls(activeTask)}
                    </div>
                  </div>
                )}
              </div>

              {activeTask && (
                <LessonTaskFooter
                  taskId={activeTask.id}
                  questionType={activeTask.question_type}
                  verdict={verdict}
                  correctMath={activeFeedback?.correctMath}
                  correctText={activeFeedback?.correctText}
                  errorText={activeFeedback?.error ? activeFeedback.text : null}
                  hasPrev={currentTaskIndex > 0}
                  canGoNext={canGoNext}
                  showCheck={(activeTask.question_type || "input") !== "tf"}
                  checkDisabled={!isTaskAnswerComplete(activeTask, getTaskCurrentAnswer(activeTask))}
                  checking={!!checking[activeTask.id]}
                  onCheck={() => submitCheck(activeTask, getTaskCurrentAnswer(activeTask))}
                  onNext={() => goToNextTaskOrMini(activeTask.id)}
                  onPrev={() => goToPrevTaskOrMini(activeTask.id)}
                  onReport={() => report.open(activeTask.id)}
                />
              )}
            </div>
          ) : (
            <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
              <div className="text-gray-600">{t("lesson.pickMini")}</div>
            </div>
          )}
        </div>
      </main>
      {/* No bottom nav while solving: the task gets the whole phone screen (the nav is phone-only). */}
      <TaskReportDialog {...report.dialog} />
    </div>
  );
}


