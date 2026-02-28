"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getModuleDetails } from "@/lib/api";
import { ModuleDetails } from "@/types";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Link from "next/link";

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function DuolingoProgressRing({
  progress,
  size = 120,
  stroke = 14,
  color = "#58CC02", // Duolingo green-ish
  track = "#E5E5E5",
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp01(progress);
  const dash = c * (1 - p);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block pointer-events-none">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke={track}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={dash}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function DuolingoStartBubble() {
  return (
    <div className="absolute -top-14 left-1/2 -translate-x-1/2 pointer-events-none">
      <div
        className="relative bg-white rounded-[18px] px-5 py-2.5 font-extrabold tracking-wide shadow-sm"
        style={{ border: "3px solid #E5E5E5", color: "#58CC02", fontSize: 22, lineHeight: "22px" }}
      >
        БАСТАУ
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-[12px] w-0 h-0"
          style={{
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: "12px solid #E5E5E5",
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-[8px] w-0 h-0"
          style={{
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop: "9px solid white",
          }}
        />
      </div>
    </div>
  );
}

function DuolingoStar({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.9l-5.88 3.11 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z"
        fill="white"
      />
    </svg>
  );
}

export default function ModuleDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const moduleId = parseInt(params.id as string);
  const sessionEmail = session?.user?.email || null;
  
  const [module, setModule] = useState<ModuleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<number | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const didScrollToHashRef = useRef(false);

  useEffect(() => {
    // allow hash scroll when module id changes (new page)
    didScrollToHashRef.current = false;
  }, [moduleId]);

  const fetchModule = useCallback(async () => {
    if (!sessionEmail || !moduleId) return;
    
    setLoading(true);
    setError(null);
    const { data, error: err } = await getModuleDetails(moduleId, sessionEmail);
    
    if (err) {
      setError(err);
    } else if (data) {
      setModule(data);
    }
    setLoading(false);
  }, [moduleId, sessionEmail]);

  useEffect(() => {
    if (sessionEmail && moduleId) {
      void fetchModule();
    }
  }, [sessionEmail, moduleId, fetchModule]);

  // All hooks must be called before any conditional returns
  const sortedSections = useMemo(() => {
    if (!module) return [];
    return module.sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }, [module]);

  // Global next lesson for the whole module (only one БАСТАУ bubble)
  const nextLessonId = useMemo(() => {
    if (sortedSections.length === 0) return null;

    for (const section of sortedSections) {
      const lessons = (section.lessons || [])
        .slice()
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order ||
            (a.lesson_number ?? 0) - (b.lesson_number ?? 0) ||
            a.id - b.id
        );

      const candidate = lessons.find((l) => !l.progress?.completed);
      if (candidate) return candidate.id;
    }

    return null;
  }, [sortedSections]);

  // Scroll to section if URL contains #section-{id}
  useEffect(() => {
    if (didScrollToHashRef.current) return;
    if (sortedSections.length === 0) return;
    if (typeof window === "undefined") return;

    const hash = window.location.hash || "";
    const m = hash.match(/^#section-(\d+)$/);
    if (!m) return;

    const sectionId = Number(m[1]);
    if (!sortedSections.some((s) => s.id === sectionId)) return;

    didScrollToHashRef.current = true;
    setActiveSection(sectionId);

    // wait for layout after render
    setTimeout(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [sortedSections]);

  // Track active section based on scroll position
  useEffect(() => {
    if (sortedSections.length === 0) {
      setActiveSection(null);
      return;
    }

    const updateActiveSection = () => {
      if (typeof window === "undefined") return;

      const scrollY = window.scrollY || window.pageYOffset || 0;

      // When we are near the very top of the page - always show the first section
      if (scrollY < 50) {
        setActiveSection(sortedSections[0].id);
        return;
      }

      const headerOffset = 120; // approximate sticky header height
      const viewportHeight = window.innerHeight;

      let bestSectionId = sortedSections[0].id;
      let bestDistance = Infinity;

      sortedSections.forEach((section) => {
        const el = document.getElementById(`section-${section.id}`);
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // Ignore sections completely out of viewport
        if (rect.bottom < 0 || rect.top > viewportHeight) {
          return;
        }

        const distance = Math.abs(rect.top - headerOffset);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSectionId = section.id;
        }
      });

      setActiveSection(bestSectionId);
    };

    // Initial calculation
    updateActiveSection();

    // Listen to scroll events
    window.addEventListener("scroll", updateActiveSection, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateActiveSection);
    };
  }, [sortedSections]);

  const currentSection = sortedSections.length > 0
    ? (sortedSections.find((s) => s.id === activeSection) || sortedSections[0])
    : null;


  // Conditional returns AFTER all hooks
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">
            Модульді көру үшін кіріңіз
          </h1>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="md:ml-64 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⏳</div>
          <div className="text-gray-600">Модуль жүктелуде...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="md:ml-64 flex items-center justify-center min-h-screen px-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          {error}
        </div>
      </div>
    );
  }

  if (!module) return null;

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      
      {/* Fixed sticky header */}
      {currentSection && (
        <div className="fixed top-0 left-0 right-0 md:left-64 z-50 bg-purple-500 rounded-b-2xl shadow-lg">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-white text-sm font-bold">
                  <div className="flex flex-col leading-tight">
                    <span className="uppercase tracking-wide opacity-90">
                      МОДУЛЬ {moduleId}
                    </span>
                    <span className="opacity-90 text-sm sm:text-base">
                      {currentSection.name}
                    </span>
                    {currentSection.description && currentSection.description.trim().length > 0 && (
                      <span className="opacity-90 text-[11px] sm:text-xs font-normal mt-1 line-clamp-2">
                        {currentSection.description}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 shadow-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                АНЫҚТАМАЛЫҚ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide modal */}
      {guideOpen && currentSection && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <div className="font-bold text-gray-800 text-sm sm:text-base">
                Анықтамалық: {currentSection.name}
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="text-gray-500 hover:text-gray-800 text-xl leading-none px-2"
                aria-label="Жабу"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto text-sm text-gray-800 whitespace-pre-wrap">
              {currentSection.guide && currentSection.guide.trim().length > 0 ? (
                currentSection.guide
              ) : (
                <span className="text-gray-500">
                  Бұл бөлім үшін анықтамалық әлі жазылмаған.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 pt-24 pb-8 relative z-10">
        <div className="w-full max-w-3xl pb-28">
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">

            {/* All sections on one page */}
            <div className="mt-8 space-y-10">
              {sortedSections.length === 0 ? (
                <div className="text-gray-600">Бұл модульде әлі бөлімдер жоқ.</div>
              ) : (
                sortedSections.map((section, sectionIndex) => {
                  const lessons = (section.lessons || [])
                    .slice()
                    .sort(
                      (a, b) =>
                        a.sort_order - b.sort_order ||
                        (a.lesson_number ?? 0) - (b.lesson_number ?? 0) ||
                        a.id - b.id
                    );
                  const displayedLessons = lessons.slice(0, 5);
                  const isActiveSection = currentSection && currentSection.id === section.id;

                  return (
                    <section key={section.id} id={`section-${section.id}`} className="scroll-mt-24">
                      {/* Описание раздела (через CMS) с линиями слева и справа — для разделов, кроме первого */}
                      {sectionIndex > 0 &&
                        section.description &&
                        section.description.trim().length > 0 && (
                          <div className="mt-8 mb-4 flex items-center gap-3 text-gray-400 text-xs sm:text-sm font-semibold">
                            <div className="flex-1 h-px bg-gray-200" />
                            <div className="px-3 text-center whitespace-normal">
                              {section.description}
                            </div>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}

                      <div className="mt-6 relative min-h-[520px]">
                        <div className="flex flex-col items-center gap-10">
                          {displayedLessons.length === 0 ? (
                            <div className="text-gray-700 mt-10">Бұл бөлімде әлі сабақтар жоқ.</div>
                          ) : (
                            displayedLessons.map((lesson, idx) => {
                              const isCompleted = !!lesson.progress?.completed;
                              const isCurrent = nextLessonId !== null && lesson.id === nextLessonId;
                              const p = lesson.progress ? clamp01(lesson.progress.progress) : 0;
                              const offset = idx % 2 === 0 ? "-translate-x-16" : "translate-x-16";
                              const icon = idx === 2 ? "🧰" : idx === 4 ? "🏆" : "⭐";

                              return (
                                <div key={lesson.id} className={`relative ${offset}`}>
                                {isCurrent ? (
                                  <div className="relative">
                                    <DuolingoStartBubble />
                                    <div className="relative w-[90px] h-[90px]">
                                      {/* ring */}
                                      <div className="absolute inset-0 pointer-events-none">
                                        <DuolingoProgressRing progress={p} size={90} stroke={10} />
                                      </div>

                                      {/* inner disc */}
                                      <Link
                                        href={`/lessons/${lesson.id}`}
                                        title={lesson.title || `Сабақ ${lesson.lesson_number ?? lesson.id}`}
                                        className="absolute inset-0 flex items-center justify-center"
                                      >
                                        <div
                                          className="w-[64px] h-[64px] rounded-full flex items-center justify-center shadow-md"
                                          style={{
                                            background: "linear-gradient(180deg, #63E200 0%, #58CC02 55%, #43A301 100%)",
                                          }}
                                        >
                                          <DuolingoStar size={32} />
                                        </div>
                                      </Link>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <Link
                                      href={`/lessons/${lesson.id}`}
                                      className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl select-none transition-transform hover:scale-105 shadow-md ${
                                        isCompleted ? "bg-green-600 text-white" : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                                      }`}
                                      title={lesson.title || `Сабақ ${lesson.lesson_number ?? lesson.id}`}
                                    >
                                      {icon}
                                    </Link>
                                  </div>
                                )}
                                </div>
                              );
                            })
                          )}
                        </div>

                        {lessons.length > 5 && (
                          <div className="text-xs text-gray-600 mt-4 text-center">
                            {lessons.length} сабақтан 5-і көрсетілді.
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      <MobileNav currentPage="modules" />
    </div>
  );
}
