"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getLessonDetails } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { LessonDetails, LessonMiniLesson, LessonTask, QuestionType } from "@/types";
import { showToast } from "@/lib/toast";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

type CheckResult = { correct: boolean; correct_answer?: string | null };

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function LessonPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const lessonId = parseInt(params.id as string);

  const [lesson, setLesson] = useState<LessonDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMiniId, setSelectedMiniId] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [checking, setChecking] = useState<Record<number, boolean>>({});
  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [correctAnswers, setCorrectAnswers] = useState<Record<number, string>>({});
  const [showCongrats, setShowCongrats] = useState(false);
  const [reportDialog, setReportDialog] = useState<{ taskId: number; show: boolean }>({ taskId: 0, show: false });
  const [reportMessage, setReportMessage] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const email = session?.user?.email || null;

  const prevLessonCompletedRef = useRef<boolean | null>(null);
  const congratsShownRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const fetchLesson = async (opts?: { silent?: boolean }) => {
    if (!email || !lessonId) return;
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const { data, error: err } = await getLessonDetails(lessonId, email);
    if (err) {
      if (!silent) setError(err);
      else console.error("Failed to fetch lesson:", err);
    }
    if (data) {
      setLesson(data);
      if (!selectedMiniId) {
        const firstNotCompleted = data.mini_lessons.find((ml) => !ml.progress?.completed);
        setSelectedMiniId((firstNotCompleted || data.mini_lessons[0])?.id ?? null);
      }
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    if (email && lessonId) {
      fetchLesson();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, lessonId]);

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

      const moduleId = lesson?.module_id;
      const sectionId = lesson?.section_id;
      const target =
        moduleId && sectionId ? `/modules/${moduleId}#section-${sectionId}` : "/modules";

      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => {
        router.push(target);
      }, 2200);
    }

    prevLessonCompletedRef.current = completed;
  }, [lesson, router]);

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

  // When mini-lesson changes or tasks update, pick the first not completed task
  useEffect(() => {
    if (!selectedMini) {
      setActiveTaskId(null);
      return;
    }
    const firstPending = orderedMiniTasks.find((t) => t.status !== "completed");
    setActiveTaskId((prev) => {
      // If current task still exists and is not completed, keep it
      if (prev && orderedMiniTasks.some((t) => t.id === prev && t.status !== "completed")) return prev;
      return (firstPending || orderedMiniTasks[0])?.id ?? null;
    });
    // Reset per-task feedback when switching mini-lesson
    setFeedback({});
    setSelectedAnswers({});
    setCorrectAnswers({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMiniId, selectedMini?.id, orderedMiniTasks.length]);

  const lessonProgressPct = useMemo(() => {
    const p = lesson?.progress?.progress ?? 0;
    return Math.round(clamp01(p) * 100);
  }, [lesson]);

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

  const goToNextTaskOrMini = (currentTaskId: number) => {
    const idx = orderedMiniTasks.findIndex((t) => t.id === currentTaskId);
    if (idx < 0) return;
    const nextTask = orderedMiniTasks.slice(idx + 1).find((t) => t.status !== "completed") || orderedMiniTasks[idx + 1];
    if (nextTask) {
      setActiveTaskId(nextTask.id);
      return;
    }
    if (nextMiniId) {
      setSelectedMiniId(nextMiniId);
      setActiveTaskId(null);
      return;
    }
    // lesson fully completed or no next mini
    setActiveTaskId(null);
  };

  const submitCheck = async (task: LessonTask, answer: string) => {
    if (!email) return;
    setChecking((m) => ({ ...m, [task.id]: true }));
    setFeedback((m) => ({ ...m, [task.id]: { ok: true, text: "" } }));
    // Save selected answer
    setSelectedAnswers((m) => ({ ...m, [task.id]: answer }));
    try {
      const res = await fetch(`${API_URL}/api/task/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, answer, email }),
      });
      const data: CheckResult = await res.json();
      if (!res.ok) {
        setFeedback((m) => ({ ...m, [task.id]: { ok: false, text: (data as any)?.detail || "Тексеру қатесі" } }));
        return;
      }
      if (data.correct) {
        updateTaskStatusLocal(task.id, "completed");
        setFeedback((m) => ({ ...m, [task.id]: { ok: true, text: "Дұрыс! ✅" } }));
        // Save correct answer - if API provides it, use it; otherwise the selected answer is correct
        const correctAns = data.correct_answer || answer;
        setCorrectAnswers((m) => ({ ...m, [task.id]: correctAns }));

        // Quietly refresh lesson progress without showing the full-page loader
        void fetchLesson({ silent: true });
      } else {
        const correctText = data.correct_answer ? `Дұрыс жауап: ${data.correct_answer}` : "Қате";
        setFeedback((m) => ({ ...m, [task.id]: { ok: false, text: correctText } }));
        // Save correct answer even if wrong
        if (data.correct_answer) {
          setCorrectAnswers((m) => ({ ...m, [task.id]: data.correct_answer! }));
        }
      }
    } catch (e: any) {
      setFeedback((m) => ({ ...m, [task.id]: { ok: false, text: e?.message || "Желі қатесі" } }));
    } finally {
      setChecking((m) => ({ ...m, [task.id]: false }));
    }
  };

  const handleReportClick = (taskId: number) => {
    setReportDialog({ taskId, show: true });
    setReportMessage("");
  };

  const submitReport = async () => {
    if (!email || !reportMessage.trim()) return;

    setSubmittingReport(true);
    try {
      const res = await fetch(`${API_URL}/api/reports?email=${encodeURIComponent(email)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: reportDialog.taskId,
          message: reportMessage.trim(),
        }),
      });

      if (!res.ok) {
        let errorDetail = "Шағымды жіберу мүмкін болмады";
        try {
          const data = await res.json();
          console.error("Report submission error:", data);
          // Handle different error response formats from error handler
          if (data.error?.detail) {
            errorDetail = data.error.detail;
          } else if (data.detail) {
            errorDetail = data.detail;
          } else if (data.message) {
            errorDetail = data.message;
          } else if (typeof data === 'string') {
            errorDetail = data;
          }
        } catch (e) {
          console.error("Failed to parse error response:", e);
          errorDetail = `HTTP ${res.status}: ${res.statusText}`;
        }
        showToast.error(`Қате: ${errorDetail}`);
        return;
      }

      const data = await res.json();

      showToast.success("Шағым сәтті жіберілді! Әкімші тексерісін күтіңіз.");
      setReportDialog({ taskId: 0, show: false });
      setReportMessage("");
    } catch (e: any) {
      showToast.error(`Қате: ${e?.message || "Желі қатесі"}`);
    } finally {
      setSubmittingReport(false);
    }
  };

  const renderTaskControls = (task: LessonTask) => {
    const qt: QuestionType = (task.question_type || "input") as QuestionType;
    if (qt === "tf") {
      const selectedAnswer = selectedAnswers[task.id];
      const correctAnswer = correctAnswers[task.id];
      const isAnswered = selectedAnswer !== undefined;
      const isCompleted = task.status === "completed";

      // Normalize answers for comparison (case-insensitive)
      const normalizeAnswer = (ans: string | undefined) => ans?.toLowerCase().trim();
      const selectedNormalized = normalizeAnswer(selectedAnswer);
      const correctNormalized = normalizeAnswer(correctAnswer);
      const isTrueCorrect = correctNormalized === "true" || correctNormalized === "1";
      const isFalseCorrect = correctNormalized === "false" || correctNormalized === "0";
      const isTrueSelected = selectedNormalized === "true" || selectedNormalized === "1";
      const isFalseSelected = selectedNormalized === "false" || selectedNormalized === "0";

      return (
        <div className="flex gap-2" role="group" aria-label="Жауап таңдау">
          <button
            onClick={() => submitCheck(task, "true")}
            disabled={!!checking[task.id] || isCompleted}
            aria-label="Дұрыс деп таңдау"
            aria-pressed={isAnswered && isTrueSelected ? "true" : "false"}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              isAnswered && isTrueSelected
                ? isTrueCorrect
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
                : isAnswered && isTrueCorrect
                ? "bg-green-600 text-white"
                : isCompleted
                ? "bg-gray-300 text-gray-600"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            Дұрыс
          </button>
          <button
            onClick={() => submitCheck(task, "false")}
            disabled={!!checking[task.id] || isCompleted}
            aria-label="Жалған деп таңдау"
            aria-pressed={isAnswered && isFalseSelected ? "true" : "false"}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
              isAnswered && isFalseSelected
                ? isFalseCorrect
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
                : isAnswered && isFalseCorrect
                ? "bg-green-600 text-white"
                : isCompleted
                ? "bg-gray-300 text-gray-600"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            Жалған
          </button>
        </div>
      );
    }

    if (qt === "select") {
      const opts = task.options || [];
      const rawAnswer = selectedAnswers[task.id] || "";
      let selected: string[] = ["", ""];
      if (rawAnswer) {
        try {
          const parsed = JSON.parse(rawAnswer);
          if (Array.isArray(parsed)) {
            selected = [parsed[0] || "", parsed[1] || ""];
          }
        } catch {
          // ignore parse errors
        }
      }
      const subquestions = task.subquestions || [];
      const labels = ["A", "B"];
      const correctAnswer = correctAnswers[task.id];
      let correctList: string[] = [];
      if (correctAnswer) {
        try {
          const parsed = JSON.parse(correctAnswer);
          if (Array.isArray(parsed)) {
            correctList = parsed.map((v) => String(v));
          }
        } catch {
          // ignore
        }
      }
      const allSelected = selected.every((v) => v);
      const isCompleted = task.status === "completed";
      const isCorrect =
        allSelected &&
        correctList.length === 2 &&
        selected[0] === correctList[0] &&
        selected[1] === correctList[1];
      const borderClass = !allSelected
        ? "border-gray-300"
        : isCorrect
        ? "border-green-500"
        : "border-red-500";

      return (
        <div className="space-y-3">
          {[0, 1].map((idx) => {
            const subText = subquestions[idx]?.text || `Қосымша сұрақ ${idx + 1}`;
            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-6 text-gray-700 font-semibold">{labels[idx]})</div>
                <div className="flex-1">
                  <div className="text-gray-900 mb-2">{subText}</div>
                  <select
                    value={selected[idx]}
                    onChange={(e) => {
                      const next = [...selected];
                      next[idx] = e.target.value;
                      setSelectedAnswers((m) => ({
                        ...m,
                        [task.id]: JSON.stringify(next),
                      }));
                      if (next.every((v) => v)) {
                        submitCheck(task, JSON.stringify(next));
                      }
                    }}
                    disabled={!!checking[task.id] || isCompleted}
                    className={`w-full border ${borderClass} rounded-lg px-3 py-2 text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400`}
                  >
                    <option value="" disabled>
                      Жауап таңдаңыз
                    </option>
                    {opts.map((o) => (
                      <option key={o.label} value={o.label}>
                        {o.label}. {o.text}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "mcq" || qt === "mcq6") {
      const opts = task.options || [];
      const selectedAnswer = selectedAnswers[task.id];
      const correctAnswer = correctAnswers[task.id];
      const isAnswered = selectedAnswer !== undefined;
      const isCompleted = task.status === "completed";

      return (
        <div className="grid grid-cols-1 gap-2">
          {opts.map((o) => {
            const isSelected = isAnswered && selectedAnswer === o.label;
            const isCorrect = correctAnswer === o.label;
            const isWrong = isSelected && !isCorrect;

            return (
              <button
                key={o.label}
                onClick={() => submitCheck(task, o.label)}
                disabled={!!checking[task.id] || isCompleted}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  isSelected && isCorrect
                    ? "bg-green-600 border-green-700 text-white"
                    : isWrong
                    ? "bg-red-600 border-red-700 text-white"
                    : isAnswered && isCorrect
                    ? "bg-green-600 border-green-700 text-white"
                    : isCompleted
                    ? "border-gray-200 bg-gray-100"
                    : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                }`}
              >
                <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 ${isSelected && isCorrect || isAnswered && isCorrect ? "text-white" : isWrong ? "text-white" : "text-gray-700"}`}>
                  <span className={`font-bold shrink-0 ${isSelected && isCorrect || isAnswered && isCorrect ? "text-white" : isWrong ? "text-white" : "text-gray-900"}`}>
                    {o.label}
                  </span>
                  <span className="min-w-0 break-words whitespace-normal">{o.text}</span>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (qt === "factor_grid") {
      const cells = parseFactorGridAnswer(answers[task.id]);
      const isCompleted = task.status === "completed";
      const renderFactorInput = (idx: number) => (
        <input
          type="text"
          value={cells[idx]}
          onChange={(e) => {
            const next = [...cells] as typeof cells;
            next[idx] = e.target.value;
            setAnswers((m) => ({
              ...m,
              [task.id]: serializeFactorGridAnswer(next),
            }));
          }}
          disabled={isCompleted}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-center text-sm text-gray-900"
          placeholder={"\u0416\u0430\u0443\u0430\u043F"}
        />
      );

      return (
        <div className="space-y-3">
          <div className="inline-flex max-w-full flex-col gap-2 sm:gap-3">
            {[0, 1].map((row) => (
              <div
                key={`${task.id}-factor-row-${row}`}
                className="flex items-center justify-between gap-[2.75rem] sm:gap-[3.5rem] md:gap-[4rem]"
              >
                <div className="w-[4.5rem] sm:w-[5.5rem]">{renderFactorInput(row * 2)}</div>
                <div className="w-[4.5rem] sm:w-[5.5rem]">{renderFactorInput(row * 2 + 1)}</div>
              </div>
            ))}
          </div>
          <button
            onClick={() => submitCheck(task, serializeFactorGridAnswer(cells))}
            disabled={!!checking[task.id] || isCompleted}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
          >
            {"\u0422\u0435\u043A\u0441\u0435\u0440\u0443"}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={answers[task.id] || ""}
          onChange={(e) => setAnswers((m) => ({ ...m, [task.id]: e.target.value }))}
          disabled={task.status === "completed"}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400"
          placeholder="Жауап"
        />
        <button
          onClick={() => submitCheck(task, answers[task.id] || "")}
          disabled={!!checking[task.id] || task.status === "completed"}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
        >
          Тексеру
        </button>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Сабақтарға қолжетімділік үшін кіріңіз</div>
      </div>
    );
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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error || "Сабақты жүктеу мүмкін болмады"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>

      {showCongrats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-white/40 w-full max-w-sm p-8 text-center">
            <div className="text-6xl mb-3 animate-bounce">🎉</div>
            <div className="text-2xl font-extrabold text-gray-900">Құттықтаймыз!</div>
            <div className="text-sm text-gray-600 mt-1">Сабақ аяқталды</div>
            <div className="mt-5 flex items-center justify-center gap-2 text-gray-700">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <span className="text-sm font-semibold">Бөлімге оралу...</span>
            </div>
          </div>
        </div>
      )}

      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-4xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <button
              onClick={() => router.back()}
              className="text-gray-700 hover:text-gray-900 mb-4"
            >
              ← Артқа
            </button>

            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Сабақ {lesson.lesson_number ?? lesson.id}</div>
                <h1 className="text-2xl font-bold text-gray-900">{lesson.title || "Атау жоқ"}</h1>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-700">Ілгерілеу</div>
                <div className="text-2xl font-bold text-gray-900">{lessonProgressPct}%</div>
              </div>
            </div>

            {/* 4-step progress bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                {lesson.mini_lessons
                  .slice()
                  .sort((a, b) => a.mini_index - b.mini_index)
                  .map((ml, idx, arr) => {
                    const completed = !!ml.progress?.completed;
                    const active = selectedMiniId === ml.id;
                    return (
                      <div key={ml.id} className="flex-1 flex items-center">
                        <button
                          onClick={() => setSelectedMiniId(ml.id)}
                          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold transition-colors ${
                            completed
                              ? "bg-green-600 border-green-700 text-white"
                              : active
                                ? "bg-purple-600 border-purple-700 text-white"
                                : "bg-white/70 border-gray-300 text-gray-700 hover:border-purple-400"
                          }`}
                          title={ml.title || `Кіші сабақ ${ml.mini_index}`}
                        >
                          {ml.mini_index}
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

          {/* Selected mini-lesson */}
          {selectedMini ? (
            <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <div className="text-sm text-gray-600">Кіші сабақ {selectedMini.mini_index}</div>
                  <div className="text-xl font-bold text-gray-900">{selectedMini.title}</div>
                </div>
                {selectedMini.progress && (
                  <div className="text-sm text-gray-700">
                    {selectedMini.progress.completed_count}/{selectedMini.progress.total}
                  </div>
                )}
              </div>

              {orderedMiniTasks.length === 0 ? (
                <div className="text-gray-600">Бұл кіші сабақта әлі есептер жоқ.</div>
              ) : !activeTask ? (
                <div className="text-gray-700">
                  Кіші сабақ аяқталды.
                  {nextMiniId ? (
                    <button
                      type="button"
                      onClick={() => setSelectedMiniId(nextMiniId)}
                      className="ml-3 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      Келесі кіші сабақ →
                    </button>
                  ) : (
                    <span className="ml-2 font-semibold">Сабақ аяқталды!</span>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    Есеп {orderedMiniTasks.findIndex((t) => t.id === activeTask.id) + 1} / {orderedMiniTasks.length}
                  </div>

                  <div className="bg-white/70 rounded-2xl p-4 border border-white/40">
                    <div
                      className={
                        activeTask.question_type === "factor_grid"
                          ? "mx-auto w-fit max-w-full"
                          : ""
                      }
                    >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div
                        className={`font-semibold text-gray-900 min-w-0 max-w-full break-words ${getTaskTextScaleClass(normalizeTaskTextScale(activeTask.text_scale))} ${
                          activeTask.question_type === "factor_grid"
                            ? "w-full flex justify-center"
                            : ""
                        }`}
                      >
                        {activeTask.text || "Мәтіні жоқ есеп"}
                      </div>
                    </div>

                    {renderTaskControls(activeTask)}

                    {feedback[activeTask.id]?.text && (
                      <div
                        className={`mt-2 text-sm ${
                          feedback[activeTask.id]?.ok ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {feedback[activeTask.id]?.text}
                      </div>
                    )}
                    </div>

                    {activeTask.status === "completed" && (
                      <div className="mt-4 flex justify-between items-center">
                        <button
                          type="button"
                          onClick={() => handleReportClick(activeTask.id)}
                          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
                        >
                          Шағым
                        </button>
                        <button
                          type="button"
                          onClick={() => goToNextTaskOrMini(activeTask.id)}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
                        >
                          Келесі →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
              <div className="text-gray-600">Кіші сабақты таңдаңыз.</div>
            </div>
          )}
        </div>
      </main>
      <MobileNav currentPage="modules" />

      {/* Report Dialog */}
      {reportDialog.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Шағым жіберу</h3>
            <p className="text-gray-600 mb-4">
              Бұл тапсырмамен мәселе бар ма? Әкімшіге хабарлаңыз.
            </p>
            <textarea
              value={reportMessage}
              onChange={(e) => setReportMessage(e.target.value)}
              placeholder="Мәселені сипаттаңыз"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 min-h-[100px] resize-none"
              maxLength={500}
            />
            <div className="text-sm text-gray-500 mb-4">
              {reportMessage.length}/500 таңба
            </div>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setReportDialog({ taskId: 0, show: false })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={submittingReport}
              >
                Бас тарту
              </button>
              <button
                onClick={submitReport}
                disabled={!reportMessage.trim() || submittingReport}
                className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
              >
                {submittingReport ? "Жіберіледі..." : "Жіберу"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


