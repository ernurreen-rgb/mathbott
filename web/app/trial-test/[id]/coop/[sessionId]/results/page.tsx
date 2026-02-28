"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import TrialTestDetailedReview, { isReviewResultActuallyCorrect } from "@/components/trial-test/TrialTestDetailedReview";
import { getTrialTestCoopResults, getTrialTestDetails } from "@/lib/api";
import { TrialTestCoopResultItem, TrialTestCoopResultsResponse, TrialTestDetails } from "@/types";

const getAccentColor = (color?: string) => {
  if (color === "red") return "red" as const;
  if (color === "blue") return "blue" as const;
  return "neutral" as const;
};

export default function TrialTestCoopResultsPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const testId = parseInt(params.id as string, 10);
  const sessionId = parseInt(params.sessionId as string, 10);

  const [test, setTest] = useState<TrialTestDetails | null>(null);
  const [results, setResults] = useState<TrialTestCoopResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email || null;
  const resultCount = results?.items?.length ?? 0;

  const fetchData = useCallback(async () => {
    if (!email || !testId || !sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const [testRes, resultsRes] = await Promise.all([
        getTrialTestDetails(testId, email),
        getTrialTestCoopResults(sessionId, email),
      ]);

      if (testRes.error) {
        setError(testRes.error);
      } else if (testRes.data) {
        setTest(testRes.data);
      }

      if (resultsRes.error) {
        setError((prev) => prev || resultsRes.error);
      } else if (resultsRes.data) {
        setResults(resultsRes.data);
      }
    } catch (e: any) {
      setError(e?.message || "Деректерді жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [email, testId, sessionId]);

  useEffect(() => {
    if (email && testId && sessionId) {
      void fetchData();
    }
  }, [email, testId, sessionId, fetchData]);

  useEffect(() => {
    if (!email) return;
    if (resultCount >= 2) return;

    const interval = setInterval(() => {
      getTrialTestCoopResults(sessionId, email).then((res) => {
        if (!res.error && res.data) {
          setResults(res.data);
          if (res.data.items.length >= 2) {
            clearInterval(interval);
          }
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [email, sessionId, resultCount]);

  const scoredItems = useMemo(() => {
    if (!test || !results) return [];
    return results.items.map((item) => {
      const displayScore = test.tasks.reduce((score, task) => {
        const result = item.answers?.[task.id];
        return score + (isReviewResultActuallyCorrect(task, result) ? 1 : 0);
      }, 0);
      const displayPercentage = item.total > 0 ? (displayScore / item.total) * 100 : 0;
      return {
        ...item,
        displayScore,
        displayPercentage,
      };
    });
  }, [results, test]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Нәтижелерді көру үшін кіріңіз</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Нәтижелер жүктелуде...</div>
      </div>
    );
  }

  if (error || !test || !results) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error || "Нәтижелерді жүктеу мүмкін болмады"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <button onClick={() => router.push("/trial-test")} className="text-gray-700 hover:text-gray-900 mb-4">
              ← Сынақ тесттері
            </button>

            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{test.title}</h1>
              {test.description && <p className="text-gray-600">{test.description}</p>}
            </div>

            {results.items.length < 2 && (
              <div className="bg-white/70 rounded-2xl p-4 border border-white/40 mb-6 text-center text-gray-600">
                Екінші қатысушыны күту...
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {scoredItems.map((item) => {
                const colorClass = item.color === "red" ? "border-red-300" : "border-blue-300";
                const badgeClass = item.color === "red" ? "bg-red-500" : "bg-blue-500";

                return (
                  <div key={item.user_id} className={`bg-white/70 rounded-2xl p-6 border-2 ${colorClass}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className={`w-3 h-3 rounded-full ${badgeClass}`} />
                      <div className="font-bold text-gray-900 text-lg">
                        {item.nickname || `Пайдаланушы ${item.user_id}`}
                      </div>
                    </div>
                    <div className="text-4xl font-bold text-gray-900 mb-2">
                      {item.displayScore} / {item.total}
                    </div>
                    <div className="text-2xl font-bold text-gray-700">{item.displayPercentage.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 space-y-8">
              <h2 className="text-2xl font-bold text-gray-900">Тапсырмалар бойынша талдау</h2>

              {scoredItems.map((item: TrialTestCoopResultItem & { displayScore: number; displayPercentage: number }) => {
                const borderClass = item.color === "red" ? "border-red-300" : "border-blue-300";
                const badgeClass = item.color === "red" ? "bg-red-500" : "bg-blue-500";

                return (
                  <section
                    key={`detail-${item.user_id}`}
                    className={`rounded-2xl border-2 ${borderClass} bg-white/70 p-5`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`h-3 w-3 rounded-full ${badgeClass}`} />
                        <div className="text-lg font-bold text-gray-900">
                          {item.nickname || `Пайдаланушы ${item.user_id}`}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-600">
                        {item.displayScore} / {item.total} • {item.displayPercentage.toFixed(1)}%
                      </div>
                    </div>

                    <TrialTestDetailedReview
                      tasks={test.tasks}
                      answers={item.answers}
                      accentColor={getAccentColor(item.color)}
                      emptyStateLabel="Бұл қатысушы үшін жауаптар жоқ"
                    />
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
    </div>
  );
}
