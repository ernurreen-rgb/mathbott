"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import { inviteFriendToCoopTest, getTrialTestDetails, submitTrialTest, getTrialTestDraft, saveTrialTestDraft, listFriends, createTrialTestCoopSession, apiPath } from "@/lib/api";
import { isFactorGridComplete, parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { showToast } from "@/lib/toast";
import { TrialTestDetails, LessonTask, QuestionType, FriendUser } from "@/types";

const QRCode = dynamic(() => import("react-qr-code"), {
  ssr: false,
});

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

  const fetchTest = useCallback(async () => {
    if (!email || !testId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getTrialTestDetails(testId, email);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }
      if (data) {
        setTest(data);
        const { data: draft, error: draftErr } = await getTrialTestDraft(testId, email);
        if (draftErr) {
          console.warn("[trial-draft] load draft error:", draftErr);
        } else if (draft && data.tasks?.length) {
          const taskIds = new Set(data.tasks.map((t) => t.id));
          const filtered: Record<number, string> = {};
          for (const [k, v] of Object.entries(draft.answers)) {
            const id = Number(k);
            if (!Number.isNaN(id) && taskIds.has(id) && v != null && v !== "") filtered[id] = String(v);
          }
          console.log("[trial-draft] loaded draft", { testId, answersCount: Object.keys(filtered).length, current_task_index: draft.current_task_index });
          const idx = Math.min(Math.max(0, draft.current_task_index), data.tasks.length - 1);
          setAnswers(filtered);
          setCurrentTaskIndex(idx);
          draftRef.current = { ...draftRef.current, answers: filtered, currentTaskIndex: idx };
        } else {
          console.log("[trial-draft] no draft", { testId });
        }
      }
    } catch (e: any) {
      setError(e?.message || "Тестті жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [email, testId]);

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
  const flushDraftFromRef = () => {
    const { email: e, testId: id, answers: a, currentTaskIndex: idx } = draftRef.current;
    if (!e || !id) return;
    const url = apiPath(`trial-tests/${id}/draft`);
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: e, answers: a, current_task_index: idx }),
      keepalive: true,
    }).catch(() => {});
  };

  // Сохранение черновика при изменении; при отмене запроса сразу шлём keepalive, чтобы не потерять данные
  useEffect(() => {
    if (!test || !email) return;
    const payload = { email, answers, current_task_index: currentTaskIndex };
    console.log("[trial-draft] save effect", { testId, answersCount: Object.keys(answers).length, currentTaskIndex });
    if (saveAbortRef.current) {
      saveAbortRef.current.abort();
      flushDraftFromRef();
    }
    saveAbortRef.current = new AbortController();
    const signal = saveAbortRef.current.signal;
    const url = apiPath(`trial-tests/${testId}/draft`);
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    })
      .then((res) => {
        if (res.ok) console.log("[trial-draft] save OK", { testId });
        else console.warn("[trial-draft] save failed", { testId, status: res.status });
      })
      .catch((err) => {
        if (err?.name !== "AbortError") console.warn("[trial-draft] save error", err);
      })
      .finally(() => {
        if (saveAbortRef.current?.signal === signal) saveAbortRef.current = null;
      });
    return () => {
      if (saveAbortRef.current?.signal === signal) {
        saveAbortRef.current.abort();
        flushDraftFromRef();
      }
    };
  }, [answers, currentTaskIndex, testId, email, test]);

  // Сохранение при уходе со страницы (обновление, закрытие вкладки)
  useEffect(() => {
    const onPageHide = () => {
      const { email: e, testId: id, answers: a } = draftRef.current;
      if (!e || !id) return;
      console.log("[trial-draft] pagehide flush", { testId: id, answersCount: Object.keys(a).length });
      flushDraftFromRef();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

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
      const opts = task.options || [];
      const rawAnswer = answers[task.id];
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
      return (
        <div className="space-y-3">
          {[0, 1].map((idx) => {
            const subText = subquestions[idx]?.text || `Қосымша сұрақ ${idx + 1}`;
            return (
              <div key={`${task.id}-sub-${idx}`} className="flex items-center gap-3">
                <div className="w-6 text-gray-700 font-semibold">{labels[idx]})</div>
                <div className="flex-1">
                  <div className="text-gray-900 mb-2">
                    <MathRender latex={subText} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {opts.map((o) => {
                      const isSelected = selected[idx] === o.label;
                      return (
                        <button
                          key={`${task.id}-${idx}-${o.label}`}
                          type="button"
                          onClick={() => {
                            const next = [...selected];
                            next[idx] = o.label;
                            setAnswersAndRef((m) => ({
                              ...m,
                              [task.id]: JSON.stringify(next),
                            }));
                          }}
                          className={`text-left border rounded-lg px-3 py-2 transition-colors ${
                            isSelected
                              ? "bg-purple-600 border-purple-700 text-white"
                              : "bg-white border-gray-300 text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                          }`}
                        >
                          <div className="font-bold">{o.label}</div>
                          <div className={isSelected ? "text-white" : "text-gray-700"}>
                            <MathRender inline latex={o.text} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "mcq" || qt === "mcq6") {
      const opts = task.options || [];
      const currentAnswer = answers[task.id];

      return (
        <div className="grid grid-cols-1 gap-2">
          {opts.map((o) => {
            const isSelected = currentAnswer === o.label;

            return (
              <button
                key={`${task.id}-${o.label}`}
                onClick={() => setAnswersAndRef((m) => ({ ...m, [task.id]: o.label }))}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  isSelected
                    ? "bg-purple-600 border-purple-700 text-white"
                    : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                }`}
              >
                <div className={`font-bold ${isSelected ? "text-white" : "text-gray-900"}`}>
                  {o.label}
                </div>
                <div className={isSelected ? "text-white" : "text-gray-700"}>
                  <MathRender inline latex={o.text} />
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (qt === "factor_grid") {
      const cells = parseFactorGridAnswer(answers[task.id]);
      const renderFactorInput = (idx: number) => (
        <input
          type="text"
          value={cells[idx]}
          onChange={(e) => {
            const next = [...cells] as typeof cells;
            next[idx] = e.target.value;
            setAnswersAndRef((m) => ({
              ...m,
              [task.id]: serializeFactorGridAnswer(next),
            }));
          }}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-center text-sm text-gray-900"
          placeholder={"\u0416\u0430\u0443\u0430\u043F"}
        />
      );

      return (
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
      );
    }

    return (
      <input
        value={answers[task.id] || ""}
        onChange={(e) => setAnswersAndRef((m) => ({ ...m, [task.id]: e.target.value }))}
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400"
        placeholder="Жауап"
      />
    );
  };

  const isSelectAnswerComplete = (value?: string) => {
    if (!value) return false;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length >= 2 && parsed.every((v) => String(v).trim());
    } catch {
      return false;
    }
  };

  const isFactorGridAnswerComplete = (value?: string) => isFactorGridComplete(parseFactorGridAnswer(value));

  const handleFinishTest = async () => {
    if (!email || !test || submitting) return;

    const firstUnansweredIndex = test.tasks.findIndex((task) => {
      if (task.question_type === "select") {
        return !isSelectAnswerComplete(answers[task.id]);
      }
      if (task.question_type === "factor_grid") {
        return !isFactorGridAnswerComplete(answers[task.id]);
      }
      return !answers[task.id];
    });
    if (firstUnansweredIndex !== -1) {
      setCurrentTaskIndexAndRef(firstUnansweredIndex);
      return;
    }
    
    // Collect all answers
    const allAnswers: Record<string, string> = {};
    test.tasks.forEach((task) => {
      const value = answers[task.id];
      if (task.question_type === "select") {
        if (isSelectAnswerComplete(value)) {
          allAnswers[task.id.toString()] = value;
        }
        return;
      }
      if (task.question_type === "factor_grid") {
        if (isFactorGridAnswerComplete(value)) {
          allAnswers[task.id.toString()] = value;
        }
        return;
      }
      if (value) {
        allAnswers[task.id.toString()] = value;
      }
    });

    setSubmitting(true);
    try {
      const { data, error: err } = await submitTrialTest(testId, {
        email,
        answers: allAnswers,
      });
      
      if (err) {
        setError(err);
      } else if (data) {
        // Redirect to results page
        router.push(`/trial-test/${testId}/results`);
      }
    } catch (e: any) {
      setError(e?.message || "Тестті жіберу қатесі");
    } finally {
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
  const allTasksAnswered = test.tasks.every((t) => {
    if (t.question_type === "select") {
      return isSelectAnswerComplete(answers[t.id]);
    }
    if (t.question_type === "factor_grid") {
      return isFactorGridAnswerComplete(answers[t.id]);
    }
    return !!answers[t.id];
  });

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
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
                <h1 className="text-2xl font-bold text-gray-900">{test.title}</h1>
                {test.description && (
                  <p className="text-gray-600 mt-1">{test.description}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-700">Тапсырма</div>
                <div className="text-2xl font-bold text-gray-900">
                  {currentTaskIndex + 1} / {test.tasks.length}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handleStartCoop}
                disabled={creatingCoop || loadingFriends}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
              >
                {creatingCoop || loadingFriends ? "Жасалуда..." : "Бірлескен тест"}
              </button>
              <button
                onClick={handleFinishTest}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
              >
                {submitting ? "Жіберілуде..." : "Тестті аяқтау"}
              </button>
            </div>

            {/* Friends Modal */}
            {showFriendsModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md md:max-w-2xl lg:max-w-3xl w-full p-6 md:p-8 relative">
                  <button
                    onClick={() => setShowFriendsModal(false)}
                    className="absolute top-1 right-2 md:top-2 md:right-3 text-gray-500 hover:text-gray-700 text-2xl md:text-3xl"
                  >
                    ×
                  </button>
                  
                  {/* Шақыру сілтемесін жасау батырмасы */}
                  <div className="mb-4 md:mb-6 pb-4 md:pb-6 border-b border-gray-200">
                    <button
                      onClick={handleCreateInviteLink}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 md:py-4 px-4 md:px-6 rounded-lg flex items-center justify-center gap-2 text-base md:text-lg"
                    >
                      <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
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
                          <div className="font-semibold text-gray-900 text-base md:text-lg">
                            {friend.nickname || `Пайдаланушы #${friend.id}`}
                          </div>
                          <div className="text-sm md:text-base text-gray-500">
                            {friend.league} • {friend.total_points} ұпай
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
                  <button
                    onClick={() => {
                      setShowInviteLinkModal(false);
                      setInviteLink(null);
                    }}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
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
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      Бөлісу
                    </button>
                    <button
                      onClick={handleCopyLink}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2"
                    >
                      {copied ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Көшірілді
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
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


            {/* Progress bar */}
            <div className="mt-4 mb-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${((currentTaskIndex + 1) / test.tasks.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Task navigation */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {test.tasks.map((task, idx) => {
                const isAnswered = !!answers[task.id];
                const isCurrent = idx === currentTaskIndex;
                return (
                  <button
                    key={task.id}
                    onClick={() => setCurrentTaskIndexAndRef(idx)}
                    className={`shrink-0 w-10 h-10 rounded-lg border-2 flex items-center justify-center font-bold transition-colors ${
                      isCurrent
                        ? "bg-purple-600 border-purple-700 text-white"
                        : isAnswered
                        ? "bg-green-100 border-green-300 text-green-700"
                        : "bg-white/70 border-gray-300 text-gray-700 hover:border-purple-400"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              {currentTaskIndex > 0 && (
                <button
                  onClick={() => setCurrentTaskIndexAndRef(currentTaskIndex - 1)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  &lt; Алдыңғы сұрақ
                </button>
              )}
              {currentTaskIndex < test.tasks.length - 1 && (
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    onClick={() => setCurrentTaskIndexAndRef(currentTaskIndex + 1)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
                  >
                    Келесі сұрақ &gt;
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Current task */}
          {currentTask && (
            <div
              key={`task-${currentTask.id}-${currentTaskIndex}`}
              className="glass rounded-3xl shadow-2xl p-6 border border-white/30"
            >
              <div className="bg-white/70 rounded-2xl p-4 border border-white/40">
                <div
                  className={
                    currentTask.question_type === "factor_grid"
                      ? "mx-auto w-fit max-w-full"
                      : ""
                  }
                >
                <div className="mb-4">
                  <div
                    className={`font-semibold text-gray-900 ${getTaskTextScaleClass(normalizeTaskTextScale(currentTask.text_scale))} ${
                      currentTask.question_type === "factor_grid"
                        ? "w-full flex justify-center"
                        : ""
                    }`}
                  >
                    {currentTask.text ? (
                      <MathRender key={`task-text-${currentTask.id}`} latex={currentTask.text} />
                    ) : (
                      "Мәтіні жоқ есеп"
                    )}
                  </div>
                </div>

                {currentTask.image_filename && (
                  <div className="mb-4">
                    <Image
                      src={apiPath(`images/${currentTask.image_filename}`)}
                      alt="Task"
                      width={1280}
                      height={720}
                      unoptimized
                      className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200"
                    />
                  </div>
                )}

                <div key={`task-controls-${currentTask.id}`}>{renderTaskControls(currentTask)}</div>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentTaskIndexAndRef(Math.max(0, currentTaskIndex - 1))}
                  disabled={currentTaskIndex === 0}
                  className="bg-gray-300 hover:bg-gray-400 disabled:bg-gray-200 disabled:text-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg"
                >
                  ← Алдыңғы
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReportClick(currentTask.id)}
                    className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg"
                  >
                    Шағым
                  </button>
                  {currentTaskIndex < test.tasks.length - 1 ? (
                    <button
                      onClick={() => setCurrentTaskIndexAndRef(currentTaskIndex + 1)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      Келесі →
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
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


