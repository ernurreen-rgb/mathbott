"use client";

import Link from "next/link";

import type { LessonSummary, Section } from "@/types";

export type LessonJourneyStatus = "completed" | "active" | "upcoming";

const clamp01 = (value: number | undefined): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));

export const sortJourneySections = (sections: Section[]): Section[] =>
  sections.slice().sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

export const sortJourneyLessons = (lessons: LessonSummary[] = []): LessonSummary[] =>
  lessons.slice().sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      (a.lesson_number ?? 0) - (b.lesson_number ?? 0) ||
      a.id - b.id
  );

export const getLessonDisplayName = (lesson: LessonSummary): string =>
  lesson.title?.trim() || `Сабақ ${lesson.lesson_number ?? lesson.id}`;

export const getLessonDisplayProgress = (lesson: LessonSummary): number => {
  const reportedProgress = clamp01(lesson.progress?.progress);
  const totalMiniLessons = Math.max(
    0,
    lesson.progress?.total_mini_lessons || lesson.mini_lessons?.length || 0
  );
  const completedMiniLessons = Math.max(
    0,
    Math.min(totalMiniLessons, lesson.progress?.completed_mini_lessons || 0)
  );

  if (totalMiniLessons === 0) return reportedProgress;
  const miniLessonProgress = completedMiniLessons / totalMiniLessons;
  if (miniLessonProgress === 1) return 1;
  if (reportedProgress === 1) return miniLessonProgress;
  return Math.max(reportedProgress, miniLessonProgress);
};

export const isLessonJourneyCompleted = (lesson: LessonSummary): boolean => {
  const totalMiniLessons = lesson.progress?.total_mini_lessons || lesson.mini_lessons?.length || 0;
  if (totalMiniLessons > 0) {
    return (lesson.progress?.completed_mini_lessons || 0) >= totalMiniLessons;
  }
  return Boolean(lesson.progress?.completed);
};

export const getNextJourneyLessonId = (sections: Section[]): number | null => {
  for (const section of sortJourneySections(sections)) {
    const lesson = sortJourneyLessons(section.lessons).find(
      (candidate) => !isLessonJourneyCompleted(candidate)
    );
    if (lesson) return lesson.id;
  }
  return null;
};

export const getLessonJourneyStatus = (
  lesson: LessonSummary,
  activeLessonId: number | null
): LessonJourneyStatus => {
  if (isLessonJourneyCompleted(lesson)) return "completed";
  if (lesson.id === activeLessonId) return "active";
  return "upcoming";
};

const statusLabel: Record<LessonJourneyStatus, string> = {
  completed: "Аяқталды",
  active: "Қазір оқитын сабақ",
  upcoming: "Алда",
};

const nodeClasses: Record<LessonJourneyStatus, string> = {
  completed:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-[0_14px_35px_rgba(16,185,129,0.3)]",
  active:
    "bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 text-white shadow-[0_18px_42px_rgba(147,51,234,0.38)]",
  upcoming:
    "bg-gradient-to-br from-white to-violet-50 text-violet-500 shadow-[0_12px_30px_rgba(91,33,182,0.14)]",
};

const connectorClasses: Record<LessonJourneyStatus, string> = {
  completed: "stroke-emerald-300",
  active: "stroke-fuchsia-300",
  upcoming: "stroke-violet-200",
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10 fill-current">
      <path d="M8 5.8c0-1.1 1.2-1.8 2.2-1.2l8.5 5.2a2.55 2.55 0 0 1 0 4.4l-8.5 5.2A1.45 1.45 0 0 1 8 18.2V5.8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-11 w-11 fill-none stroke-current"
      strokeWidth="2.8"
    >
      <path d="m5 12.5 4.2 4.2L19.5 6.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LessonNodeIcon({ lesson, status }: { lesson: LessonSummary; status: LessonJourneyStatus }) {
  if (status === "completed") return <CheckIcon />;
  if (status === "active") return <PlayIcon />;
  return <span className="text-3xl font-black">{lesson.lesson_number ?? lesson.id}</span>;
}

function ProgressMarks({ lesson }: { lesson: LessonSummary }) {
  const progress = getLessonDisplayProgress(lesson);
  const filled = progress > 0 ? Math.ceil(progress * 4) : 0;

  return (
    <span
      role="img"
      aria-label={`Сабақ прогресі ${Math.round(progress * 100)}%`}
      className="flex justify-center gap-1.5"
    >
      {[0, 1, 2, 3].map((mark) => (
        <span
          key={mark}
          aria-hidden="true"
          className={`h-2 w-5 rounded-full ${mark < filled ? "bg-amber-400" : "bg-violet-100"}`}
        />
      ))}
    </span>
  );
}

