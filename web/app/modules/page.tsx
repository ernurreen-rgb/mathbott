"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getModulesMap } from "@/lib/api";
import { Module } from "@/types";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";

const DEBUG_UI = process.env.NEXT_PUBLIC_DEBUG_UI === "true";

export default function ModulesPage() {
  const { data: session } = useSession();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = useCallback(async (email: string) => {
    setLoading(true);
    setError(null);
    if (DEBUG_UI) console.log("Fetching modules for email:", email);
    try {
      const { data, error: err } = await getModulesMap(email);
      
      if (err) {
        // Only log in development
        if (process.env.NODE_ENV === "development" || DEBUG_UI) {
          console.error("Error fetching modules:", err);
        }
        setError(err);
        setModules([]); // Set empty array on error
      } else if (data) {
        if (DEBUG_UI) console.log("Modules fetched successfully:", data.length, "modules");
        setModules(data);
      } else {
        if (DEBUG_UI) console.log("No modules data returned");
        setModules([]);
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development" || DEBUG_UI) {
        console.error("Error fetching modules:", err);
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
      setLoading(false);
      return;
    }
    fetchModules(email);
  }, [session?.user?.email, fetchModules]);

  const getProgressColor = (progress?: { completed: boolean; progress: number }) => {
    if (!progress) return "bg-gray-300";
    if (progress.completed) return "bg-green-500";
    if (progress.progress > 0) return "bg-yellow-400";
    return "bg-gray-300";
  };

  const getProgressIcon = (progress?: { completed: boolean; progress: number }) => {
    if (!progress) return "⚪";
    if (progress.completed) return "✅";
    if (progress.progress > 0) return "🟡";
    return "⚪";
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            Модульдерді көру үшін кіріңіз
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
                <span className="text-5xl">🗺️</span>
                <span>Модуль картасы</span>
              </h1>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4 animate-spin">⏳</div>
                <div className="text-gray-600">Модульдер жүктелуде...</div>
              </div>
            ) : modules.length === 0 ? (
              <div className="text-center py-12 text-gray-600">
                <div className="text-6xl mb-4">📦</div>
                <div>Модульдер әлі құрылмаған</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {modules.map((module) => (
                  <Link
                    key={module.id}
                    href={`/modules/${module.id}`}
                    className="glass rounded-2xl shadow-xl p-6 border border-white/30 hover:border-purple-400 transition-all transform hover:scale-105 cursor-pointer"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="text-5xl">{module.icon || "📚"}</div>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">{module.name}</h3>
                    {module.description && (
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{module.description}</p>
                    )}
                    {module.progress && (
                      <div className="mt-4">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>Ілгерілеу</span>
                          <span>{Math.round(module.progress.progress * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressColor(module.progress)}`}
                            style={{ width: `${module.progress.progress * 100}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {`${module.progress.completed_sections || 0} / ${module.progress.total_sections || 0} бөлім`}
                        </div>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="modules" />
    </div>
  );
}
