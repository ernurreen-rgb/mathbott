"use client";
import Icon from "@/components/ui/Icon";


import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import StudentWrittenAnswerFields from "@/components/student/StudentWrittenAnswerFields";
import StudentChoiceAnswerFields from "@/components/student/StudentChoiceAnswerFields";
import { inviteFriendToCoopTest, getTrialTestDetails, getTrialTestResults, submitTrialTest, getTrialTestDraft, listFriends, createTrialTestCoopSession, apiPath } from "@/lib/api";
import { getTaskMcqCorrectCount } from "@/lib/question-options";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { getTaskTextScaleStyle, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { showToast } from "@/lib/toast";
import { getAnsweredTrialTaskCount, getTrialTaskAnswerProgress, isTrialTaskAnswerComplete } from "@/lib/trial-test-answer";
import { TrialTestDetails, LessonTask, QuestionType, FriendUser } from "@/types";
import styles from "./TrialTestWorkspace.module.css";

const QRCode = dynamic(() => import("react-qr-code"), {
  ssr: false,
});

const COOP_TEST_UI_ENABLED = false;

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
  const [creatingCoop, setCreatingCoop] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [coopSessionId, setCoopSessionId] = useState<number | null>(null);
  const [showInviteLinkModal, setShowInviteLinkModal] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reportDialog, setReportDialog] = useState<{ taskId: number; show: boolean }>({ taskId: 0, show: false });
  const [reportMessage, setReportMessage] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
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
      if (writableDraftKeyRef.current !== `${snapshot.email}:${snapshot.testId}`) return;
      const request = buildDraftSnapshot(snapshot);
      if (!request || request.signature === lastSavedDraftSignatureRef.current) return;

      const keepalive = options?.keepalive === true;
      if (saveAbortRef.current) {
        saveAbortRef.current.abort();
        saveAbortRef.current = null;
      }

      const controller = keepalive ? null : new AbortController();
      if (controller) saveAbortRef.current = controller;

      try {
        const res = await fetch(request.url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.payload),
          keepalive,
          signal: controller?.signal,
        });
        if (res.ok) {
          lastSavedDraftSignatureRef.current = request.signature;
        } else {
          console.warn("[trial-draft] save failed", { testId: snapshot.testId, status: res.status });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") console.warn("[trial-draft] save error", err);
      } finally {
        if (controller && saveAbortRef.current === controller) saveAbortRef.current = null;
      }
    },
    [buildDraftSnapshot]
  );

  const fetchTest = useCallback(async () => {
    if (!email || !testId) return;
    const generation = ++loadGenerationRef.current;
    const isCurrentLoad = () => loadGenerationRef.current === generation;
    writableDraftKeyRef.current = null;
    submittedRef.current = false;
    attemptIdRef.current = null;
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

  const handleReportClick = (taskId: number) => {
    setReportDialog({ taskId, show: true });
    setReportMessage("");
  };

  const submitReport = async () => {
    if (!email || reportMessage.trim().length < 5) return;
    setSubmittingReport(true);
    try {
      const res = await fetch(`${apiPath("trial-test-reports")}?email=${encodeURIComponent(email)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trial_test_id: testId,
          task_id: reportDialog.taskId,
          message: reportMessage.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data?.detail || data?.error?.detail || "Шағым жіберу қатесі";
        showToast.error(detail);
        return;
      }
      showToast.success("Шағым сәтті жіберілді!");
      setReportDialog({ taskId: 0, show: false });
      setReportMessage("");
    } catch (e: any) {
      showToast.error(e?.message || "Желі қатесі");
    } finally {
      setSubmittingReport(false);
    }
  };

  useEffect(() => {
    if (email && testId) {
      void fetchTest();
    }
    return () => {
      loadGenerationRef.current += 1;
      writableDraftKeyRef.current = null;
    };
  }, [email, testId, fetchTest]);

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
    if (!snapshot || snapshot.signature === lastSavedDraftSignatureRef.current) return;

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

  // Сохранение при уходе со страницы (обновление, закрытие вкладки)
  useEffect(() => {
    const onPageHide = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      void sendDraftSnapshot(draftRef.current, { keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [sendDraftSnapshot]);

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

    writableDraftKeyRef.current = null;
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
      
      if (err) {
        // Recover only this attempt; older results must not swallow a failed retake.
        const savedResults = await getTrialTestResults(testId, email);
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
      setError(e?.message || "Тестті жіберу қатесі");
    } finally {
      if (!submittedRef.current) writableDraftKeyRef.current = `${email}:${testId}`;
      setSubmitting(false);
    }
  };

  const handleStartCoop = async () => {
    if (!email || !testId || creatingCoop) return;
    setLoadingFriends(true);
    setError(null);
    try {
      // Сначала создаем сессию
      setCreatingCoop(true);
      const { data: sessionData, error: sessionErr } = await createTrialTestCoopSession(testId, email);
      if (sessionErr) {
        setError(sessionErr);
        setCreatingCoop(false);
        setLoadingFriends(false);
        return;
      }
      
      if (!sessionData) {
      setError("Сессияны құру мүмкін болмады");
        setCreatingCoop(false);
        setLoadingFriends(false);
        return;
      }
      
      setCoopSessionId(sessionData.session_id);
      
      // Проверяем, есть ли друзья
      const { data: friendsData, error: friendsErr } = await listFriends(email);
      if (friendsErr) {
        setError(friendsErr);
      } else if (friendsData && friendsData.items && friendsData.items.length > 0) {
        setFriends(friendsData.items);
        setShowFriendsModal(true);
      } else {
        // Если нет друзей, сразу показываем модальное окно со ссылкой
        const link = `${window.location.origin}/trial-test/${testId}/coop/${sessionData.session_id}`;
        setInviteLink(link);
        setShowInviteLinkModal(true);
      }
      setCreatingCoop(false);
    } catch (e: any) {
      setError(e?.message || "Достарды жүктеу қатесі");
      setCreatingCoop(false);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleInviteFriend = async (friend: FriendUser) => {
    if (!email || !testId || creatingCoop || !coopSessionId) return;
    setCreatingCoop(true);
    setError(null);
    try {
      const { data, error: err } = await inviteFriendToCoopTest(testId, email, friend.id);
      if (err) {
        setError(err);
      } else if (data) {
        setShowFriendsModal(false);
        alert(`Шақыру жіберілді ${friend.nickname || `пайдаланушыға #${friend.id}`}!`);
        // Можно сразу перейти в сессию
        router.push(`/trial-test/${testId}/coop/${data.session_id}`);
      }
    } catch (e: any) {
      setError(e?.message || "Шақыруды жіберу қатесі");
    } finally {
      setCreatingCoop(false);
    }
  };

  const handleCreateInviteLink = () => {
    if (!coopSessionId) return;
    const link = `${window.location.origin}/trial-test/${testId}/coop/${coopSessionId}`;
    setInviteLink(link);
    setShowInviteLinkModal(true);
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  const handleShareLink = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Бірлескен тестке шақыру",
          text: `Бірлескен тестке қосылыңыз: ${test?.title || "Тест"}`,
          url: inviteLink,
        });
      } else {
        // Fallback: copy to clipboard
        await handleCopyLink();
      }
    } catch (e: any) {
      // User cancelled or error
      if (e.name !== "AbortError") {
        console.error("Failed to share link:", e);
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
  const allTasksAnswered = answeredTasksCount === test.tasks.length;

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
              {COOP_TEST_UI_ENABLED && (
                <button
                  onClick={handleStartCoop}
                  disabled={creatingCoop || loadingFriends}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
                >
                  {creatingCoop || loadingFriends ? "Жасалуда..." : "Бірлескен тест"}
                </button>
              )}
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

            {/* Friends Modal */}
            {showFriendsModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md md:max-w-2xl lg:max-w-3xl w-full p-6 md:p-8 relative">
                  <button aria-label="Терезені жабу"
                    onClick={() => setShowFriendsModal(false)}
                    className="absolute top-1 right-2 md:top-2 md:right-3 text-gray-500 hover:text-gray-700 text-2xl md:text-3xl"
                  >
                    <Icon name="close" />
                  </button>
                  
                  {/* Шақыру сілтемесін жасау батырмасы */}
                  <div className="mb-4 md:mb-6 pb-4 md:pb-6 border-b border-gray-200">
                    <button
                      onClick={handleCreateInviteLink}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 md:py-4 px-4 md:px-6 rounded-lg flex items-center justify-center gap-2 text-base md:text-lg"
                    >
                      <Icon name="share" className="w-5 h-5 md:w-6 md:h-6" />
                      Шақыру сілтемесін жасау
                    </button>
                  </div>

                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 md:mb-6">Достарды таңдау</h2>

                  <div className="space-y-2 md:space-y-3 max-h-96 md:max-h-[500px] overflow-y-auto">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center justify-between p-3 md:p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900 min-w-0 max-w-full break-words text-base md:text-lg">
                            {friend.nickname || `Пайдаланушы #${friend.id}`}
                          </div>
                          <div className="text-sm md:text-base text-gray-500">
                            {friend.total_solved} есеп
                          </div>
                        </div>
                        <button
                          onClick={() => handleInviteFriend(friend)}
                          disabled={creatingCoop}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 md:py-3 px-4 md:px-6 rounded-lg text-sm md:text-base ml-4"
                        >
                          {creatingCoop ? "..." : "Шақыру"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Invite Link Modal */}
            {showInviteLinkModal && inviteLink && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md md:max-w-lg w-full p-6 md:p-8 relative">
                  <button aria-label="Терезені жабу"
                    onClick={() => {
                      setShowInviteLinkModal(false);
                      setInviteLink(null);
                    }}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    <Icon name="close" />
                  </button>
                  
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Сілтемемен бөлісу</h2>
                  
                  <div className="flex justify-center mb-4">
                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                      <QRCode value={inviteLink} size={200} />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleShareLink}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2"
                    >
                      <Icon name="share" className="w-5 h-5" />
                      Бөлісу
                    </button>
                    <button
                      onClick={handleCopyLink}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2"
                    >
                      {copied ? (
                        <>
                          <Icon name="check" className="w-5 h-5" />
                          Көшірілді
                        </>
                      ) : (
                        <>
                          <Icon name="copy" className="w-5 h-5" />
                          Көшіру
                        </>
                      )}
                    </button>
                  </div>
                  
                  {copied && (
                    <div className="mt-3 text-center text-green-600 font-semibold">
                      Сілтеме көшірілді!
                    </div>
                  )}
                </div>
              </div>
            )}


          {/* Current task */}
          {currentTask && (
            <article
              key={`task-${currentTask.id}-${currentTaskIndex}`}
              className={styles.taskCard}
              aria-label={`Тапсырма ${currentTaskIndex + 1}`}
            >
              <div className={styles.taskBody}>
                <div
                  className={styles.statement}
                  data-text-scale={normalizeTaskTextScale(currentTask.text_scale)}
                  style={getTaskTextScaleStyle(currentTask.text_scale)}
                >
                  {currentTask.text ? (
                    <MathRender key={`task-text-${currentTask.id}`} inline latex={currentTask.text} />
                  ) : (
                    "Мәтіні жоқ есеп"
                  )}
                </div>

                {currentTask.image_filename && (
                  <div>
                    <Image
                      src={apiPath(`images/${currentTask.image_filename}`)}
                      alt="Task"
                      width={1280}
                      height={720}
                      unoptimized
                      className={styles.taskImage}
                    />
                  </div>
                )}

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
                  onClick={() => handleReportClick(currentTask.id)}
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
              {reportMessage.length}/500 таңба (мин. 5)
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
                disabled={reportMessage.trim().length < 5 || submittingReport}
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




