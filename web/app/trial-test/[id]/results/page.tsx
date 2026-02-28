"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import TrialTestDetailedReview, { isReviewResultActuallyCorrect } from "@/components/trial-test/TrialTestDetailedReview";
import { getTrialTestDetails, getTrialTestResults } from "@/lib/api";
import { TrialTestDetails, TrialTestResult } from "@/types";

export default function TrialTestResultsPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const testId = parseInt(params.id as string, 10);

  const [test, setTest] = useState<TrialTestDetails | null>(null);
  const [resultsList, setResultsList] = useState<TrialTestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const email = session?.user?.email || null;

  const latestResult = useMemo<TrialTestResult | null>(() => {
    if (resultsList.length === 0) return null;
    return resultsList.reduce((latest, item) =>
      new Date(item.completed_at) > new Date(latest.completed_at) ? item : latest
    );
  }, [resultsList]);

  const fetchData = useCallback(async () => {
    if (!email || !testId) return;
    setLoading(true);
    setError(null);

    try {
      const testData = await getTrialTestDetails(testId, email);
      if (testData.error) {
        setError(testData.error);
      } else if (testData.data) {
        setTest(testData.data);
      }

      const { data: resultsData, error: resultsError } = await getTrialTestResults(testId, email);
      if (resultsError) {
        setError((prev) => prev || resultsError);
      } else if (resultsData && Array.isArray(resultsData)) {
        setResultsList(resultsData);
      } else {
        setResultsList([]);
      }
    } catch (e: any) {
      setError(e?.message || "Деректерді жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [email, testId]);

  useEffect(() => {
    if (email && testId) {
      void fetchData();
    }
  }, [email, testId, fetchData]);

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

  if (error || !test) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error || "Нәтижелерді жүктеу мүмкін болмады"}
        </div>
      </div>
    );
  }

  const displayScore = latestResult
    ? test.tasks.reduce((score, task) => {
        const result = latestResult.answers[task.id];
        return score + (isReviewResultActuallyCorrect(task, result) ? 1 : 0);
      }, 0)
    : 0;

  const displayPercentage =
    latestResult && latestResult.total > 0 ? (displayScore / latestResult.total) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-4xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <button onClick={() => router.push("/trial-test")} className="text-gray-700 hover:text-gray-900 mb-4">
              ← Сынақ тесттері
            </button>

            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{test.title}</h1>
              {test.description && <p className="text-gray-600">{test.description}</p>}
            </div>

            {latestResult ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-4">Соңғы нәтиже</h2>

                <div className="bg-white/70 rounded-2xl p-6 border border-white/40 mb-6">
                  <div className="text-center mb-4">
                    <div className="text-6xl mb-2">
                      {displayPercentage >= 80 ? "A" : displayPercentage >= 60 ? "B" : "C"}
                    </div>
                    <div className="text-4xl font-bold text-gray-900 mb-2">
                      {displayScore} / {latestResult.total}
                    </div>
                    <div className="text-2xl font-bold text-gray-700">{displayPercentage.toFixed(1)}%</div>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                    <div
                      className={`h-4 rounded-full transition-all ${
                        displayPercentage >= 80
                          ? "bg-green-500"
                          : displayPercentage >= 60
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${displayPercentage}%` }}
                    />
                  </div>

                  <div className="text-center text-sm text-gray-600">
                    {new Date(latestResult.completed_at).toLocaleString("kk-KZ", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      timeZone: "Asia/Almaty",
                    })}
                  </div>
                </div>

                <TrialTestDetailedReview
                  tasks={test.tasks}
                  answers={latestResult.answers}
                  title="Тапсырмалар бойынша талдау"
                  accentColor="purple"
                />

                <div className="flex gap-4 mt-6">
                  <Link
                    href={`/trial-test/${testId}`}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg text-center"
                  >
                    Қайта өту
                  </Link>
                  <Link
                    href="/trial-test"
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg text-center"
                  >
                    Барлық тесттер
                  </Link>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-600">
                <div className="text-6xl mb-4">i</div>
                <div>Нәтижелер табылмады</div>
                <Link
                  href={`/trial-test/${testId}`}
                  className="mt-4 inline-block bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg"
                >
                  Тестті бастау
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
    </div>
  );
}
