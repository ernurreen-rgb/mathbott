"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import ModuleLessonJourney, {
  getLessonDisplayProgress,
  isLessonJourneyCompleted,
  sortJourneyLessons,
  sortJourneySections,
} from "@/components/modules/ModuleLessonJourney";
import { getModuleHeaderCollapsedState } from "@/components/modules/moduleHeaderState";
import { getModuleDetails } from "@/lib/api";
import type { ModuleDetails, Section } from "@/types";

function OrnamentRail({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute top-24 hidden h-[calc(100%-10rem)] w-16 flex-col items-center justify-around opacity-25 sm:flex lg:w-24 ${
        side === "left" ? "left-0" : "right-0 scale-x-[-1]"
      }`}
    >
      {[0, 1, 2, 3, 4, 5, 6].map((item) => (
        <svg
          key={item}
          viewBox="0 0 64 92"
          className="h-24 w-14 text-rose-300 lg:w-16"
        >
          <path
            d="M32 7c-17 0-22 18-11 27 8 7 19 1 14-8-3-5-11-2-9 4M32 7c17 0 22 18 11 27-8 7-19 1-14-8 3-5 11-2 9 4M32 84c-17 0-22-18-11-27 8-7 19-1 14 8-3 5-11 2-9-4M32 84c17 0 22-18 11-27-8-7-19-1-14 8 3 5 11 2 9-4M32 7v77"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
  );
}

function MountainBackdrop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 360"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-x-0 bottom-0 h-72 w-full text-purple-300/20"
    >
      <path
        d="M0 315 135 195l70 58 125-145 104 126 104-88 89 96 135-186 126 189 76-66 136 136"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="m0 342 174-90 86 42 152-99 102 70 104-39 112 56 155-115 110 104 79-29 126 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function PageLoader({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#fff9f4] via-[#fff1f8] to-violet-100"
    >
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
    </div>
  );
}

export default function ModuleDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const params = useParams();
  const rawModuleId = Array.isArray(params.id) ? params.id[0] : params.id;
  const moduleId = Number(rawModuleId);
  const isValidModuleId = Number.isInteger(moduleId) && moduleId > 0;
  const sessionEmail = session?.user?.email || null;

  const [module, setModule] = useState<ModuleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);
  const [guideSectionId, setGuideSectionId] = useState<number | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const didScrollToHashRef = useRef(false);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const guideCloseButtonRef = useRef<HTMLButtonElement>(null);

  const fetchModule = useCallback(async () => {
    if (!sessionEmail || !isValidModuleId) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: requestError } = await getModuleDetails(
        moduleId,
        sessionEmail,
      );
      if (requestError) {
        setError(requestError);
        setModule(null);
      } else {
        setModule(data);
      }
    } catch (requestError) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to load module:", requestError);
      }
      setError("Модульді жүктеу мүмкін болмады");
      setModule(null);
    } finally {
      setLoading(false);
    }
  }, [isValidModuleId, moduleId, sessionEmail]);

  useEffect(() => {
    didScrollToHashRef.current = false;
    setActiveSectionId(null);
  }, [moduleId]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!isValidModuleId) {
      setError("Модуль нөмірі қате");
      setLoading(false);
      return;
    }
    if (!sessionEmail) {
      setLoading(false);
      return;
    }
    void fetchModule();
  }, [fetchModule, isValidModuleId, sessionEmail, sessionStatus]);

  const sortedSections = useMemo(
    () => sortJourneySections(module?.sections || []),
    [module?.sections],
  );

  useEffect(() => {
    if (sortedSections.length === 0) {
      setActiveSectionId(null);
      return;
    }
    if (!sortedSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(sortedSections[0].id);
    }
  }, [activeSectionId, sortedSections]);

  useEffect(() => {
    if (didScrollToHashRef.current || sortedSections.length === 0) return;
    const match = window.location.hash.match(/^#section-(\d+)$/);
    if (!match) return;

    const sectionId = Number(match[1]);
    if (!sortedSections.some((section) => section.id === sectionId)) return;

    didScrollToHashRef.current = true;
    setActiveSectionId(sectionId);
    const timeoutId = window.setTimeout(() => {
      document.getElementById(`section-${sectionId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [sortedSections]);

  useEffect(() => {
    if (sortedSections.length === 0) return;

    let animationFrameId: number | null = null;
    const updateActiveSection = () => {
      animationFrameId = null;
      const activationLine = 190;
      let nextSectionId = sortedSections[0].id;

      for (const section of sortedSections) {
        const element = document.getElementById(`section-${section.id}`);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= activationLine) {
          nextSectionId = section.id;
        } else {
          break;
        }
      }

      setActiveSectionId((current) =>
        current === nextSectionId ? current : nextSectionId,
      );
    };

    const scheduleUpdate = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(updateActiveSection);
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrameId !== null)
        window.cancelAnimationFrame(animationFrameId);
    };
  }, [sortedSections]);

  useLayoutEffect(() => {
    let animationFrameId: number | null = null;

    const updateHeaderState = () => {
      animationFrameId = null;
      const scrollY = window.scrollY || window.pageYOffset;
      setIsHeaderCollapsed((current) =>
        getModuleHeaderCollapsedState(scrollY, current),
      );
    };

    const scheduleUpdate = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(updateHeaderState);
    };

    updateHeaderState();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      if (animationFrameId !== null)
        window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const currentSection = useMemo(
    () =>
      sortedSections.find((section) => section.id === activeSectionId) ||
      sortedSections[0] ||
      null,
    [activeSectionId, sortedSections],
  );

  const guideSection = useMemo(
    () =>
      sortedSections.find((section) => section.id === guideSectionId) || null,
    [guideSectionId, sortedSections],
  );

  const closeGuide = useCallback(() => {
    setGuideSectionId(null);
    window.requestAnimationFrame(() => guideButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!guideSection) return;
    guideCloseButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGuide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGuide, guideSection]);

  const sectionSummary = useMemo(() => {
    const lessons = sortJourneyLessons(currentSection?.lessons);
    const completed = lessons.filter(isLessonJourneyCompleted).length;
    const progress = lessons.length
      ? Math.round(
          (lessons.reduce(
            (total, lesson) => total + getLessonDisplayProgress(lesson),
            0,
          ) /
            lessons.length) *
            100,
        )
      : 0;
    return { completed, progress, total: lessons.length };
  }, [currentSection]);

  if (sessionStatus === "loading")
    return <PageLoader label="Сессия жүктелуде" />;

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#fff9f4] via-[#fff1f8] to-violet-100 px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/80 bg-white/85 p-8 text-center shadow-2xl">
          <div className="text-5xl">🔐</div>
          <h1 className="mt-4 text-2xl font-black text-slate-900">
            Модульді көру үшін кіріңіз
          </h1>
        </div>
      </div>
    );
  }

  if (loading) return <PageLoader label="Модуль жүктелуде" />;

  if (error || !module) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#fff9f4] via-[#fff1f8] to-violet-100 px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-7 text-center shadow-xl"
        >
          <div className="text-4xl">⚠️</div>
          <div className="mt-3 font-bold text-red-700">
            {error || "Модуль табылмады"}
          </div>
          {isValidModuleId && sessionEmail && (
            <button
              type="button"
              onClick={() => void fetchModule()}
              className="mt-5 rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700"
            >
              Қайта жүктеу
            </button>
          )}
          <Link
            href="/modules"
            className="mt-4 block text-sm font-bold text-purple-700 hover:underline"
          >
            ← Модульдерге қайту
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-gradient-to-br from-[#fff9f4] via-[#fff1f8] to-[#ebe9ff] pb-24 md:pb-12">
      <div
        aria-hidden="true"
        className="fixed -left-32 top-12 h-96 w-96 rounded-full bg-fuchsia-200/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="fixed -right-28 top-72 h-[28rem] w-[28rem] rounded-full bg-blue-200/35 blur-3xl"
      />
      <MountainBackdrop />
      <DesktopNav />

      <header className="pointer-events-none sticky top-0 z-40 h-[132px] px-3 pt-3 sm:h-[144px] sm:px-6 md:ml-64">
        <div
          data-header-state={isHeaderCollapsed ? "collapsed" : "expanded"}
          className={`pointer-events-auto mx-auto overflow-hidden border border-white/90 bg-white/90 shadow-[0_18px_55px_rgba(88,28,135,0.16)] backdrop-blur-xl transition-[max-width,padding,border-radius,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
            isHeaderCollapsed
              ? "max-w-2xl rounded-2xl p-2.5 shadow-[0_12px_35px_rgba(88,28,135,0.14)]"
              : "max-w-4xl rounded-[1.75rem] p-4 sm:p-5"
          }`}
        >
          <div
            className={`flex items-center transition-[gap] duration-300 motion-reduce:transition-none ${
              isHeaderCollapsed ? "gap-2" : "gap-3 sm:gap-4"
            }`}
          >
            <Link
              href="/modules"
              aria-label="Модульдерге қайту"
              className={`flex shrink-0 items-center justify-center bg-purple-50 font-black text-purple-700 transition hover:bg-purple-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 ${
                isHeaderCollapsed
                  ? "h-10 w-10 rounded-xl text-lg"
                  : "h-11 w-11 rounded-2xl text-xl"
              }`}
            >
              ←
            </Link>

            <h1 className="sr-only">{module.name}</h1>
            <div
              className={`relative min-w-0 flex-1 transition-[height] duration-300 ease-out motion-reduce:transition-none ${
                isHeaderCollapsed ? "h-9" : "h-[3.75rem]"
              }`}
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 flex flex-col justify-center transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
                  isHeaderCollapsed
                    ? "pointer-events-none -translate-y-1 opacity-0"
                    : "translate-y-0 opacity-100 delay-100"
                }`}
              >
                  <div className="truncate text-xl font-black text-slate-900 sm:text-2xl">
                    {module.icon || "📚"} {module.name}
                  </div>
                {currentSection && (
                  <div className="truncate text-xs font-semibold text-slate-500 sm:text-sm">
                    {currentSection.name}
                  </div>
                )}
              </div>

              <div
                aria-hidden="true"
                className={`absolute inset-0 flex flex-col justify-center transition-[opacity,transform] duration-200 motion-reduce:transition-none ${
                  isHeaderCollapsed
                    ? "translate-y-0 opacity-100 delay-100"
                    : "pointer-events-none translate-y-1 opacity-0"
                }`}
              >
                <div className="truncate text-sm font-black text-slate-900 sm:text-base">
                  {module.icon || "📚"} {currentSection?.name || module.name}
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              className={`shrink-0 overflow-hidden text-right transition-[max-width,opacity] duration-300 motion-reduce:transition-none ${
                isHeaderCollapsed
                  ? "max-w-16 opacity-100"
                  : "max-w-0 opacity-0 sm:max-w-[9rem] sm:opacity-100"
              }`}
            >
              <div
                className={`overflow-hidden text-[10px] font-bold uppercase tracking-wide text-purple-500 transition-[max-height,opacity] duration-200 motion-reduce:transition-none ${
                  isHeaderCollapsed
                    ? "max-h-0 opacity-0"
                    : "max-h-4 opacity-100"
                }`}
              >
                Прогресс
              </div>
              <div className="whitespace-nowrap text-sm font-black text-slate-800 sm:text-lg">
                {sectionSummary.completed}/{sectionSummary.total}
                <span
                  className={`inline-block overflow-hidden align-bottom transition-[max-width,opacity] duration-200 motion-reduce:transition-none ${
                    isHeaderCollapsed
                      ? "max-w-0 opacity-0"
                      : "max-w-16 opacity-100"
                  }`}
                >
                  &nbsp;сабақ
                </span>
              </div>
            </div>

            {currentSection && (
              <button
                ref={guideButtonRef}
                type="button"
                onClick={() => setGuideSectionId(currentSection.id)}
                aria-label={`Анықтамалық: ${currentSection.name}`}
                title={isHeaderCollapsed ? "Анықтамалық" : undefined}
                className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-r from-fuchsia-600 to-purple-700 font-black text-white shadow-lg transition-[height,padding,border-radius,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 motion-reduce:transition-none ${
                  isHeaderCollapsed
                    ? "h-10 w-10 rounded-xl p-0"
                    : "h-11 gap-2 rounded-2xl px-3.5 py-2 text-xs sm:px-4 sm:text-sm"
                }`}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 .3.7V19a2 2 0 0 1-2 2Z"
                  />
                </svg>
                <span
                  className={`hidden overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 motion-reduce:transition-none min-[350px]:inline-block ${
                    isHeaderCollapsed
                      ? "max-w-0 opacity-0"
                      : "max-w-32 opacity-100"
                  }`}
                >
                  Анықтамалық
                </span>
              </button>
            )}
          </div>

          <div
            role="progressbar"
            aria-label="Бөлім прогресі"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={sectionSummary.progress}
            className={`overflow-hidden rounded-full bg-purple-100 transition-[height,margin] duration-300 motion-reduce:transition-none ${
              isHeaderCollapsed ? "mt-1.5 h-1" : "mt-4 h-2"
            }`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-600 to-blue-500 transition-[width] duration-700"
              style={{ width: `${sectionSummary.progress}%` }}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 px-3 pb-8 pt-5 sm:px-6 md:ml-64 lg:px-10">
        <OrnamentRail side="left" />
        <OrnamentRail side="right" />
        <div className="relative z-10 mx-auto w-full max-w-4xl">
          {module.description?.trim() && (
            <div className="mb-5 rounded-2xl border border-white/80 bg-white/65 px-5 py-4 text-sm leading-relaxed text-slate-600 shadow-sm backdrop-blur-sm">
              {module.description}
            </div>
          )}

          {sortedSections.length === 0 ? (
            <div className="rounded-[2rem] border border-white/90 bg-white/80 px-6 py-16 text-center shadow-xl">
              <div className="text-5xl">📦</div>
              <div className="mt-3 font-bold text-slate-600">
                Бұл модульде бөлімдер әлі қосылмаған.
              </div>
            </div>
          ) : (
            <ModuleLessonJourney sections={sortedSections} />
          )}
        </div>
      </main>

      {guideSection && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="module-guide-title"
            className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-purple-100 bg-gradient-to-r from-rose-50 to-violet-50 px-5 py-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-600">
                  Анықтамалық
                </div>
                <h2
                  id="module-guide-title"
                  className="mt-1 font-black text-slate-900"
                >
                  {guideSection.name}
                </h2>
              </div>
              <button
                ref={guideCloseButtonRef}
                type="button"
                onClick={closeGuide}
                aria-label="Жабу"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-2xl text-slate-500 shadow-sm hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-200"
              >
                ×
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap px-5 py-5 text-sm leading-relaxed text-slate-700 sm:px-7">
              {guideSection.guide?.trim() || (
                <span className="text-slate-500">
                  Бұл бөлім үшін анықтамалық әлі жазылмаған.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <MobileNav currentPage="modules" />
    </div>
  );
}