function SectionProgress({ lessons }: { lessons: LessonSummary[] }) {
  const completed = lessons.filter(isLessonJourneyCompleted).length;
  const percent = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;

  return (
    <div className="min-w-[118px] text-right">
      <div className="text-xs font-bold uppercase tracking-wide text-purple-500">Сабақтар</div>
      <div className="mt-1 text-xl font-black text-slate-800">
        {completed}/{lessons.length}
      </div>
      <div
        role="progressbar"
        aria-label="Бөлім прогресі"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-purple-100"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function ModuleLessonJourney({ sections }: { sections: Section[] }) {
  const sortedSections = sortJourneySections(sections);
  const activeLessonId = getNextJourneyLessonId(sortedSections);
  let globalLessonIndex = 0;

  return (
    <div className="space-y-7">
      {sortedSections.map((section, sectionIndex) => {
        const lessons = sortJourneyLessons(section.lessons);
        const sectionStartIndex = globalLessonIndex;
        globalLessonIndex += lessons.length;

        return (
          <section
            key={section.id}
            id={`section-${section.id}`}
            className="scroll-mt-40 overflow-hidden rounded-[2rem] border border-white/90 bg-white/70 shadow-[0_20px_60px_rgba(88,28,135,0.1)] backdrop-blur-sm"
          >
            <header className="flex items-start justify-between gap-4 border-b border-purple-100/80 bg-gradient-to-r from-rose-50/90 via-white/80 to-violet-50/90 px-5 py-5 sm:px-7">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-600">
                  {sectionIndex + 1}-бөлім
                </div>
                <h2 className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{section.name}</h2>
                {section.description?.trim() && (
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
                    {section.description}
                  </p>
                )}
              </div>
              <SectionProgress lessons={lessons} />
            </header>

            {lessons.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                Бұл бөлімде сабақтар әлі қосылмаған.
              </div>
            ) : (
              <ol className="relative mx-auto w-full max-w-2xl list-none px-2 pb-3 pt-12 sm:px-8">
                {lessons.map((lesson, lessonIndex) => {
                  const index = sectionStartIndex + lessonIndex;
                  const isLeft = index % 2 === 0;
                  const status = getLessonJourneyStatus(lesson, activeLessonId);
                  const progress = getLessonDisplayProgress(lesson);
                  const title = getLessonDisplayName(lesson);

                  return (
                    <li
                      key={lesson.id}
                      data-side={isLeft ? "left" : "right"}
                      className="relative h-[225px] sm:h-[235px]"
                    >
                      {lessonIndex < lessons.length - 1 && (
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          className="pointer-events-none absolute left-0 top-[52px] z-0 h-[225px] w-full overflow-visible sm:h-[235px]"
                        >
                          <path
                            d={isLeft ? "M 25 0 C 25 38, 75 62, 75 100" : "M 75 0 C 75 38, 25 62, 25 100"}
                            className={`${connectorClasses[status]} fill-none`}
                            strokeWidth="5"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <path
                            d={isLeft ? "M 25 0 C 25 38, 75 62, 75 100" : "M 75 0 C 75 38, 25 62, 25 100"}
                            className="fill-none stroke-white/70"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeDasharray="1 9"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      )}

                      <Link
                        href={`/lessons/${lesson.id}`}
                        aria-current={status === "active" ? "step" : undefined}
                        aria-label={`${title}. ${statusLabel[status]}. ${Math.round(progress * 100)}%`}
                        className={`group absolute top-0 z-10 w-[144px] -translate-x-1/2 text-center focus:outline-none sm:w-[174px] ${
                          isLeft ? "left-1/4" : "left-3/4"
                        }`}
                      >
                        <span
                          className={`relative mx-auto flex h-[104px] w-[104px] items-center justify-center rounded-full border-[7px] border-white transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-purple-300 ${nodeClasses[status]}`}
                        >
                          <LessonNodeIcon lesson={lesson} status={status} />
                          {status === "active" && (
                            <span className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-2xl border-2 border-violet-100 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-purple-700 shadow-md after:absolute after:-bottom-2 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-45 after:border-b-2 after:border-r-2 after:border-violet-100 after:bg-white">
                              Бастау
                            </span>
                          )}
                        </span>

                        <span className="mt-3 block">
                          <ProgressMarks lesson={lesson} />
                          <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-base font-black leading-tight text-slate-800 transition-colors group-hover:text-purple-700 sm:text-lg">
                            {title}
                          </span>
                          <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide text-purple-500">
                            {statusLabel[status]}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {lesson.progress?.total_mini_lessons
                              ? `${lesson.progress.completed_mini_lessons || 0} / ${lesson.progress.total_mini_lessons} шағын сабақ`
                              : `${Math.round(progress * 100)}% орындалды`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
