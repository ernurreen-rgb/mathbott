"use client";

import Link from "next/link";

import type { LessonSummary, Section } from "@/types";
import styles from "./ModuleLessonJourney.module.css";

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

const statusAriaLabel: Record<LessonJourneyStatus, string> = {
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

const connectorTrackClasses: Record<LessonJourneyStatus, string> = {
  completed: "bg-emerald-300",
  active: "bg-fuchsia-300",
  upcoming: "bg-violet-200",
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-current sm:h-9 sm:w-9">
      <path d="M8 5.8c0-1.1 1.2-1.8 2.2-1.2l8.5 5.2a2.55 2.55 0 0 1 0 4.4l-8.5 5.2A1.45 1.45 0 0 1 8 18.2V5.8Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-9 w-9 fill-none stroke-current sm:h-10 sm:w-10"
      strokeWidth="2.8"
    >
      <path d="m5 12.5 4.2 4.2L19.5 6.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LessonNodeIcon({ lesson, status }: { lesson: LessonSummary; status: LessonJourneyStatus }) {
  if (status === "completed") return <CheckIcon />;
  if (status === "active") return <PlayIcon />;
  return <span className="text-2xl font-black sm:text-3xl">{lesson.lesson_number ?? lesson.id}</span>;
}

function ProgressMarks({ lesson }: { lesson: LessonSummary }) {
  const progress = getLessonDisplayProgress(lesson);
  const filled = progress > 0 ? Math.ceil(progress * 4) : 0;

  return (
    <span
      role="img"
      aria-label={`Сабақ прогресі ${Math.round(progress * 100)}%`}
      className={`${styles.progressMarks} flex justify-center gap-1`}
    >
      {[0, 1, 2, 3].map((mark) => (
        <span
          key={mark}
          aria-hidden="true"
          className={`${styles.progressMark} h-1.5 w-4 rounded-full ${mark < filled ? "bg-amber-400" : "bg-violet-100"}`}
        />
      ))}
    </span>
  );
}

function SectionProgress({ lessons }: { lessons: LessonSummary[] }) {
  const completed = lessons.filter(isLessonJourneyCompleted).length;
  const percent = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;

  return (
    <div className="min-w-[88px] text-right sm:min-w-[104px]">
      <div className="text-[10px] font-bold uppercase tracking-wide text-purple-500 sm:text-xs">Сабақтар</div>
      <div className="mt-0.5 text-lg font-black text-slate-800 sm:mt-1 sm:text-xl">
        {completed}/{lessons.length}
      </div>
      <div
        role="progressbar"
        aria-label="Бөлім прогресі"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-purple-100 sm:mt-2"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

type ModuleLessonJourneyProps = {
  sections: Section[];
  onOpenGuide?: (sectionId: number, trigger: HTMLButtonElement) => void;
};

export default function ModuleLessonJourney({ sections, onOpenGuide }: ModuleLessonJourneyProps) {
  const sortedSections = sortJourneySections(sections);
  const activeLessonId = getNextJourneyLessonId(sortedSections);
  let globalLessonIndex = 0;

  return (
    <div className={`${styles.journey} space-y-5 sm:space-y-6`}>
      {sortedSections.map((section, sectionIndex) => {
        const lessons = sortJourneyLessons(section.lessons);
        const sectionStartIndex = globalLessonIndex;
        globalLessonIndex += lessons.length;

        return (
          <section
            key={section.id}
            id={`section-${section.id}`}
            className={`scroll-mt-3 overflow-hidden rounded-[1.5rem] border border-white/90 bg-white/70 shadow-[0_20px_60px_rgba(88,28,135,0.1)] backdrop-blur-sm sm:rounded-[2rem] ${lessons.length === 5 ? styles.viewportSection : ""}`}
          >
            <header className="flex items-start justify-between gap-3 border-b border-purple-100/80 bg-gradient-to-r from-rose-50/90 via-white/80 to-violet-50/90 px-4 py-3.5 sm:gap-4 sm:px-7 sm:py-[18px]">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-600">
                  {sectionIndex + 1}-бөлім
                </div>
                <h2 className="mt-0.5 text-lg font-black text-slate-900 sm:text-2xl">{section.name}</h2>
                {section.description?.trim() && (
                  <p className="mt-0.5 line-clamp-2 max-w-xl text-xs leading-relaxed text-slate-500 sm:mt-1 sm:text-sm">
                    {section.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <SectionProgress lessons={lessons} />
                {onOpenGuide && (
                  <button
                    type="button"
                    onClick={(event) => onOpenGuide(section.id, event.currentTarget)}
                    aria-label={`Анықтамалық: ${section.name}`}
                    title={`Анықтамалық: ${section.name}`}
                    className={`${styles.guideButton} inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-700 text-xs font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-purple-200 motion-reduce:transition-none`}
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 .3.7V19a2 2 0 0 1-2 2Z"
                      />
                    </svg>
                    <span className={`${styles.guideLabel} hidden whitespace-nowrap`}>Анықтамалық</span>
                  </button>
                )}
              </div>
            </header>

            {lessons.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm font-semibold text-slate-500">
                Бұл бөлімде сабақтар әлі қосылмаған.
              </div>
            ) : (
              <ol
                className={`${styles.lessonList} relative mx-auto w-full max-w-2xl list-none px-2 pb-2 ${
                  lessons.length <= 5 ? styles.shortList : ""
                } ${
                  lessons[0]?.id === activeLessonId ? `${styles.activeStart} pt-10` : "pt-5"
                }`}
              >
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
                      className={`${styles.lessonStep} relative h-[130px]`}
                    >
                      {lessonIndex < lessons.length - 1 && (
                        <>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            className={`${styles.lessonConnector} pointer-events-none absolute left-0 top-[44px] z-0 h-[130px] w-full overflow-visible`}
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
                          <span
                            aria-hidden="true"
                            className={`${styles.horizontalConnector} pointer-events-none absolute left-1/2 top-[46px] z-0 hidden h-[5px] w-full rounded-full ${connectorTrackClasses[status]}`}
                          />
                          <span
                            aria-hidden="true"
                            className={`${styles.horizontalConnector} pointer-events-none absolute left-1/2 top-[48px] z-0 hidden h-px w-full border-t border-dashed border-white/80`}
                          />
                        </>
                      )}

                      <Link
                        href={`/lessons/${lesson.id}`}
                        aria-current={status === "active" ? "step" : undefined}
                        aria-label={`${title}. ${statusAriaLabel[status]}. ${Math.round(progress * 100)}%`}
                        className={`${styles.lessonLink} group absolute top-0 z-10 w-[132px] -translate-x-1/2 text-center focus:outline-none ${
                          isLeft ? "left-1/4" : "left-3/4"
                        }`}
                      >
                        <span
                          className={`${styles.lessonNode} relative mx-auto flex h-[88px] w-[88px] items-center justify-center rounded-full border-[6px] border-white transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 group-focus-visible:ring-4 group-focus-visible:ring-purple-300 ${nodeClasses[status]}`}
                        >
                          <LessonNodeIcon lesson={lesson} status={status} />
                          {status === "active" && (
                            <span className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xl border-2 border-violet-100 bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-purple-700 shadow-md after:absolute after:-bottom-2 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-45 after:border-b-2 after:border-r-2 after:border-violet-100 after:bg-white sm:-top-11 sm:px-3 sm:text-[10px]">
                              Бастау
                            </span>
                          )}
                        </span>

                        <span className={`${styles.progressWrap} mt-2 block`}>
                          <ProgressMarks lesson={lesson} />
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
