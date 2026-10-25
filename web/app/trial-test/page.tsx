"use client";

import { useSession } from "next-auth/react";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getTrialTests,
  getTrialTestDraftIds,
  getCoopTestInvites,
  acceptCoopTestInvite,
  declineCoopTestInvite,
} from "@/lib/api";
import { TrialTest } from "@/types";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";

function TrialTestListPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname() || "/trial-test";
  const searchParams = useSearchParams();
  const folderParam = useMemo(() => {
    const raw = searchParams?.get("folder");
    return raw && raw.trim() ? raw.trim() : null;
  }, [searchParams]);

  const [tests, setTests] = useState<TrialTest[]>([]);
  const [draftTestIds, setDraftTestIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coopInvites, setCoopInvites] = useState<any[]>([]);

  // Navigation state synced with ?folder= query parameter
  const [selectedFolder, setSelectedFolder] = useState<string | null>(folderParam);

  useEffect(() => {
    setSelectedFolder(folderParam);
  }, [folderParam]);

  const handleOpenFolder = useCallback(
    (folderName: string) => {
      setSelectedFolder(folderName);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("folder", folderName);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleCloseFolder = useCallback(() => {
    setSelectedFolder(null);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("folder");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getTrialTests();
      if (err) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching trial tests:", err);
        }
        setError(err);
        setTests([]);
      } else if (data) {
        setTests(data);
      } else {
        setTests([]);
      }
    } catch (err) {
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
    try {
      const { data, error: err } = await getCoopTestInvites(session.user.email);
      if (err) {
        console.error("Error fetching coop invites:", err);
      } else if (data) {
        setCoopInvites(data.items || []);
      }
    } catch (err) {
      console.error("Error fetching coop invites:", err);
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

  // Group tests into folders
  const folders = useMemo(() => {
    const map = new Map<string, { name: string; tests: TrialTest[]; minSortOrder: number }>();
    for (const test of tests) {
      const cat = (test.category || "Жалпы").trim() || "Жалпы";
      const testOrder = typeof test.sort_order === "number" ? test.sort_order : 0;
      if (!map.has(cat)) {
        map.set(cat, { name: cat, tests: [], minSortOrder: testOrder });
      }
      const group = map.get(cat)!;
      group.tests.push(test);
      if (testOrder < group.minSortOrder) {
        group.minSortOrder = testOrder;
      }
    }

    const list = Array.from(map.values());
    for (const group of list) {
      group.tests.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    return list.sort((a, b) => {
      if (a.minSortOrder !== b.minSortOrder) {
        return a.minSortOrder - b.minSortOrder;
      }
      return a.name.localeCompare(b.name, "kk");
    });
  }, [tests]);

  // Tests inside the currently selected folder
  const currentFolderTests = useMemo(() => {
    if (!selectedFolder) return [];
    const found = folders.find((f) => f.name === selectedFolder);
    return found ? found.tests : [];
  }, [folders, selectedFolder]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
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
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-4xl font-bold leading-normal py-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                  Сынақ тесті
                </h1>
              </div>
              <Link
                href="/trial-test/history"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-semibold border border-purple-200 shadow-sm transition-all whitespace-nowrap self-start sm:self-auto"
              >
                <span>Өту тарихы</span>
                <span className="text-lg"><Icon name="arrowRight" /></span>
              </Link>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
                {error}
              </div>
            )}

            {/* Coop Invites Section */}
            {coopInvites.length > 0 && (
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Бірлескен тестке шақырулар</h2>
                <div className="space-y-3">
                  {coopInvites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-2 border-blue-300 rounded-xl p-4 bg-gradient-to-r from-blue-50 to-purple-50 shadow-lg"
                    >
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

            {/* Main Content Area */}
            {loading ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-4 text-purple-600">
                  <Icon name="loader" className="animate-spin" />
                </div>
                <div className="text-gray-600 font-medium">Тесттер жүктелуде...</div>
              </div>
            ) : tests.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <div className="text-6xl mb-4"><Icon name="test" /></div>
                <div className="text-lg font-semibold">Сынақ тесттері әлі құрылмаған</div>
              </div>
            ) : selectedFolder === null ? (
              /* ROOT FOLDERS GRID */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {folders.map((folder) => (
                  <button
                    key={folder.name}
                    type="button"
                    onClick={() => handleOpenFolder(folder.name)}
                    className="group text-left bg-white rounded-2xl p-5 border-2 border-slate-200 hover:border-purple-500 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 h-44 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/25 group-hover:scale-105 transition-transform">
                        <Icon name="folder" />
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 group-hover:bg-purple-100 group-hover:text-purple-700 transition-colors">
                        {folder.tests.length} тест
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 group-hover:text-purple-600 transition-colors line-clamp-2">
                        {folder.name}
                      </h2>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* INSIDE SPECIFIC FOLDER */
              <div>
                {/* Folder header with Back button + active folder title */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={handleCloseFolder}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-purple-50 text-gray-700 hover:text-purple-700 text-sm font-bold border border-slate-200 shadow-sm hover:shadow transition-all shrink-0"
                    >
                      <Icon name="arrowLeft" />
                      <span>Артқа</span>
                    </button>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                        <Icon name="folder" />
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                        {selectedFolder}
                      </h2>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                    {currentFolderTests.length} тест
                  </span>
                </div>

                {/* Tests in Folder */}
                {currentFolderTests.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-2"><Icon name="test" /></div>
                    <p>Бұл папкада тесттер жоқ</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {currentFolderTests.map((test) => (
                      <Link
                        key={test.id}
                        href={`/trial-test/${test.id}`}
                        className="glass rounded-2xl shadow-xl p-6 border border-white/30 hover:border-purple-300 transition-all hover:scale-105 bg-white/70 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="text-xl font-bold text-gray-900 flex-1">
                              {test.title}
                            </h3>
                          </div>
                          {test.description && (
                            <p className="text-gray-600 mb-4 line-clamp-2 text-sm">
                              {test.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                          <span className="text-sm text-gray-500">
                            {test.task_count || 0} тапсырма
                          </span>
                          <span
                            className={`px-4 py-2 rounded-lg font-bold text-sm inline-flex items-center gap-1.5 transition-colors ${
                              draftTestIds.has(test.id)
                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                : "bg-purple-600 text-white hover:bg-purple-700"
                            }`}
                          >
                            {draftTestIds.has(test.id) ? (
                              <>Жалғастыру <Icon name="arrowRight" /></>
                            ) : (
                              <>Бастау <Icon name="arrowRight" /></>
                            )}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="trial-test" />
    </div>
  );
}

export default function TrialTestListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-4xl text-purple-600">
            <Icon name="loader" className="animate-spin" />
          </div>
        </div>
      }
    >
      <TrialTestListPageContent />
    </Suspense>
  );
}
