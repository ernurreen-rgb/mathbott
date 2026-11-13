"use client";
import Icon from "@/components/ui/Icon";


import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import TaskStatement from "@/components/student/TaskStatement";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import StudentWrittenAnswerFields from "@/components/student/StudentWrittenAnswerFields";
import StudentChoiceAnswerFields from "@/components/student/StudentChoiceAnswerFields";
import { TaskReportDialog, useTaskReport } from "@/components/student/TaskReportDialog";
import { getTrialTestDetails, getTrialTestResults, submitTrialTest, getTrialTestDraft, reportTrialTestTask, apiPath } from "@/lib/api";
import { getTaskMcqCorrectCount } from "@/lib/question-options";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { getAnsweredTrialTaskCount, getTrialTaskAnswerProgress, isTrialTaskAnswerComplete } from "@/lib/trial-test-answer";
import { TrialTestDetails, LessonTask, QuestionType } from "@/types";
import styles from "./TrialTestWorkspace.module.css";


export default function TrialTestPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const testId = parseInt(params.id as string);

  const [test, setTest] = useState<TrialTestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [taskNavigatorOpen, setTaskNavigatorOpen] = useState(false);
  const taskNavigatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!taskNavigatorOpen) return;
    const handleOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !taskNavigatorRef.current?.contains(event.target)) {
        setTaskNavigatorOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaskNavigatorOpen(false);
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [taskNavigatorOpen]);

  const email = session?.user?.email || null;
  const report = useTaskReport(email && testId ? (taskId, message) => reportTrialTestTask(email, testId, taskId, message) : null);
  const activeEmailRef = useRef(email);
  activeEmailRef.current = email;

  // Реф для сохранения при уходе со страницы; обновляем синхронно при вводе, чтобы при мгновенном refresh не потерять данные
  const draftRef = useRef<{ answers: Record<number, string>; currentTaskIndex: number; email: string | null; testId: number }>({
    answers: {},
    currentTaskIndex: 0,
    email: null,
    testId: 0,
  });
  useEffect(() => {
    draftRef.current = { answers, currentTaskIndex, email, testId };
  }, [answers, currentTaskIndex, email, testId]);

  const setAnswersAndRef = useCallback((updater: React.SetStateAction<Record<number, string>>) => {
    setAnswers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      draftRef.current = { ...draftRef.current, answers: next };
      return next;
    });
  }, []);
  const setCurrentTaskIndexAndRef = useCallback((value: React.SetStateAction<number>) => {
    setCurrentTaskIndex((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      draftRef.current = { ...draftRef.current, currentTaskIndex: next };
      return next;
    });
  }, []);

  const saveAbortRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraftSignatureRef = useRef("");
  const pendingDraftSaveRef = useRef<{ signature: string; keepalive: boolean } | null>(null);
  const writableDraftKeyRef = useRef<string | null>(null);
  const submittedRef = useRef(false);
  const attemptIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  const openSavedResult = useCallback((resultId?: number) => {
    writableDraftKeyRef.current = null;
    submittedRef.current = true;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    pendingDraftSaveRef.current = null;
    setLoading(true);
    router.replace(`/trial-test/${testId}/results${resultId ? `?attempt=${resultId}` : ""}`);
  }, [router, testId]);

  const buildDraftSnapshot = useCallback((snapshot = draftRef.current) => {
    const { email: e, testId: id, answers: a, currentTaskIndex: idx } = snapshot;
    if (!e || !id) return null;
    const sortedAnswers = Object.fromEntries(
      Object.entries(a).sort(([left], [right]) => Number(left) - Number(right))
    );
    const payload = { email: e, answers: sortedAnswers, current_task_index: idx };
    return {
      url: apiPath(`trial-tests/${id}/draft`),
      payload,
      signature: JSON.stringify({ test_id: id, ...payload }),
    };
  }, []);

  const sendDraftSnapshot = useCallback(
    async (snapshot = draftRef.current, options?: { keepalive?: boolean }) => {
      if (snapshot.email !== activeEmailRef.current) return;
      if (writableDraftKeyRef.current !== `${snapshot.email}:${snapshot.testId}`) return;
      const request = buildDraftSnapshot(snapshot);
      if (!request) return;

      const keepalive = options?.keepalive === true;
      const pending = pendingDraftSaveRef.current;
      if (pending?.signature === request.signature && (pending.keepalive || !keepalive)) return;
      if (request.signature === lastSavedDraftSignatureRef.current && !pending) return;
      if (saveAbortRef.current) {
        saveAbortRef.current.abort();
        saveAbortRef.current = null;
      }

      const controller = keepalive ? null : new AbortController();
      if (controller) saveAbortRef.current = controller;
      const save = { signature: request.signature, keepalive };
      const generation = loadGenerationRef.current;
      pendingDraftSaveRef.current = save;

      try {
        const res = await fetch(request.url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
          keepalive,
          signal: controller?.signal,
        });
        if (res.ok && pendingDraftSaveRef.current === save && generation === loadGenerationRef.current &&
          activeEmailRef.current === snapshot.email && writableDraftKeyRef.current === `${snapshot.email}:${snapshot.testId}`) {
          lastSavedDraftSignatureRef.current = request.signature;
        } else if (!res.ok) {
          console.warn("[trial-draft] save failed", { testId: snapshot.testId, status: res.status });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.warn("[trial-draft] save error", err);
      } finally {
        if (controller && saveAbortRef.current === controller) saveAbortRef.current = null;
        if (pendingDraftSaveRef.current === save) pendingDraftSaveRef.current = null;
      }
    },
    [buildDraftSnapshot]
  );

  const flushDraft = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    void sendDraftSnapshot(draftRef.current, { keepalive: true });
  }, [sendDraftSnapshot]);

  const fetchTest = useCallback(async () => {
    if (!email || !testId) return;
    const generation = ++loadGenerationRef.current;
    const isCurrentLoad = () => loadGenerationRef.current === generation;
    writableDraftKeyRef.current = null;
    submittedRef.current = false;
    attemptIdRef.current = null;
    setSubmitting(false);
    setLoading(true);
    setError(null);
    setTest(null);
    setAnswers({});
    setCurrentTaskIndex(0);
    try {
      const { data, error: err } = await getTrialTestDetails(testId, email);
      if (!isCurrentLoad()) return;
      if (err) {
        setError(err);
        return;
      }
      if (data) {
        const { data: draft, error: draftErr } = await getTrialTestDraft(testId, email);
        if (!isCurrentLoad()) return;
        if (draftErr || !draft) {
          setError("Сақталған жауаптарды жүктеу мүмкін болмады. Бетті қайта жүктеңіз.");
          return;
        }
        if (data.tasks?.length) {
          const taskIds = new Set(data.tasks.map((t) => t.id));
          const filtered: Record<number, string> = {};
          for (const [k, v] of Object.entries(draft.answers)) {
            const id = Number(k);
            if (!Number.isNaN(id) && taskIds.has(id) && v != null && v !== "") filtered[id] = String(v);
          }
          const idx = Math.min(Math.max(0, draft.current_task_index), data.tasks.length - 1);
          setAnswers(filtered);
          setCurrentTaskIndex(idx);
          draftRef.current = { answers: filtered, currentTaskIndex: idx, email, testId };
          const snapshot = buildDraftSnapshot({
            answers: filtered,
            currentTaskIndex: idx,
            email,
            testId,
          });
          lastSavedDraftSignatureRef.current = snapshot?.signature || "";
        } else {
          const snapshot = buildDraftSnapshot({
            answers: {},
            currentTaskIndex: 0,
            email,
            testId,
          });
          lastSavedDraftSignatureRef.current = snapshot?.signature || "";
        }
        writableDraftKeyRef.current = `${email}:${testId}`;
        setTest(data);
      }
    } catch (e: any) {
      if (isCurrentLoad()) setError(e?.message || "Тестті жүктеу қатесі");
    } finally {
      if (isCurrentLoad() && !submittedRef.current) setLoading(false);
    }
  }, [buildDraftSnapshot, email, testId]);

  useEffect(() => {
    if (email && testId) {
      void fetchTest();
    }
    return () => {
      flushDraft();
      loadGenerationRef.current += 1;
      writableDraftKeyRef.current = null;
      pendingDraftSaveRef.current = null;
      saveAbortRef.current?.abort();
      saveAbortRef.current = null;
    };
  }, [email, testId, fetchTest, flushDraft]);

  useEffect(() => {
    const totalTasks = test?.tasks?.length ?? 0;
    if (totalTasks === 0) {
      if (currentTaskIndex !== 0) {
        setCurrentTaskIndexAndRef(0);
      }
      return;
    }
    if (currentTaskIndex > totalTasks - 1) {
      setCurrentTaskIndexAndRef(totalTasks - 1);
    }
  }, [test?.tasks?.length, currentTaskIndex, setCurrentTaskIndexAndRef]);

  // Отправить черновик из ref (keepalive — не отменяется при unload)
  // Сохранение черновика при изменении; при отмене запроса сразу шлём keepalive, чтобы не потерять данные
  useEffect(() => {
    if (loading || !test || !email || submitting) return;
    const snapshot = buildDraftSnapshot({ answers, currentTaskIndex, email, testId });
    if (!snapshot || (snapshot.signature === lastSavedDraftSignatureRef.current && !pendingDraftSaveRef.current)) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      void sendDraftSnapshot();
    }, 800);
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [answers, buildDraftSnapshot, currentTaskIndex, email, loading, sendDraftSnapshot, submitting, test, testId]);

  // Browser departure and SPA cleanup share the same final keepalive flush.
  useEffect(() => {
    window.addEventListener("pagehide", flushDraft);
    return () => window.removeEventListener("pagehide", flushDraft);
  }, [flushDraft]);

  const renderTaskControls = (task: LessonTask) => {
    const qt: QuestionType = (task.question_type || "input") as QuestionType;
    if (qt === "tf") {
      const currentAnswer = answers[task.id];
      const isTrueSelected = currentAnswer === "true" || currentAnswer === "1";
      const isFalseSelected = currentAnswer === "false" || currentAnswer === "0";

      return (
        <div className="flex gap-2">
          <button
            onClick={() => setAnswersAndRef((m) => ({ ...m, [task.id]: "true" }))}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${
              isTrueSelected
                ? "bg-purple-600 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            Дұрыс
          </button>
          <button
            onClick={() => setAnswersAndRef((m) => ({ ...m, [task.id]: "false" }))}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${
              isFalseSelected
                ? "bg-purple-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            Жалған
          </button>
        </div>
      );
    }

    if (qt === "select") {
      const subquestions = task.subquestions || [];
      if (getTaskAnswerMode(task) === "choices") {
        return (
          <StudentChoiceAnswerFields
            task={task}
            layout="stack"
            value={answers[task.id]}
            onChange={(value) => setAnswersAndRef((m) => ({ ...m, [task.id]: value }))}
          />
        );
      }
      return (
        <div className="space-y-3">
          <StudentWrittenAnswerFields
            value={answers[task.id]}
            onChange={(value) => setAnswersAndRef((m) => ({ ...m, [task.id]: value }))}
            count={2}
            labels={[0, 1].map((index) =>
              `${String.fromCharCode(65 + index)}) ${subquestions[index]?.text || `Қосымша сұрақ ${index + 1}`}`
            )}
          />
        </div>
      );
    }

    if (qt === "mcq" || qt === "mcq6") {
      const currentAnswer = answers[task.id];
      const requiredCount = getTaskMcqCorrectCount(task);

      if (getTaskAnswerMode(task) === "choices") {
        return (
          <StudentChoiceAnswerFields
            task={task}
            layout="stack"
            value={currentAnswer}
            onChange={(value) => setAnswersAndRef((m) => ({ ...m, [task.id]: value }))}
          />
        );
      }

      return (
        <div className="space-y-3">
          {requiredCount > 1 && <p className="text-sm text-gray-600">{requiredCount} жауап жазыңыз</p>}
          <StudentWrittenAnswerFields
            value={currentAnswer}
            onChange={(value) => setAnswersAndRef((m) => ({ ...m, [task.id]: value }))}
            count={requiredCount}
          />
        </div>
      );
    }

    return (
      <StudentMathAnswerInput
        value={answers[task.id] || ""}
        onChange={(value) => setAnswersAndRef((m) => ({ ...m, [task.id]: value }))}
        placeholder="Жауапты жазыңыз"
      />
    );
  };

  const handleFinishTest = async () => {
    if (!email || !test || submitting) return;

    const firstUnansweredIndex = test.tasks.findIndex((task) => !isTrialTaskAnswerComplete(task, answers[task.id]));
    if (firstUnansweredIndex !== -1) {
      setCurrentTaskIndexAndRef(firstUnansweredIndex);
      return;
    }
    
    // Collect all answers
    const allAnswers: Record<string, string> = {};
    test.tasks.forEach((task) => {
      const value = answers[task.id];
      if (isTrialTaskAnswerComplete(task, value) && value != null) {
        allAnswers[task.id.toString()] = value;
      }
    });

    const generation = loadGenerationRef.current;
    writableDraftKeyRef.current = null;
    pendingDraftSaveRef.current = null;
    setSubmitting(true);
    try {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      if (saveAbortRef.current) {
        saveAbortRef.current.abort();
        saveAbortRef.current = null;
      }

      const { data, error: err } = await submitTrialTest(testId, {
        email,
        answers: allAnswers,
        attempt_id: attemptIdRef.current ??= Array.from(
          crypto.getRandomValues(new Uint8Array(16)),
          (byte) => byte.toString(16).padStart(2, "0")
        ).join(""),
      });

      if (generation !== loadGenerationRef.current) return;
      
      if (err) {
        // Recover only this attempt; older results must not swallow a failed retake.
        const savedResults = await getTrialTestResults(testId, email);
        if (generation !== loadGenerationRef.current) return;
        const savedAttempt = savedResults.data?.find((result) => result.attempt_id === attemptIdRef.current);
        if (savedAttempt) {
          openSavedResult(savedAttempt.id);
        } else {
          setError(err);
        }
      } else if (data) {
        openSavedResult(data.result_id);
      }
    } catch (e: any) {
      if (generation === loadGenerationRef.current) setError(e?.message || "Тестті жіберу қатесі");
    } finally {
      if (generation === loadGenerationRef.current) {
        if (!submittedRef.current) writableDraftKeyRef.current = `${email}:${testId}`;
        setSubmitting(false);
      }
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Тестке қолжетімділік үшін кіріңіз</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Тест жүктелуде…</div>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error || "Тестті жүктеу мүмкін болмады"}
        </div>
      </div>
    );
  }

  const currentTask = test.tasks[currentTaskIndex];
  const answeredTasksCount = getAnsweredTrialTaskCount(test.tasks, answers);
  const answerProgress = getTrialTaskAnswerProgress(test.tasks, answers);

  return (
    <div className={styles.page}>
      <DesktopNav />
      <main className={`md:ml-64 ${styles.main}`}>
        <div className={styles.workspace}>
          <header className={styles.toolbar}>
            <div className={styles.testInfo}>
              <button
                type="button"
                onClick={() => router.back()}
                className={styles.backButton}
                aria-label="Артқа"
                title="Артқа"
              >
                <Icon name="arrowLeft" />
              </button>
              <div className={styles.testTitle}>
                <h1 title={test.title}>{test.title}</h1>
                {test.description && (
                  <p title={test.description}>{test.description}</p>
                )}
              </div>
            </div>
            <div className={styles.toolbarActions}>
              <span className={styles.taskCounter} aria-live="polite">
                <span>Тапсырма</span>
                <strong>
                  {currentTaskIndex + 1} / {test.tasks.length}
                </strong>
              </span>
              <div ref={taskNavigatorRef} className={styles.navigator}>
                <button
                  type="button"
                  className={styles.navigatorToggle}
                  onClick={() => setTaskNavigatorOpen((open) => !open)}
                  aria-expanded={taskNavigatorOpen}
                  aria-controls="trial-task-navigator"
                >
                  <Icon name="layers" /> Сұрақтар
                </button>
                {taskNavigatorOpen && (
                  <nav id="trial-task-navigator" className={styles.navigatorPanel} aria-label="Тапсырма нөмірлері">
                    <div className={styles.navigatorHeading}>
                      <span>Тапсырмалар</span>
                      <span>{answeredTasksCount} / {test.tasks.length} орындалды</span>
                    </div>
                    <div className={styles.taskNumbers}>
                      {test.tasks.map((task, idx) => {
                        const isAnswered = isTrialTaskAnswerComplete(task, answers[task.id]);
                        const isCurrent = idx === currentTaskIndex;
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => {
                              setCurrentTaskIndexAndRef(idx);
                              setTaskNavigatorOpen(false);
                            }}
                            className={`${styles.taskNumber} ${isCurrent ? styles.currentTaskNumber : isAnswered ? styles.answeredTaskNumber : ""}`}
                            aria-current={isCurrent ? "step" : undefined}
                            aria-label={`Тапсырма ${idx + 1}${isAnswered ? ", жауап берілді" : ""}`}
                          >
                            {idx + 1}
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                )}
              </div>
              <button
                type="button"
                onClick={handleFinishTest}
                disabled={submitting}
                className={styles.finishButton}
              >
                {submitting ? "Жіберілуде..." : "Тестті аяқтау"}
              </button>
            </div>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label="Тест барысы"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={answerProgress}
              aria-valuetext={`${answeredTasksCount} / ${test.tasks.length} орындалды`}
            >
              <div style={{ width: `${answerProgress}%` }} />
            </div>
          </header>

          {/* Current task */}
          {currentTask && (
            <article
              key={`task-${currentTask.id}-${currentTaskIndex}`}
              className={styles.taskCard}
              aria-label={`Тапсырма ${currentTaskIndex + 1}`}
            >
              <div className={styles.taskBody}>
                <TaskStatement task={currentTask} />
                <div key={`task-controls-${currentTask.id}`} className={styles.answers}>{renderTaskControls(currentTask)}</div>
              </div>

              <nav className={styles.taskFooter} aria-label="Сұрақтар арасында өту">
                <button
                  type="button"
                  onClick={() => setCurrentTaskIndexAndRef(Math.max(0, currentTaskIndex - 1))}
                  disabled={currentTaskIndex === 0}
                  className={styles.previousButton}
                >
                  <Icon name="arrowLeft" /> Алдыңғы
                </button>
                <button
                  type="button"
                  onClick={() => report.open(currentTask.id)}
                  className={styles.reportButton}
                >
                  <Icon name="report" /> Шағым
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTaskIndexAndRef(currentTaskIndex + 1)}
                  disabled={currentTaskIndex >= test.tasks.length - 1}
                  className={styles.nextButton}
                >
                  Келесі <Icon name="arrowRight" />
                </button>
              </nav>
            </article>
          )}
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
      <TaskReportDialog {...report.dialog} />
    </div>
  );
}




