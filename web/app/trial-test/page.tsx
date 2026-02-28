"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTrialTests, getTrialTestDraftIds, getCoopTestInvites, acceptCoopTestInvite, declineCoopTestInvite } from "@/lib/api";
import { TrialTest } from "@/types";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";

export default function TrialTestListPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [tests, setTests] = useState<TrialTest[]>([]);
  const [draftTestIds, setDraftTestIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coopInvites, setCoopInvites] = useState<any[]>([]);
  const [coopInvitesLoading, setCoopInvitesLoading] = useState(false);

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getTrialTests();
      
      if (err) {
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching trial tests:", err);
        }
        setError(err);
        setTests([]); // Set empty array on error
      } else if (data) {
        setTests(data);
      } else {
        setTests([]);
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching trial tests:", err);
      }
      setError("Тесттерді жүктеу қатесі");
      setTests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDraftIds = useCallback(async () => {
    if (!session?.user?.email) return;
    try {
      const { data } = await getTrialTestDraftIds(session.user.email);
      if (data?.test_ids) {
        setDraftTestIds(new Set(data.test_ids));
      }
    } catch {
      setDraftTestIds(new Set());
    }
  }, [session?.user?.email]);

  const fetchCoopInvites = useCallback(async () => {
    if (!session?.user?.email) return;
    setCoopInvitesLoading(true);
    try {
      const { data, error: err } = await getCoopTestInvites(session.user.email);
      if (err) {
        console.error("Error fetching coop invites:", err);
      } else if (data) {
        setCoopInvites(data.items || []);
      }
    } catch (err) {
      console.error("Error fetching coop invites:", err);
    } finally {
      setCoopInvitesLoading(false);
    }
  }, [session?.user?.email]);

  const handleAcceptCoopInvite = async (inviteId: number) => {
    if (!session?.user?.email) return;
    try {
      const { data, error: err } = await acceptCoopTestInvite(inviteId, session.user.email);
      if (err) {
        setError(err);
      } else if (data) {
        router.push(`/trial-test/${data.trial_test_id}/coop/${data.session_id}`);
      }
    } catch (err: any) {
      setError(err?.message || "Шақыруды қабылдау қатесі");
    }
  };

  const handleDeclineCoopInvite = async (inviteId: number) => {
    if (!session?.user?.email) return;
    try {
      const { error: err } = await declineCoopTestInvite(inviteId, session.user.email);
      if (err) {
        if (err.includes("Invite not found")) {
          setCoopInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
          setError(null);
          void fetchCoopInvites();
          return;
        }
        setError(err);
      } else {
        await fetchCoopInvites();
      }
    } catch (err: any) {
      setError(err?.message || "Шақырудан бас тарту қатесі");
    }
  };

  useEffect(() => {
    fetchTests();
    fetchCoopInvites();
    fetchDraftIds();
  }, [fetchTests, fetchCoopInvites, fetchDraftIds]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            Сынақ тесті үшін кіріңіз
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-6xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-3">
                <span className="text-5xl">📝</span>
                <span>Сынақ тесті</span>
              </h1>
              <Link
                href="/trial-test/history"
                className="text-purple-600 hover:text-purple-700 font-semibold whitespace-nowrap flex items-center gap-2"
              >
                Өту тарихы
                <span className="text-lg">→</span>
              </Link>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {/* Coop Invites Section */}
            {coopInvites.length > 0 && (
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Бірлескен тестке шақырулар</h2>
                <div className="space-y-3">
                  {coopInvites.map((invite) => (
                    <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-2 border-blue-300 rounded-xl p-4 bg-gradient-to-r from-blue-50 to-purple-50 shadow-lg">
                      <div className="flex-1">
                        <div className="text-lg font-semibold text-gray-900 mb-1">
                          {invite.sender_nickname || "Пайдаланушы"} сізді тестті бірге тапсыруға шақырады
                        </div>
                        <div className="text-sm text-gray-700 mb-1">
                          <span className="font-semibold">Тест:</span> {invite.test_title || "Атаусыз"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(invite.created_at).toLocaleString("kk-KZ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAcceptCoopInvite(invite.id)}
                          className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold rounded-lg hover:shadow-lg transition-all hover:scale-105"
                        >
                          Қабылдау
                        </button>
                        <button
                          onClick={() => handleDeclineCoopInvite(invite.id)}
                          className="px-5 py-2.5 bg-white border-2 border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 text-gray-700 transition-all"
                        >
                          Бас тарту
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4 animate-spin">⏳</div>
                <div className="text-gray-600">Тесттер жүктелуде...</div>
              </div>
            ) : tests.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-6xl mb-4">📋</div>
                <div>Сынақ тесттері әлі құрылмаған</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tests.map((test) => (
                  <Link
                    key={test.id}
                    href={`/trial-test/${test.id}`}
                    className="glass rounded-2xl shadow-xl p-6 border border-white/30 hover:border-purple-300 transition-all hover:scale-105 bg-white/70"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <h2 className="text-2xl font-bold text-gray-900 flex-1">
                        {test.title}
                      </h2>
                      <span className="text-3xl">📝</span>
                    </div>
                    {test.description && (
                      <p className="text-gray-600 mb-4 line-clamp-2">
                        {test.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                      <span className="text-sm text-gray-500">
                        {test.task_count || 0} тапсырма
                      </span>
                      <span className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${draftTestIds.has(test.id) ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-purple-600 text-white hover:bg-purple-700"}`}>
                        {draftTestIds.has(test.id) ? "Продолжить →" : "Бастау →"}
                      </span>
                    </div>
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

