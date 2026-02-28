"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { apiPath } from "@/lib/api";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

interface Section {
  id: number;
  name: string;
  module_id: number;
  sort_order: number;
  guide?: string | null;
}

interface Module {
  id: number;
  name: string;
}

export default function SectionGuidesPage() {
  const { data: session, status } = useSession();
  const sessionEmail = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("content", status, sessionEmail);
  const [modules, setModules] = useState<Module[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [guideText, setGuideText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSection) {
      setGuideText("");
      return;
    }
    const section = sections.find((s) => s.id === selectedSection);
    setGuideText(section?.guide || "");
  }, [selectedSection, sections]);

  const fetchModules = useCallback(async () => {
    if (!sessionEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiPath("admin/modules")}?email=${encodeURIComponent(sessionEmail)}`);
      if (!res.ok) {
        throw new Error("Модульдерді жүктеу қатесі");
      }
      const data = await res.json();
      setModules(data);
    } catch (e: any) {
      setError(e?.message || "Модульдерді жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  const fetchSections = useCallback(async (moduleId: number) => {
    if (!sessionEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiPath(`admin/modules/${moduleId}/sections`)}?email=${encodeURIComponent(sessionEmail)}`
      );
      if (!res.ok) {
        throw new Error("Бөлімдерді жүктеу қатесі");
      }
      const data = await res.json();
      setSections(data);
      setSelectedSection(null);
      setGuideText("");
    } catch (e: any) {
      setError(e?.message || "Бөлімдерді жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (sessionEmail) {
      void fetchModules();
    }
  }, [sessionEmail, fetchModules]);

  useEffect(() => {
    if (selectedModule && sessionEmail) {
      void fetchSections(selectedModule);
    } else {
      setSections([]);
      setSelectedSection(null);
      setGuideText("");
    }
  }, [selectedModule, sessionEmail, fetchSections]);

  const saveGuide = async () => {
    if (!sessionEmail || !selectedSection) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.append("email", sessionEmail);
      formData.append("guide", guideText);

      const res = await fetch(apiPath(`admin/sections/${selectedSection}`), {
        method: "PUT",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.detail || "Анықтамалықты сақтау қатесі");
      }
      const updated = await res.json();
      setSections((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSuccess("Анықтамалық сақталды");
    } catch (e: any) {
      setError(e?.message || "Сақтау қатесі");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Әкімші бетіне кіру үшін авторизация керек</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">
              📚 Бөлімдер бойынша анықтамалықтар
            </h1>
            {error && (
              <div className="mb-3 rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 rounded-lg bg-green-100 border border-green-300 px-3 py-2 text-sm text-green-700">
                {success}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Модуль</div>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                    value={selectedModule ?? ""}
                    onChange={(e) => setSelectedModule(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Модульді таңдаңыз</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">Бөлім</div>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white/80">
                    {sections.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">Алдымен модульді таңдаңыз</div>
                    )}
                    {sections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSection(s.id)}
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors ${
                          selectedSection === s.id
                            ? "bg-purple-100 text-purple-800 font-semibold"
                            : "hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col">
                {!selectedSection ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-300 rounded-2xl bg-white/40">
                    Алдымен модуль және бөлім таңдаңыз
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <div className="mb-2 text-sm text-gray-600">
                      Таңдалған бөлім үшін теориялық материалды / түсіндірме мәтінді жазыңыз. Оқушыларға түсетін
                      «анықтамалық» осы жерден алынады.
                    </div>
                    <textarea
                      className="flex-1 min-h-[260px] rounded-2xl border border-gray-300 px-3 py-2 text-sm bg-white/90 resize-y"
                      placeholder="Мысалы: негізгі формулалар, анықтамалар, түсіндірме..."
                      value={guideText}
                      onChange={(e) => setGuideText(e.target.value)}
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={saveGuide}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:from-purple-700 hover:to-blue-700 disabled:opacity-60"
                      >
                        {saving ? "Сақталуда..." : "Анықтамалықты сақтау"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}


