"use client";
import Icon from "@/components/ui/Icon";

import { useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import {
  getQuiz,
  getQuizQuestions,
  createQuizSession,
  deleteQuiz,
  updateQuiz,
  forkQuiz,
  getQuizSessions,
  getQuizSessionFullResults,
  finishQuizSession,
} from "@/lib/api/quizzes";
import {
  Quiz,
  QuizQuestion,
  QuizSessionSummary,
  QuizSessionFullResults,
} from "@/types/quiz";
import { QuizAvatar } from "@/components/quiz/QuizAvatar";
import toast from "react-hot-toast";
import { useI18n } from "@/lib/i18n/provider";
import { formatShortDateTime } from "@/lib/date-format";
import { tr } from "@/lib/i18n/translate";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuizDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawQuizId = Number(resolvedParams.id);
  const isValidQuizId = Number.isInteger(rawQuizId) && rawQuizId > 0;
  const quizId = isValidQuizId ? rawQuizId : 0;
  const router = useRouter();
  const { data: session } = useSession();
  const { t, intlLocale } = useI18n();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [sessions, setSessions] = useState<QuizSessionSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"questions" | "sessions">("questions");

  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [forking, setForking] = useState(false);

  // Full session results modal state
  const [selectedSessionResults, setSelectedSessionResults] = useState<QuizSessionFullResults | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [finishingSessionId, setFinishingSessionId] = useState<number | null>(null);
  const resultsRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isValidQuizId) {
      setQuiz(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const email = session?.user?.email || undefined;
        const [quizRes, questionsRes, sessionsRes] = await Promise.all([
          getQuiz(quizId, email),
          getQuizQuestions(quizId, email),
          getQuizSessions(quizId, email),
        ]);
        if (cancelled) return;

        if (quizRes.data) {
          setQuiz(quizRes.data);
        } else {
          setQuiz(null);
          toast.error(tr("quiz.notFound"));
        }

        if (questionsRes.data) {
          setQuestions(questionsRes.data);
        }

        if (sessionsRes.data) {
          setSessions(sessionsRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(tr("quiz.infoLoadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [isValidQuizId, quizId, session?.user?.email]);

  const handleStartLiveGame = async () => {
    if (questions.length === 0) {
      toast.error(t("quiz.noQuestions"));
      return;
    }

    setStartingSession(true);
    try {
      const email = session?.user?.email || undefined;
      const { data: sessionData, error } = await createQuizSession(quizId, {}, email);

      if (error || !sessionData) {
        toast.error(error || t("quiz.sessionOpenFailed"));
        setStartingSession(false);
        return;
      }

      toast.success(t("quiz.roomOpened"));
      router.push(`/quiz/host/${sessionData.id}`);
    } catch (err: any) {
      toast.error(err?.message || t("quiz.sessionStartError"));
      setStartingSession(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (deleting) return;
    if (!confirm(t("quiz.confirmDelete"))) return;
    setDeleting(true);
    try {
      const result = await deleteQuiz(quizId, session?.user?.email || undefined);
      if (result.error) {
        toast.error(result.error);
        setDeleting(false);
        return;
      }
      toast.success(t("catalog.deleted"));
      router.push("/quizzes");
    } catch {
      toast.error(t("quiz.deleteFailed"));
      setDeleting(false);
    }
  };

  const handleForkQuiz = async () => {
    if (!session?.user) {
      toast.error(t("quiz.signInToFork"));
      return;
    }
    setForking(true);
    try {
      const email = session?.user?.email || undefined;
      const { data: forked, error } = await forkQuiz(quizId, email);
      if (error || !forked) {
        toast.error(error || t("quiz.forkFailed"));
        setForking(false);
        return;
      }
      toast.success(t("quiz.forked"));
      router.push(`/quizzes/${forked.id}/edit`);
    } catch (err: any) {
      toast.error(err?.message || t("error.title"));
      setForking(false);
    }
  };

  const handleTogglePrivacy = async () => {
    if (!quiz) return;
    setTogglingPrivacy(true);
    const nextPublic = !quiz.is_public;
    try {
      const result = await updateQuiz(
        quizId,
        { is_public: nextPublic },
        session?.user?.email || undefined
      );
      if (result.error || !result.data) {
        toast.error(result.error || t("quiz.privacyFailed"));
      } else {
        setQuiz((prev) => (prev ? { ...prev, is_public: nextPublic } : null));
        toast.success(
          nextPublic
            ? t("quiz.nowPublic")
            : t("quiz.nowPrivate")
        );
      }
    } catch {
      toast.error(t("error.title"));
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const handleViewResults = async (sessionId: number) => {
    const reqId = ++resultsRequestIdRef.current;
    setSelectedSessionResults(null);
    setLoadingResults(true);
    setResultsModalOpen(true);
    try {
      const email = session?.user?.email || undefined;
      const res = await getQuizSessionFullResults(sessionId, { email });
      if (reqId !== resultsRequestIdRef.current) return;
      if (res.data) {
        setSelectedSessionResults(res.data);
      } else {
        toast.error(res.error || t("quiz.resultsFailed"));
        setResultsModalOpen(false);
      }
    } catch (err: any) {
      if (reqId !== resultsRequestIdRef.current) return;
      toast.error(err?.message || t("error.title"));
      setResultsModalOpen(false);
    } finally {
      if (reqId === resultsRequestIdRef.current) {
        setLoadingResults(false);
      }
    }
  };

  const handleFinishSession = async (sessionId: number) => {
    if (!confirm(t("quiz.confirmEndSession"))) return;
    setFinishingSessionId(sessionId);
    try {
      const email = session?.user?.email || undefined;
      const res = await finishQuizSession(sessionId, email);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("quiz.sessionEnded"));
        const sessionsRes = await getQuizSessions(quizId, email);
        if (sessionsRes.data) {
          setSessions(sessionsRes.data);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || t("quiz.sessionEndError"));
    } finally {
      setFinishingSessionId(null);
    }
  };

  const formatSessionDate = (dateStr: string) => formatShortDateTime(dateStr, intlLocale);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600">{t("quiz.loading")}</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center p-8 bg-white rounded-3xl shadow-md border border-gray-100 max-w-sm">
          <h2 className="text-xl font-bold text-gray-800 mb-2">{t("quiz.notFound")}</h2>
          <p className="text-sm text-gray-500 mb-4">{t("quiz.notFoundHint")}</p>
          <Link
            href="/quizzes"
            className="inline-block px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm"
          >
            {t("quiz.backToAll")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64">
      <DesktopNav currentPage="quizzes" />
      <MobileNav currentPage="quizzes" />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
          <Link href="/quizzes" className="hover:text-purple-600 transition-colors">
            {t("nav.quizzes")}
          </Link>
          <span>/</span>
          <span className="text-gray-900 truncate max-w-xs">{quiz.title}</span>
        </div>

        {/* Hero Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-purple-100/70 shadow-lg shadow-purple-500/5 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    quiz.is_public
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  }`}
                >
                  {quiz.is_public ? (
                    <>
                      <Icon name="globe" /> {t("quiz.publicBadge")}
                    </>
                  ) : (
                    <>
                      <Icon name="lock" /> {t("quiz.privateBadge")}
                    </>
                  )}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {t("catalog.questionsCount", { count: questions.length })}
                </span>
                {quiz.grade && (
                  <Link href={`/quizzes?grade=${quiz.grade}`} className="px-2.5 py-1 rounded-full text-xs font-bold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100">
                    {t("catalog.gradeN", { n: quiz.grade })}
                  </Link>
                )}
                {quiz.topic && (
                  <Link href={`/quizzes?topic=${encodeURIComponent(quiz.topic)}`} className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100" title={t("catalog.topicQuizzes")}>
                    {quiz.topic}
                  </Link>
                )}
              </div>
              {!quiz.is_public && (
                <div className="mb-3 p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-start gap-2 text-xs text-amber-900">
                  <span className="text-sm">
                    <Icon name="lock" />
                  </span>
                  <span>
                    <strong>{t("quiz.privateBadge")}:</strong> {t("quiz.privateNote")}
                  </span>
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-2">
                {quiz.title}
              </h1>

              {quiz.description && (
                <p className="text-gray-600 text-sm leading-relaxed max-w-2xl mb-4">
                  {quiz.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500">
                {quiz.author_nickname && (
                  <span>
                    {t("quiz.author")}: <strong className="text-gray-700">{quiz.author_nickname}</strong>
                  </span>
                )}
                <span>•</span>
                <span>
                  {t("quiz.createdAt", { date: new Date(quiz.created_at).toLocaleDateString(intlLocale) })}
                </span>
              </div>
            </div>

            {/* Launch Game Action Button */}
            <div className="w-full md:w-auto flex flex-col gap-3">
              <button
                onClick={handleStartLiveGame}
                disabled={startingSession || questions.length === 0}
                className="w-full md:w-auto px-8 py-4 rounded-2xl font-extrabold text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl shadow-purple-500/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:scale-100"
              >
                {startingSession ? (
                  <span className="inline-block">
                    <Icon name="loader" className="animate-spin" />
                  </span>
                ) : (
                  <Icon name="play" className="w-6 h-6 text-yellow-300" />
                )}
                <span>{t("quiz.startLive")}</span>
              </button>

              {quiz.can_manage && (
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <Link
                    href={`/quizzes/${quiz.id}/edit`}
                    className="px-3.5 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-1.5"
                    title={t("quiz.editHint")}
                  >
                    <Icon name="edit" className="w-3.5 h-3.5" />
                    <span>{t("common.edit")}</span>
                  </Link>
                  <button
                    onClick={handleTogglePrivacy}
                    disabled={togglingPrivacy}
                    title={
                      quiz.is_public
                        ? t("quiz.makePrivateHint")
                        : t("quiz.makePublicHint")
                    }
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      quiz.is_public
                        ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    } disabled:opacity-50`}
                  >
                    {togglingPrivacy ? (
                      <span className="text-xs">
                        <Icon name="loader" className="animate-spin" />
                      </span>
                    ) : (
                      <span>
                        {quiz.is_public ? (
                          <>
                            <Icon name="lock" /> {t("quiz.makePrivate")}
                          </>
                        ) : (
                          <>
                            <Icon name="globe" /> {t("quiz.makePublic")}
                          </>
                        )}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowAnswers(!showAnswers)}
                    className="px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {showAnswers ? t("quiz.hideAnswers") : t("quiz.showAnswers")}
                  </button>
                  <button
                    onClick={handleDeleteQuiz}
                    disabled={deleting}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-50"
                    title={t("quiz.deleteHint")}
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              )}

              {!quiz.can_manage && quiz.is_public && (
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  <button
                    onClick={handleForkQuiz}
                    disabled={forking}
                    className="px-4 py-2 rounded-xl border border-purple-200 bg-purple-50 text-xs font-bold text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    title={t("quiz.forkHint")}
                  >
                    {forking ? (
                      <Icon name="loader" className="animate-spin w-3.5 h-3.5" />
                    ) : (
                      <Icon name="copy" className="w-3.5 h-3.5" />
                    )}
                    <span>{t("quiz.forkEdit")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab("questions")}
            className={`pb-3 px-3 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "questions"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon name="layers" className="w-4 h-4" />
            <span>{t("trial.questions")}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === "questions"
                  ? "bg-purple-100 text-purple-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {questions.length}
            </span>
          </button>

          {session?.user && (
            <button
              onClick={() => setActiveTab("sessions")}
              className={`pb-3 px-3 text-sm font-extrabold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === "sessions"
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <Icon name="trophy" className="w-4 h-4" />
              <span>{t("quiz.sessionsTitle")}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  activeTab === "sessions"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {sessions.length}
              </span>
            </button>
          )}
        </div>

        {/* TAB 1: QUESTIONS BREAKDOWN */}
        {activeTab === "questions" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center justify-between">
              <span>{t("quiz.questionsList", { count: questions.length })}</span>
            </h2>

            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="bg-white/85 backdrop-blur-sm rounded-2xl p-5 border border-purple-100 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 font-extrabold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {q.question_type === "mcq"
                        ? t("quiz.type.mcq")
                        : q.question_type === "tf"
                        ? t("quiz.type.tf")
                        : q.question_type === "multi_select"
                        ? t("quiz.type.multi")
                        : t("quiz.type.input")}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                    <span>
                      <Icon name="timer" /> {t("quiz.seconds", { count: q.time_limit_seconds })}
                    </span>
                    <span>
                      <Icon name="star" /> {t("host.points", { count: q.points })}
                    </span>
                  </div>
                </div>

                {/* Question Text with KaTeX */}
                <div className="text-base text-gray-900 font-medium mb-4">
                  <MathRender latex={q.question_text} />
                </div>

                {/* Options Preview */}
                {q.question_type === "input" ? (
                  showAnswers && (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
                      <span className="font-bold">{t("quiz.correctMath")}</span>
                      <MathRender latex={q.correct_answer || ""} />
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {q.options?.map((opt) => {
                      const isCorrect =
                        showAnswers &&
                        (q.question_type === "multi_select"
                          ? q.correct_answer?.split(",").includes(opt.id)
                          : q.correct_answer === opt.id);

                      return (
                        <div
                          key={opt.id}
                          className={`p-3 rounded-xl border text-sm flex items-center gap-2.5 transition-all ${
                            isCorrect
                              ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                              : "bg-gray-50/80 border-gray-200/80 text-gray-700"
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md text-xs font-bold flex items-center justify-center ${
                              isCorrect
                                ? "bg-emerald-600 text-white"
                                : "bg-gray-200 text-gray-700"
                            }`}
                          >
                            {opt.id}
                          </span>
                          <div className="flex-1">
                            <MathRender latex={opt.text} />
                          </div>
                          {isCorrect && (
                            <span className="text-emerald-600 text-xs font-bold">
                              <Icon name="check" /> {t("answer.correctBadge")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {showAnswers && q.explanation && (
                  <div className="mt-3 p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-xs text-purple-900">
                    <span className="font-bold block mb-1">{t("quiz.explanation")}</span>
                    <MathRender latex={q.explanation} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: PAST SESSIONS & SAVED STUDENT RESULTS */}
        {activeTab === "sessions" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {t("quiz.sessionsTitleN", { count: sessions.length })}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t("quiz.sessionsHint")}
                </p>
              </div>

              <button
                onClick={handleStartLiveGame}
                disabled={startingSession || questions.length === 0}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-500/20 transition-all flex items-center gap-2"
              >
                <Icon name="play" className="w-3.5 h-3.5" />
                <span>{t("quiz.newGame")}</span>
              </button>
            </div>

            {sessions.length === 0 ? (
              <div className="bg-white/90 backdrop-blur rounded-3xl p-10 border border-purple-100 text-center shadow-sm">
                <div className="w-16 h-16 rounded-3xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-4 text-2xl">
                  <Icon name="trophy" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {t("quiz.noSessions")}
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mb-6">
                  {t("quiz.noSessionsHint")}
                </p>
                <button
                  onClick={handleStartLiveGame}
                  disabled={startingSession || questions.length === 0}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-extrabold shadow-lg shadow-purple-500/25 transition-all"
                >
                  {t("quiz.openRoom")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((s) => {
                  const isFinished = s.status === "finished";
                  const isInProgress = s.status === "in_progress";

                  return (
                    <div
                      key={s.id}
                      className="bg-white/95 backdrop-blur rounded-2xl p-5 border border-purple-100 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                              isFinished
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : isInProgress
                                ? "bg-amber-50 text-amber-800 border border-amber-200 animate-pulse"
                                : "bg-blue-50 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {isFinished ? (
                              <>
                                <Icon name="check" className="w-3 h-3" /> {t("host.statusFinished")}
                              </>
                            ) : isInProgress ? (
                              <>
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />{" "}
                                {t("quiz.inProgress")}
                              </>
                            ) : (
                              <>
                                <Icon name="users" className="w-3 h-3" /> {t("quiz.lobby")}
                              </>
                            )}
                          </span>

                          <span className="font-mono font-bold text-sm text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200">
                            PIN: {s.pin_code}
                          </span>

                          <span className="text-xs text-gray-500">
                            {formatSessionDate(s.created_at)}
                          </span>
                        </div>

                        {/* Host action buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleViewResults(s.id)}
                            className="px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold border border-purple-200 transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="chart" className="w-3.5 h-3.5" />
                            <span>{t("trialHistory.viewResults")}</span>
                          </button>

                          <Link
                            href={`/quiz/host/${s.id}`}
                            className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold border border-gray-200 transition-colors flex items-center gap-1.5"
                          >
                            <Icon name="arrowRight" className="w-3.5 h-3.5" />
                            <span>{isFinished ? t("quiz.podium") : t("quiz.goToRoom")}</span>
                          </Link>

                          {!isFinished && (
                            <button
                              onClick={() => handleFinishSession(s.id)}
                              disabled={finishingSessionId === s.id}
                              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold border border-red-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              title={t("quiz.endHint")}
                            >
                              {finishingSessionId === s.id ? (
                                <Icon name="loader" className="animate-spin w-3.5 h-3.5" />
                              ) : (
                                <Icon name="stop" className="w-3.5 h-3.5" />
                              )}
                              <span>{t("quiz.end")}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Stat summary pills */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
                        <div className="bg-slate-50/80 rounded-xl p-3 border border-gray-100 text-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">
                            {t("quiz.participants")}
                          </span>
                          <span className="text-lg font-black text-gray-900">
                            {t("quiz.studentsCount", { count: s.participant_count })}
                          </span>
                        </div>

                        <div className="bg-slate-50/80 rounded-xl p-3 border border-gray-100 text-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">
                            {t("quiz.finishedCol")}
                          </span>
                          <span className="text-lg font-black text-emerald-600">
                            {s.finished_count}
                          </span>
                        </div>

                        <div className="bg-slate-50/80 rounded-xl p-3 border border-gray-100 text-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">
                            {t("quiz.avgScore")}
                          </span>
                          <span className="text-lg font-black text-purple-700 font-mono">
                            {s.avg_score.toLocaleString(intlLocale)}
                          </span>
                        </div>

                        <div className="bg-slate-50/80 rounded-xl p-3 border border-gray-100 text-center">
                          <span className="text-[10px] font-bold uppercase text-gray-500 block mb-0.5">
                            {t("quiz.maxScore")}
                          </span>
                          <span className="text-lg font-black text-amber-600 font-mono">
                            {s.max_score.toLocaleString(intlLocale)}
                          </span>
                        </div>
                      </div>

                      {/* Podium / Top Participants preview */}
                      {s.top_participants && s.top_participants.length > 0 && (
                        <div className="pt-2 border-t border-gray-100">
                          <div className="text-xs font-extrabold text-gray-700 mb-2 flex items-center gap-1.5">
                            <Icon name="medal" className="w-3.5 h-3.5 text-amber-500" />
                            <span>{t("quiz.topPlayers")}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {s.top_participants.slice(0, 3).map((topP, index) => {
                              const medal =
                                index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                              const medalBorder =
                                index === 0
                                  ? "border-amber-300 bg-amber-50/60"
                                  : index === 1
                                  ? "border-slate-300 bg-slate-50/80"
                                  : "border-orange-200 bg-orange-50/60";

                              return (
                                <div
                                  key={topP.id}
                                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 ${medalBorder}`}
                                >
                                  <span className="text-base select-none">{medal}</span>
                                  <QuizAvatar
                                    avatarColor={topP.avatar_color}
                                    nickname={topP.nickname}
                                    size="sm"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-gray-900 truncate">
                                      {topP.nickname}
                                    </div>
                                    <div className="text-[11px] font-mono text-gray-500">
                                      {t("host.points", { count: topP.score })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FULL RESULTS MODAL DIALOG */}
        {resultsModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-purple-100 animate-fadeIn">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black flex items-center gap-2">
                    <Icon name="trophy" className="w-5 h-5 text-amber-300" />
                    <span>{t("quiz.fullResults")}</span>
                  </h3>
                  {selectedSessionResults && (
                    <div className="text-xs text-purple-200 flex items-center gap-2 mt-0.5">
                      <span>PIN: {selectedSessionResults.session.pin_code}</span>
                      <span>•</span>
                      <span>{t("quiz.participantsCount", { count: selectedSessionResults.total_players })}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setResultsModalOpen(false);
                    setSelectedSessionResults(null);
                  }}
                  className="w-8 h-8 rounded-full bg-static-white/20 hover:bg-static-white/30 text-white flex items-center justify-center transition-colors"
                >
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {loadingResults ? (
                  <div className="py-16 text-center">
                    <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-600">
                      {t("review.loading")}
                    </p>
                  </div>
                ) : selectedSessionResults ? (
                  <>
                    {/* Stat Badges */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-purple-50 rounded-2xl p-3 border border-purple-100 text-center">
                        <span className="text-[10px] font-bold uppercase text-purple-700 block mb-0.5">
                          {t("quiz.participants")}
                        </span>
                        <span className="text-xl font-black text-purple-900">
                          {selectedSessionResults.total_players}
                        </span>
                      </div>

                      <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100 text-center">
                        <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-0.5">
                          {t("quiz.finishedCol")}
                        </span>
                        <span className="text-xl font-black text-emerald-900">
                          {
                            selectedSessionResults.participants.filter(
                              (p) => p.is_finished
                            ).length
                          }
                        </span>
                      </div>

                      <div className="bg-amber-50 rounded-2xl p-3 border border-amber-100 text-center">
                        <span className="text-[10px] font-bold uppercase text-amber-700 block mb-0.5">
                          {t("quiz.avgPoints")}
                        </span>
                        <span className="text-xl font-black text-amber-900 font-mono">
                          {selectedSessionResults.participants.length > 0
                            ? Math.round(
                                selectedSessionResults.participants.reduce(
                                  (acc, p) => acc + (p.score || 0),
                                  0
                                ) / selectedSessionResults.participants.length
                              ).toLocaleString()
                            : 0}
                        </span>
                      </div>

                      <div className="bg-indigo-50 rounded-2xl p-3 border border-indigo-100 text-center">
                        <span className="text-[10px] font-bold uppercase text-indigo-700 block mb-0.5">
                          {t("quiz.maxPoints")}
                        </span>
                        <span className="text-xl font-black text-indigo-900 font-mono">
                          {Math.max(
                            0,
                            ...selectedSessionResults.participants.map(
                              (p) => p.score || 0
                            )
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Question Accuracy Section (if any) */}
                    {selectedSessionResults.question_stats &&
                      selectedSessionResults.question_stats.length > 0 && (
                        <div className="bg-slate-50 rounded-2xl p-4 border border-gray-200/80">
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-3 flex items-center gap-1.5">
                            <Icon name="chart" className="w-3.5 h-3.5 text-purple-600" />
                            <span>{t("quiz.accuracyByQuestion")}</span>
                          </h4>

                          <div className="space-y-2.5">
                            {selectedSessionResults.question_stats.map((stat, sIdx) => {
                              const pct =
                                stat.total_answers > 0
                                  ? Math.round(
                                      (stat.correct_answers / stat.total_answers) * 100
                                    )
                                  : 0;
                              const barColor =
                                pct >= 70
                                  ? "bg-emerald-500"
                                  : pct >= 40
                                  ? "bg-amber-500"
                                  : "bg-red-500";

                              return (
                                <div key={stat.question_id} className="text-xs">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-gray-800">
                                      {t("quiz.questionStat", { n: sIdx + 1, correct: stat.correct_answers, total: stat.total_answers })}
                                    </span>
                                    <span className="font-mono font-bold text-gray-700">
                                      {pct}%
                                    </span>
                                  </div>
                                  <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all ${barColor}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {/* Participant Leaderboard Table */}
                    <div>
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-700 mb-3 flex items-center gap-1.5">
                        <Icon name="users" className="w-3.5 h-3.5 text-purple-600" />
                        <span>{t("quiz.ranking", { count: selectedSessionResults.participants.length })}</span>
                      </h4>

                      <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-gray-600 uppercase font-bold border-b border-gray-200">
                              <tr>
                                <th className="py-3 px-3.5 text-center w-12">#</th>
                                <th className="py-3 px-3">{t("quiz.col.participant")}</th>
                                <th className="py-3 px-3 text-right">{t("quiz.col.score")}</th>
                                <th className="py-3 px-3 text-center">{t("quiz.col.correctTotal")}</th>
                                <th className="py-3 px-3 text-center">{t("quizPlay.accuracy")}</th>
                                <th className="py-3 px-3 text-center">{t("quiz.col.status")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                              {selectedSessionResults.participants.map((p) => {
                                const medal =
                                  p.rank === 1
                                    ? "🥇"
                                    : p.rank === 2
                                    ? "🥈"
                                    : p.rank === 3
                                    ? "🥉"
                                    : `#${p.rank}`;

                                return (
                                  <tr
                                    key={p.id}
                                    className={`hover:bg-purple-50/40 transition-colors ${
                                      p.rank <= 3 ? "font-semibold" : ""
                                    }`}
                                  >
                                    <td className="py-3 px-3.5 text-center font-bold text-sm">
                                      {medal}
                                    </td>
                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2.5">
                                        <QuizAvatar
                                          avatarColor={p.avatar_color}
                                          nickname={p.nickname}
                                          size="sm"
                                        />
                                        <span className="text-gray-900 font-bold truncate max-w-[140px] sm:max-w-none">
                                          {p.nickname}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono font-black text-purple-700 text-sm">
                                      {p.score.toLocaleString(intlLocale)}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono text-gray-700">
                                      {p.correct_count} / {selectedSessionResults.question_stats.length || questions.length}
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                                          p.accuracy_percent >= 70
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : p.accuracy_percent >= 40
                                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                                            : "bg-red-50 text-red-700 border border-red-200"
                                        }`}
                                      >
                                        {p.accuracy_percent}%
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                      {p.is_finished ? (
                                        <span className="text-emerald-600 font-bold text-[11px] flex items-center justify-center gap-1">
                                          <Icon name="check" className="w-3 h-3" /> {t("host.finishedBadge")}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400 text-[11px]">
                                          {t("quiz.inGame")}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-gray-500">
                    {t("quiz.noInfo")}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                {selectedSessionResults && (
                  <Link
                    href={`/quiz/host/${selectedSessionResults.session.id}`}
                    className="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="trophy" className="w-3.5 h-3.5" />
                    <span>{t("quiz.podium3d")}</span>
                  </Link>
                )}

                <button
                  onClick={() => {
                    setResultsModalOpen(false);
                    setSelectedSessionResults(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition-colors ml-auto"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
