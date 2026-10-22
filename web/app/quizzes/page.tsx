"use client";
import Icon from "@/components/ui/Icon";


import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getQuizzes, deleteQuiz, updateQuiz, forkQuiz } from "@/lib/api/quizzes";
import { Quiz } from "@/types/quiz";
import toast from "react-hot-toast";

export default function QuizzesCatalogPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "my">("all");
  const [privacyFilter, setPrivacyFilter] = useState<"all" | "public" | "private">("all");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [forkingId, setForkingId] = useState<number | null>(null);
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
      const result = await deleteQuiz(quizId, session?.user?.email || undefined);
      if (result.error) { setError(result.error); return; }
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
      toast.success("Квиз өшірілді");
    } catch {
      toast.error("Квизді өшіру мүмкін болмады");
    }
  };

  const handleFork = async (quizId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session?.user) {
      toast.error("Квизді көшіру үшін алдымен жүйеге кіріңіз");
      return;
    }
    setForkingId(quizId);
    try {
      const email = session?.user?.email || undefined;
      const { data: forked, error: forkErr } = await forkQuiz(quizId, email);
      if (forkErr || !forked) {
        toast.error(forkErr || "Квизді көшіру сәтсіз аяқталды");
        setForkingId(null);
        return;
      }
      toast.success("Квиз көшірмесі сәтті сақталды! Өңдеу терезесі ашылуда...");
      router.push(`/quizzes/${forked.id}/edit`);
    } catch {
      toast.error("Қате орын алды");
      setForkingId(null);
    }
  };

  const handleTogglePrivacy = async (quiz: Quiz, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTogglingId(quiz.id);
    const nextPublic = !quiz.is_public;
    try {
      const result = await updateQuiz(
        quiz.id,
        { is_public: nextPublic },
        session?.user?.email || undefined
      );
      if (result.error || !result.data) {
        toast.error(result.error || "Квиз мәртебесін өзгерту мүмкін болмады");
      } else {
        setQuizzes((prev) =>
          prev.map((q) => (q.id === quiz.id ? { ...q, is_public: nextPublic } : q))
        );
        toast.success(
          nextPublic
            ? "Квиз енді баршаға ашық (Public)"
            : "Квиз жеке форматқа ауыстырылды (Private)"
        );
      }
    } catch {
      toast.error("Қате орын алды");
    } finally {
      setTogglingId(null);
    }
  };

  const publicCount = useMemo(() => quizzes.filter((q) => q.is_public).length, [quizzes]);
  const privateCount = useMemo(() => quizzes.filter((q) => !q.is_public).length, [quizzes]);

  const displayedQuizzes = useMemo(() => {
    if (activeTab !== "my") return quizzes;
    if (privacyFilter === "public") return quizzes.filter((q) => q.is_public);
    if (privacyFilter === "private") return quizzes.filter((q) => !q.is_public);
    return quizzes;
  }, [activeTab, quizzes, privacyFilter]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64">
      <DesktopNav currentPage="quizzes" />
      <MobileNav currentPage="quizzes" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold leading-normal py-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
              Интерактивті квиздер
            </h1>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Link
              href="/join"
              className="flex-1 sm:flex-none text-center px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-gray-200 text-gray-800 shadow-sm hover:bg-gray-50 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Icon name="logIn" className="w-4 h-4 text-purple-600" />
              PIN-кодпен қосылу
            </Link>
            <Link
              href="/quizzes/create"
              className="flex-1 sm:flex-none text-center px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/25 hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Icon name="plus" className="w-4 h-4" />
              Жаңа квиз жасау
            </Link>
          </div>
        </div>

        {/* Tabs and filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/80 mb-6 pb-2">
          <div className="flex items-center gap-2">
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

          {activeTab === "my" && quizzes.length > 0 && (
            <div className="flex items-center gap-1.5 self-start sm:self-auto bg-gray-100/80 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setPrivacyFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  privacyFilter === "all"
                    ? "bg-white text-gray-900 shadow-sm font-bold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Барлығы ({quizzes.length})
              </button>
              <button
                onClick={() => setPrivacyFilter("public")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  privacyFilter === "public"
                    ? "bg-white text-emerald-700 shadow-sm font-bold"
                    : "text-gray-600 hover:text-emerald-700"
                }`}
              >
                <span><Icon name="globe" /> Ашық</span>
                <span>({publicCount})</span>
              </button>
              <button
                onClick={() => setPrivacyFilter("private")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  privacyFilter === "private"
                    ? "bg-white text-amber-700 shadow-sm font-bold"
                    : "text-gray-600 hover:text-amber-700"
                }`}
              >
                <span><Icon name="lock" /> Жеке</span>
                <span>({privateCount})</span>
              </button>
            </div>
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
              <Icon name="layers" className="w-8 h-8" />
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
        ) : displayedQuizzes.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white/70 backdrop-blur-sm rounded-3xl border border-white/60 shadow-sm">
            <div className="text-3xl mb-2">{privacyFilter === "public" ? <><Icon name="globe" /></> : <><Icon name="lock" /></>}</div>
            <h3 className="text-base font-bold text-gray-800 mb-1">
              {privacyFilter === "public" ? "Ашық квиздер табылмады" : "Жеке квиздер табылмады"}
            </h3>
            <p className="text-gray-500 text-xs mb-4">
              Таңдалған санат бойынша квиздер жоқ
            </p>
            <button
              onClick={() => setPrivacyFilter("all")}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 underline"
            >
              Барлық квиздерді көрсету
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="group relative bg-white/90 backdrop-blur-md rounded-2xl border border-purple-100/60 p-5 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-500 mb-2 gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                        <Icon name="help" className="w-3.5 h-3.5" />
                        {quiz.question_count || 0} сұрақ
                      </span>
                      {quiz.is_public ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/70" title="Баршаға ашық квиз">
                          <span><Icon name="globe" /></span>
                          <span>Ашық</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70" title="Тек сізге көрінетін жеке квиз">
                          <span><Icon name="lock" /></span>
                          <span>Жеке</span>
                        </span>
                      )}
                    </div>
                    {quiz.author_nickname && (
                      <span className="text-gray-400 truncate max-w-[120px]" title={`Автор: ${quiz.author_nickname}`}>
                        Автор: {quiz.author_nickname}
                      </span>
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
                  {(quiz.can_manage || activeTab === "my") ? (
                    <>
                      <Link
                        href={`/quizzes/${quiz.id}/edit`}
                        title="Өңдеу"
                        className="p-2 text-purple-600 hover:text-purple-800 transition-colors rounded-xl bg-purple-50 hover:bg-purple-100"
                      >
                        <Icon name="edit" className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={(e) => handleTogglePrivacy(quiz, e)}
                        disabled={togglingId === quiz.id}
                        title={quiz.is_public ? "Жекеге ауыстыру (каталогтан жасыру)" : "Баршаға ашық ету (каталогқа шығару)"}
                        className={`py-2 px-2.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1 ${
                          quiz.is_public
                            ? "border-emerald-200 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100/80"
                            : "border-amber-200 text-amber-700 bg-amber-50/50 hover:bg-amber-100/80"
                        } disabled:opacity-50`}
                      >
                        {togglingId === quiz.id ? (
                          <span className="text-xs"><Icon name="loader" className="animate-spin" /></span>
                        ) : (
                          <span>{quiz.is_public ? <><Icon name="globe" /></> : <><Icon name="lock" /></>}</span>
                        )}
                        <span className="text-[11px] hidden sm:inline">
                          {quiz.is_public ? "Ашық" : "Жеке"}
                        </span>
                      </button>
                      <button
                        onClick={(e) => handleDelete(quiz.id, e)}
                        title="Өшіру"
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-xl hover:bg-red-50"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </>
                  ) : quiz.is_public ? (
                    <button
                      onClick={(e) => handleFork(quiz.id, e)}
                      disabled={forkingId === quiz.id}
                      title="Өзіме көшіріп өңдеу"
                      className="p-2 text-purple-600 hover:text-purple-800 transition-colors rounded-xl bg-purple-50 hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1 text-xs font-semibold"
                    >
                      {forkingId === quiz.id ? (
                        <Icon name="loader" className="animate-spin w-4 h-4" />
                      ) : (
                        <Icon name="copy" className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Көшіріп алу</span>
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
