"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import MathRender from "@/components/ui/MathRender";
import { getQuiz, getQuizQuestions, createQuizSession, deleteQuiz } from "@/lib/api/quizzes";
import { Quiz, QuizQuestion } from "@/types/quiz";
import toast from "react-hot-toast";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function QuizDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const quizId = parseInt(resolvedParams.id, 10);
  const router = useRouter();
  const { data: session } = useSession();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    if (!quizId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [quizRes, questionsRes] = await Promise.all([
          getQuiz(quizId),
          getQuizQuestions(quizId),
        ]);

        if (quizRes.data) {
          setQuiz(quizRes.data);
        } else {
          toast.error("Квиз табылмады");
        }

        if (questionsRes.data) {
          setQuestions(questionsRes.data);
        }
      } catch (err) {
        console.error(err);
        toast.error("Ақпаратты жүктеу қатесі");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [quizId]);

  const handleStartLiveGame = async () => {
    if (questions.length === 0) {
      toast.error("Квизде сұрақтар жоқ. Алдымен сұрақ қосыңыз!");
      return;
    }

    setStartingSession(true);
    try {
      const email = session?.user?.email || undefined;
      const { data: sessionData, error } = await createQuizSession(quizId, {}, email);

      if (error || !sessionData) {
        toast.error(error || "Ойын сессиясын ашу мүмкін болмады");
        setStartingSession(false);
        return;
      }

      toast.success("Ойын бөлмесі ашылды!");
      router.push(`/quiz/host/${sessionData.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Сессияны бастау кезінде қате");
      setStartingSession(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (!confirm("Бұл квизді өшіргіңіз келетініне сенімдісіз бе?")) return;
    try {
      await deleteQuiz(quizId, session?.user?.email || undefined);
      toast.success("Квиз өшірілді");
      router.push("/quizzes");
    } catch {
      toast.error("Квизді өшіру мүмкін болмады");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50/40 to-pink-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600">Квиз жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50/40 to-pink-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center p-8 bg-white rounded-3xl shadow-md border border-gray-100 max-w-sm">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Квиз табылмады</h2>
          <p className="text-sm text-gray-500 mb-4">Бұл квиз өшірілген немесе сілтеме қате болуы мүмкін.</p>
          <Link
            href="/quizzes"
            className="inline-block px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm"
          >
            Барлық квиздерге оралу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50/40 to-pink-50 pb-20 md:pb-8 md:pl-64">
      <DesktopNav currentPage="quizzes" />
      <MobileNav currentPage="quizzes" />

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-6">
          <Link href="/quizzes" className="hover:text-purple-600 transition-colors">
            Квиздер
          </Link>
          <span>/</span>
          <span className="text-gray-900 truncate max-w-xs">{quiz.title}</span>
        </div>

        {/* Hero Card */}
        <div className="bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-purple-100/70 shadow-lg shadow-purple-500/5 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                  {quiz.is_public ? "Ашық квиз" : "Жеке квиз"}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {questions.length} сұрақ
                </span>
              </div>

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
                    Автор: <strong className="text-gray-700">{quiz.author_nickname}</strong>
                  </span>
                )}
                <span>•</span>
                <span>
                  Жасалған күні: {new Date(quiz.created_at).toLocaleDateString("kk-KZ")}
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
                  <span className="inline-block animate-spin">⏳</span>
                ) : (
                  <svg className="w-6 h-6 text-yellow-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" />
                  </svg>
                )}
                <span>Тікелей ойынды бастау</span>
              </button>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAnswers(!showAnswers)}
                  className="px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {showAnswers ? "Жауаптарды жасыру" : "Жауаптарды көру"}
                </button>
                <button
                  onClick={handleDeleteQuiz}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="Квизді өшіру"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Questions Breakdown List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center justify-between">
            <span>Сұрақтар тізімі ({questions.length})</span>
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
                      ? "Таңдаулы тест"
                      : q.question_type === "tf"
                      ? "Шын/Жалған"
                      : q.question_type === "multi_select"
                      ? "Бірнеше дұрыс"
                      : "Ашық жауап"}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                  <span>⏱ {q.time_limit_seconds} сек</span>
                  <span>⭐ {q.points} балл</span>
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
                    <span className="font-bold">Дұрыс математикалық жауап:</span>
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
                          <span className="text-emerald-600 text-xs font-bold">✓ Дұрыс</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {showAnswers && q.explanation && (
                <div className="mt-3 p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-xs text-purple-900">
                  <span className="font-bold block mb-1">Түсіндірме:</span>
                  <MathRender latex={q.explanation} />
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
