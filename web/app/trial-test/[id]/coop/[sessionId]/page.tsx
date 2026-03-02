"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import {
  finishTrialTestCoopSession,
  getTrialTestCoopSession,
  getTrialTestDetails,
  apiPath,
} from "@/lib/api";
import { showToast } from "@/lib/toast";
import { API_URL } from "@/lib/constants";
import { isFactorGridComplete, parseFactorGridAnswer, serializeFactorGridAnswer } from "@/lib/factor-grid";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import { LessonTask, QuestionType, TrialTestCoopSession, TrialTestDetails } from "@/types";

type AnswersMap = Record<number, string>;

export default function TrialTestCoopPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const testId = parseInt(params.id as string);
  const sessionId = parseInt(params.sessionId as string);

  const [test, setTest] = useState<TrialTestDetails | null>(null);
  const [coopSession, setCoopSession] = useState<TrialTestCoopSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [otherAnswers, setOtherAnswers] = useState<Record<number, AnswersMap>>({});
  const [submitting, setSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [reportDialog, setReportDialog] = useState<{ taskId: number; show: boolean }>({ taskId: 0, show: false });
  const [reportMessage, setReportMessage] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const email = session?.user?.email || null;

  const participantsById = useMemo(() => {
    if (!coopSession) return new Map<number, { color: string; nickname: string | null }>();
    const map = new Map<number, { color: string; nickname: string | null }>();
    coopSession.participants.forEach((p) => {
      map.set(p.user_id, { color: p.color, nickname: p.nickname });
    });
    return map;
  }, [coopSession]);

  const currentUserId = coopSession?.current_user_id ?? null;
  const currentColor = coopSession?.current_user_color || "red";
  const otherParticipant = coopSession?.participants.find((p) => p.user_id !== currentUserId);
  const otherUserId = otherParticipant?.user_id ?? null;
  const otherColor = otherParticipant?.color || (currentColor === "red" ? "blue" : "red");

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/trial-test/${testId}/coop/${sessionId}`
      : "";

  const fetchData = useCallback(async () => {
    if (!email || !testId || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const [testRes, sessionRes] = await Promise.all([
        getTrialTestDetails(testId, email),
        getTrialTestCoopSession(sessionId, email),
      ]);

      if (testRes.error) {
        setError(testRes.error);
      } else if (testRes.data) {
        setTest(testRes.data);
      }

      if (sessionRes.error) {
        setError(sessionRes.error);
      } else if (sessionRes.data) {
        setCoopSession(sessionRes.data);
        setAnswers(sessionRes.data.answers?.user || {});
        setOtherAnswers(sessionRes.data.answers?.others || {});
      }
    } catch (e: any) {
      setError(e?.message || "Деректерді жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [email, testId, sessionId]);

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
    if (email && testId && sessionId) {
      void fetchData();
    }
  }, [email, testId, sessionId, fetchData]);

  useEffect(() => {
    const totalTasks = test?.tasks?.length ?? 0;
    if (totalTasks === 0) {
      if (currentTaskIndex !== 0) {
        setCurrentTaskIndex(0);
      }
      return;
    }
    if (currentTaskIndex > totalTasks - 1) {
      setCurrentTaskIndex(totalTasks - 1);
    }
  }, [test?.tasks?.length, currentTaskIndex]);

  useEffect(() => {
    if (!email || !coopSession) return;
    const wsEnvBase = process.env.NEXT_PUBLIC_WS_API_URL;
    const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const apiBase = envApiUrl && !envApiUrl.startsWith("/") ? envApiUrl : API_URL;
    const base = (wsEnvBase && wsEnvBase.trim()) || apiBase;
    if (!base || base.startsWith("/")) {
      // WS cannot be proxied through Next.js API routes; rely on polling instead.
      return;
    }
    const wsBase = base.replace(/^http/, "ws").replace(/\/$/, "");
    const wsUrl = `${wsBase}/ws/trial-tests/coop/${coopSession.id}?email=${encodeURIComponent(email)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "answer_update") {
          const userId = Number(payload.user_id);
          const taskId = Number(payload.task_id);
          const answer = String(payload.answer || "");
          if (currentUserId && userId === currentUserId) {
            setAnswers((prev) => ({ ...prev, [taskId]: answer }));
          } else {
            setOtherAnswers((prev) => ({
              ...prev,
              [userId]: { ...(prev[userId] || {}), [taskId]: answer },
            }));
          }
        }
        if (payload.type === "presence") {
          getTrialTestCoopSession(sessionId, email).then((res) => {
            if (!res.error && res.data) {
              setCoopSession(res.data);
              setOtherAnswers(res.data.answers?.others || {});
            }
          });
        }
      } catch (e) {
        return;
      }
    };

    ws.onerror = () => {
      // Silent - fallback to local behavior
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [email, coopSession, currentUserId, sessionId]);

  useEffect(() => {
    if (!email || !sessionId) return;
    const interval = setInterval(() => {
      getTrialTestCoopSession(sessionId, email).then((res) => {
        if (!res.error && res.data) {
          setCoopSession(res.data);
          setOtherAnswers(res.data.answers?.others || {});
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [email, sessionId]);

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    } catch {
      setCopySuccess(false);
    }
  };

  const sendAnswerUpdate = (taskId: number, answer: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({
        type: "answer_update",
        task_id: taskId,
        answer,
      })
    );
  };

  const renderTaskControls = (task: LessonTask) => {
    const qt: QuestionType = (task.question_type || "input") as QuestionType;
    if (qt === "tf") {
      const currentAnswer = answers[task.id];
      const isTrueSelected = currentAnswer === "true" || currentAnswer === "1";
      const isFalseSelected = currentAnswer === "false" || currentAnswer === "0";

      return (
        <div className="flex gap-2">
          <button
            onClick={() => {
              setAnswers((m) => ({ ...m, [task.id]: "true" }));
            }}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${
              isTrueSelected ? "bg-purple-600 text-white" : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            Дұрыс
          </button>
          <button
            onClick={() => {
              setAnswers((m) => ({ ...m, [task.id]: "false" }));
            }}
            className={`flex-1 font-bold py-2 px-3 rounded-lg transition-colors ${
              isFalseSelected ? "bg-purple-600 text-white" : "bg-red-600 hover:bg-red-700 text-white"
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
                            const allSelected = next.every((v) => v);
                            const payload = allSelected ? JSON.stringify(next) : "";
                            setAnswers((m) => ({ ...m, [task.id]: payload }));
                            sendAnswerUpdate(task.id, payload);
                          }}
                          className={`text-left border rounded-lg px-3 py-2 transition-colors ${
                            isSelected
                              ? "bg-purple-600 border-purple-700 text-white"
                              : "bg-white border-gray-300 text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                          }`}
                        >
                          <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 ${isSelected ? "text-white" : "text-gray-700"}`}>
                            <span className="font-bold shrink-0">{o.label}</span>
                            <div className="min-w-0 break-words whitespace-normal">
                              <MathRender inline latex={o.text} className={isSelected ? "text-white" : "text-gray-700"} />
                            </div>
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
      const otherAnswer = otherUserId ? otherAnswers[otherUserId]?.[task.id] : undefined;

      const localSelectedClass =
        currentColor === "red"
          ? "bg-red-500 border-red-600 text-white"
          : "bg-blue-500 border-blue-600 text-white";
      const otherSelectedClass =
        otherColor === "red" ? "ring-2 ring-red-400" : "ring-2 ring-blue-400";

      return (
        <div className="grid grid-cols-1 gap-2">
          {opts.map((o) => {
            const isSelected = currentAnswer === o.label;
            const isOtherSelected = otherAnswer === o.label;
            return (
              <button
                key={`${task.id}-${o.label}`}
                onClick={() => {
                  setAnswers((m) => ({ ...m, [task.id]: o.label }));
                  sendAnswerUpdate(task.id, o.label);
                }}
                className={`text-left border rounded-lg p-3 transition-colors ${
                  isSelected
                    ? localSelectedClass
                    : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                } ${isOtherSelected ? otherSelectedClass : ""}`}
              >
                <div className={`grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 ${isSelected ? "text-white" : "text-gray-700"}`}>
                  <span className={`font-bold shrink-0 ${isSelected ? "text-white" : "text-gray-900"}`}>{o.label}</span>
                  <div className="min-w-0 break-words whitespace-normal">
                    <MathRender inline latex={o.text} className={isSelected ? "text-white" : "text-gray-700"} />
                  </div>
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
            const payload = serializeFactorGridAnswer(next);
            setAnswers((m) => ({ ...m, [task.id]: payload }));
            sendAnswerUpdate(task.id, payload);
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
        onChange={(e) => setAnswers((m) => ({ ...m, [task.id]: e.target.value }))}
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
    if (!email || !test || submitting || !coopSession) return;
    const allAnswers: Record<number, string> = {};
    test.tasks.forEach((task) => {
      const value = answers[task.id];
      if (task.question_type === "select") {
        if (isSelectAnswerComplete(value)) {
          allAnswers[task.id] = value;
        }
        return;
      }
      if (task.question_type === "factor_grid") {
        if (isFactorGridAnswerComplete(value)) {
          allAnswers[task.id] = value;
        }
        return;
      }
      if (value) {
        allAnswers[task.id] = value;
      }
    });

    setSubmitting(true);
    try {
      const { data, error: err } = await finishTrialTestCoopSession(
        testId,
        coopSession.id,
        email,
        allAnswers
      );
      if (err) {
        setError(err);
      } else if (data) {
        router.push(`/trial-test/${testId}/coop/${coopSession.id}/results`);
      }
    } catch (e: any) {
      setError(e?.message || "Тестті жіберу қатесі");
    } finally {
      setSubmitting(false);
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

  if (error || !test || !coopSession) {
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
                {test.description && <p className="text-gray-600 mt-1">{test.description}</p>}
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-700">Тапсырма</div>
                <div className="text-2xl font-bold text-gray-900">
                  {currentTaskIndex + 1} / {test.tasks.length}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <div className="flex items-center gap-2 bg-white/70 px-3 py-1 rounded-full text-sm">
                <span className={`w-3 h-3 rounded-full ${currentColor === "red" ? "bg-red-500" : "bg-blue-500"}`} />
                <span>{participantsById.get(currentUserId || 0)?.nickname || "Сіз"}</span>
              </div>
              {otherParticipant && (
                <div className="flex items-center gap-2 bg-white/70 px-3 py-1 rounded-full text-sm">
                  <span className={`w-3 h-3 rounded-full ${otherColor === "red" ? "bg-red-500" : "bg-blue-500"}`} />
                  <span>{otherParticipant.nickname || "Дос"}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={inviteUrl}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-gray-700 bg-white/70"
              />
              <button
                onClick={handleCopyInvite}
                className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded-lg"
              >
                {copySuccess ? "Көшірілді" : "Сілтеме"}
              </button>
            </div>

            <div className="mt-4 mb-6">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${((currentTaskIndex + 1) / test.tasks.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {test.tasks.map((task, idx) => {
                const isAnswered = !!answers[task.id];
                const isCurrent = idx === currentTaskIndex;
                return (
                  <button
                    key={task.id}
                    onClick={() => setCurrentTaskIndex(idx)}
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
          </div>

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
                    className={`font-semibold text-gray-900 min-w-0 max-w-full break-words ${getTaskTextScaleClass(normalizeTaskTextScale(currentTask.text_scale))} ${
                      currentTask.question_type === "factor_grid"
                        ? "w-full flex justify-center"
                        : ""
                    }`}
                  >
                    {currentTask.text ? (
                      <MathRender key={`task-text-${currentTask.id}`} inline latex={currentTask.text} />
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

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setCurrentTaskIndex(Math.max(0, currentTaskIndex - 1))}
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
                      onClick={() => setCurrentTaskIndex(currentTaskIndex + 1)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      Келесі →
                    </button>
                  ) : (
                    <button
                      onClick={handleFinishTest}
                      disabled={!allTasksAnswered || submitting}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg"
                    >
                      {submitting ? "Жіберілуде..." : "Тестті аяқтау"}
                    </button>
                  )}
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
                {submittingReport ? "Жіберілуде..." : "Жіберу"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



