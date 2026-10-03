"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getQuizzes, deleteQuiz } from "@/lib/api/quizzes";
import { Quiz } from "@/types/quiz";

export default function QuizzesCatalogPage() {
  const { data: session } = useSession();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "my">("all");
  const [error, setError] = useState<string | null>(null);

  const fetchQuizzes = useCallback(async (tab: "all" | "my") => {
    setLoading(true);
    setError(null);
    try {
      const isMy = tab === "my";
      const { data, error } = await getQuizzes(isMy, session?.user?.email || undefined);
      if (error) {
        setError(error);
      } else {
        setQuizzes(data || []);
      }
    } catch {
      setError("Квиздерді жүктеу кезінде қате орын алды");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    fetchQuizzes(activeTab);
  }, [activeTab, fetchQuizzes]);

  const handleDelete = async (quizId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Бұл квизді өшіргіңіз келетініне сенімдісіз бе?")) return;
    try {
      await deleteQuiz(quizId, session?.user?.email || undefined);
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch {
      alert("Квизді өшіру мүмкін болмады");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50/40 to-pink-50 pb-20 md:pb-8 md:pl-64">
      <DesktopNav currentPage="quizzes" />
      <MobileNav currentPage="quizzes" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                Quizizz Style
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Интерактивті квиздер
            </h1>
            <p className="text-gray-600 text-sm mt-1">
              Сыныппен немесе достарыңызбен нақты уақытта жарысып ойнаңыз
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/join"
              className="flex-1 sm:flex-none text-center px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              PIN-кодпен қосылу
            </Link>
            <Link
              href="/quizzes/create"
              className="flex-1 sm:flex-none text-center px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25 hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Жаңа квиз жасау
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200/80 mb-6">
          <button
            onClick={() => setActiveTab("all")}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all ${
              activeTab === "all"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            Барлық квиздер
          </button>
          {session && (
            <button
              onClick={() => setActiveTab("my")}
              className={`pb-3 px-3 text-sm font-bold border-b-2 transition-all ${
                activeTab === "my"
                  ? "border-purple-600 text-purple-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              Менің квиздерім
            </button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 rounded-2xl bg-white/60 animate-pulse border border-white" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-red-100 shadow-sm">
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={() => fetchQuizzes(activeTab)}
              className="mt-3 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold hover:bg-purple-200 transition-colors"
            >
              Қайталау
            </button>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-16 px-4 bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {activeTab === "my" ? "Сізде әлі квиздер жоқ" : "Квиздер табылмады"}
            </h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
              Алғашқы интерактивті викторинаңызды жасап, сыныптастарыңызбен бірге ойнаңыз!
            </p>
            <Link
              href="/quizzes/create"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white font-bold text-sm shadow-md shadow-purple-500/20 hover:bg-purple-700 transition-all"
            >
              Квиз жасау
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="group relative bg-white/90 backdrop-blur-md rounded-2xl border border-purple-100/60 p-5 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2">
                    <span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {quiz.question_count || 0} сұрақ
                    </span>
                    {quiz.author_nickname && (
                      <span className="text-gray-400">Автор: {quiz.author_nickname}</span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2 mb-1">
                    {quiz.title}
                  </h3>
                  {quiz.description && (
                    <p className="text-gray-600 text-xs line-clamp-2 mb-4">
                      {quiz.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-2 mt-4">
                  <Link
                    href={`/quizzes/${quiz.id}`}
                    className="flex-1 text-center py-2 px-3 rounded-xl bg-purple-50 text-purple-700 font-bold text-xs hover:bg-purple-600 hover:text-white transition-all"
                  >
                    Ашу & Ойнау
                  </Link>
                  {activeTab === "my" && (
                    <button
                      onClick={(e) => handleDelete(quiz.id, e)}
                      title="Өшіру"
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
