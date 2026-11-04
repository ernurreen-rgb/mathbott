"use client";
import Icon, { ContentIcon } from "@/components/ui/Icon";


import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getModulesMap } from "@/lib/api";
import type { Module } from "@/types";

const DEBUG_UI = process.env.NEXT_PUBLIC_DEBUG_UI === "true";
const MODULES_UI_ENABLED = process.env.NEXT_PUBLIC_MODULES_UI_ENABLED === "true";

const PREVIEW_MODULES: Module[] = [
  { id: 1, name: "Арифметика", icon: "book", sort_order: 1, progress: { completed: false, progress: 0, completed_sections: 0, total_sections: 2 } },
  { id: 2, name: "Бөлшектер", icon: "book", sort_order: 2, progress: { completed: false, progress: 0, completed_sections: 0, total_sections: 0 } },
  { id: 3, name: "Дәреже", icon: "book", sort_order: 3, progress: { completed: false, progress: 0, completed_sections: 0, total_sections: 0 } },
];

export default function ModulesPage() {
  const { data: session, status } = useSession();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    if (DEBUG_UI) console.log("Fetching modules for email:", email);

    try {
      const { data, error: requestError } = await getModulesMap(email);
      if (requestError) {
        if (process.env.NODE_ENV === "development" || DEBUG_UI) {
          console.error("Error fetching modules:", requestError);
        }
        setError(requestError);
        setModules([]);
      } else {
        setModules(data || []);
      }
    } catch (requestError) {
      if (process.env.NODE_ENV === "development" || DEBUG_UI) {
        console.error("Error fetching modules:", requestError);
      }
      setError("Модульдерді жүктеу қатесі");
      setModules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const email = session?.user?.email;
    if (!email) {
      if (status !== "loading") setLoading(false);
      return;
    }

    void fetchModules(email);
  }, [fetchModules, session?.user?.email, status]);

  const getProgressColor = (progress?: { completed: boolean; progress: number }) => {
    if (!progress) return "bg-gray-300";
    if (progress.completed) return "bg-green-500";
    if (progress.progress > 0) return "bg-yellow-400";
    return "bg-gray-300";
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            Модульдерді көру үшін кіріңіз
          </h1>
        </div>
      </div>
    );
  }

  const displayModules = modules.length > 0 ? modules : PREVIEW_MODULES;

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-6xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-4xl font-bold leading-normal py-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Модуль картасы
              </h1>
            </div>

            <div className="relative min-h-[360px]">
              <div
                className={MODULES_UI_ENABLED ? "" : "pointer-events-none select-none blur-sm opacity-60"}
                aria-hidden={!MODULES_UI_ENABLED}
              >
                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {displayModules.map((module) => {
                    const content = (
                      <div
                        key={module.id}
                        className="glass rounded-2xl shadow-xl p-6 border border-white/30 hover:border-purple-400 transition-all"
                      >
                        <ContentIcon value={module.icon} fallback="book" size={32} className="mb-4 text-indigo-600" />
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{module.name}</h3>
                        {module.description && (
                          <p className="text-gray-600 text-sm mb-4 line-clamp-2">{module.description}</p>
                        )}
                        <div className="mt-4">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${getProgressColor(module.progress)}`}
                              style={{ width: `${(module.progress?.progress || 0) * 100}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {`${module.progress?.completed_sections || 0} / ${module.progress?.total_sections || 0} бөлім`}
                          </div>
                        </div>
                      </div>
                    );

                    if (MODULES_UI_ENABLED) {
                      return (
                        <Link key={module.id} href={`/modules/${module.id}`}>
                          {content}
                        </Link>
                      );
                    }
                    return content;
                  })}
                </div>
              </div>

              {!MODULES_UI_ENABLED && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/25 backdrop-blur-[2px]">
                  <div className="px-8 py-4 rounded-3xl bg-white/95 shadow-2xl border border-purple-200/60 backdrop-blur-md">
                    <span className="text-3xl sm:text-4xl font-black text-gray-900 drop-shadow-sm">
                      Жасалуда
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <MobileNav currentPage="modules" />
    </div>
  );
}
