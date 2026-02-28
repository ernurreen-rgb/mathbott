"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getTrialTestsAttempted } from "@/lib/api";
import { TrialTest } from "@/types";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";

export default function TrialTestHistoryPage() {
  const { data: session } = useSession();
  const [tests, setTests] = useState<TrialTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTests = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getTrialTestsAttempted(session.user.email);
      if (err) {
        setError(err);
        setTests([]);
      } else if (data) {
        setTests(data);
      } else {
        setTests([]);
      }
    } catch {
      setError("Тесттерді жүктеу қатесі");
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            Өту тарихын көру үшін кіріңіз
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-6xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <Link
              href="/trial-test"
              className="text-gray-700 hover:text-gray-900 mb-4 inline-block"
            >
              ← Сынақ тесттері
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Өту тарихы</h1>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4 animate-spin">⏳</div>
                <div className="text-gray-600">Жүктелуде...</div>
              </div>
            ) : tests.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-6xl mb-4">📋</div>
                <div>Сіз әлі ешқандай сынақ тестін тапсырған жоқсыз</div>
                <Link href="/trial-test" className="mt-4 inline-block text-purple-600 font-semibold hover:underline">
                  Сынақ тесттеріне өту →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {tests.map((test) => (
                  <Link
                    key={test.id}
                    href={`/trial-test/${test.id}/results`}
                    className="flex items-center justify-between gap-4 glass rounded-xl p-4 border border-white/30 hover:border-purple-300 transition-all bg-white/70"
                  >
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-gray-900 truncate">
                        {test.title}
                      </h2>
                      {test.description && (
                        <p className="text-sm text-gray-600 truncate mt-0.5">
                          {test.description}
                        </p>
                      )}
                    </div>
                    <span className="text-purple-600 font-semibold text-sm whitespace-nowrap">
                      Нәтижелерді көру →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
    </div>
  );
}
