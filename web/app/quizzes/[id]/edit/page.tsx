"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import QuizEditor from "../../_components/QuizEditor";
import { getQuiz, getQuizQuestions, forkQuiz } from "@/lib/api/quizzes";
import { Quiz, QuizQuestion } from "@/types/quiz";
import toast from "react-hot-toast";

interface EditQuizPageProps {
  params: Promise<{ id: string }>;
}

export default function EditQuizPage({ params }: EditQuizPageProps) {
  const router = useRouter();
  const routeParams = useParams();
  const { data: session } = useSession();

  const [quizId, setQuizId] = useState<number | null>(() => {
    if (routeParams?.id) {
      return parseInt(routeParams.id as string, 10);
    }
    return null;
  });

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (routeParams?.id) {
      setQuizId(parseInt(routeParams.id as string, 10));
    } else if (params) {
      Promise.resolve(params).then((resolved) => {
        if (resolved?.id) {
          setQuizId(parseInt(resolved.id, 10));
        }
      });
    }
  }, [routeParams, params]);

  useEffect(() => {
    if (!quizId) return;

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const email = session?.user?.email || undefined;
        const [quizRes, questionsRes] = await Promise.all([
          getQuiz(quizId, email),
          getQuizQuestions(quizId, email),
        ]);

        if (!isMounted) return;

        if (quizRes.error || !quizRes.data) {
          setError(quizRes.error || "Квиз табылмады");
        } else {
          setQuiz(quizRes.data);
          setQuestions(questionsRes.data || []);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Квиз мәліметтерін жүктеу мүмкін болмады");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [quizId, session?.user?.email]);

  const handleForkAndEdit = async () => {
    if (!quizId) return;
    if (!session?.user) {
      toast.error("Квизді көшіру үшін жүйеге кіріңіз");
      return;
    }
    setForking(true);
    try {
      const email = session?.user?.email || undefined;
      const { data: forked, error: forkErr } = await forkQuiz(quizId, email);
      if (forkErr || !forked) {
        toast.error(forkErr || "Квизді көшіру сәтсіз аяқталды");
        setForking(false);
        return;
      }
      toast.success("Квиз жеке парақшаңызға көшірілді! Енді өңдей аласыз.");
      router.push(`/quizzes/${forked.id}/edit`);
    } catch (err: any) {
      toast.error(err?.message || "Көшіру кезінде қате орын алды");
      setForking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600">Квиз деректері жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center p-8 bg-white rounded-3xl shadow-md border border-gray-100 max-w-sm">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Квиз табылмады</h2>
          <p className="text-sm text-gray-500 mb-4">{error || "Сілтеме қате болуы мүмкін."}</p>
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

  // If user cannot manage (not the author)
  if (!quiz.can_manage) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 md:pb-8 md:pl-64 flex items-center justify-center">
        <DesktopNav currentPage="quizzes" />
        <MobileNav currentPage="quizzes" />
        <div className="text-center p-8 bg-white rounded-3xl shadow-lg border border-purple-100 max-w-md mx-4">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            <Icon name="lock" />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-2">Өңдеуге рұқсат жоқ</h2>
          <p className="text-sm text-gray-600 mb-6">
            {quiz.is_public
              ? "Бұл квизді басқа автор жасағандықтан оны тікелей өзгерте алмайсыз. Бірақ оны өзіңіздің парақшаңызға көшіріп алып, қалағаныңызша өңдей аласыз!"
              : "Бұл жеке квиз және оны тек оның авторы ғана өңдей алады."}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/quizzes/${quiz.id}`}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
            >
              Квизге оралу
            </Link>
            {quiz.is_public && (
              <button
                onClick={handleForkAndEdit}
                disabled={forking}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-md hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {forking ? (
                  <Icon name="loader" className="animate-spin w-4 h-4" />
                ) : (
                  <Icon name="copy" className="w-4 h-4" />
                )}
                <span>Өзіме көшіріп өңдеу</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <QuizEditor
      initialQuiz={quiz}
      initialQuestions={questions}
      isEditMode
    />
  );
}
