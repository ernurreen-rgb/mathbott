import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { Quiz } from "@/types/quiz";

// The grade tile is the fastest thing to scan in a long list, so school stages get their own colour.
function gradeTone(grade?: number | null): string {
  if (!grade) return "bg-slate-100 text-slate-500";
  if (grade <= 4) return "bg-emerald-100 text-emerald-700";
  if (grade <= 6) return "bg-sky-100 text-sky-700";
  if (grade <= 9) return "bg-violet-100 text-violet-700";
  return "bg-amber-100 text-amber-700";
}

const MENU_ITEM = "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium hover:bg-slate-50";

export interface QuizRowProps {
  quiz: Quiz;
  busy: boolean;
  signedIn: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onPickTopic: (topic: string) => void;
  onTogglePrivacy: () => void;
  onDelete: () => void;
  onFork: () => void;
  /** Set while the catalog is in selection mode: the row then ticks the quiz instead of opening it. */
  selection?: { selected: boolean; onToggle: () => void };
}

const TITLE = "line-clamp-2 font-semibold text-slate-900 after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-purple-500 sm:line-clamp-1";

export default function QuizRow({ quiz, busy, signedIn, menuOpen, onToggleMenu, onPickTopic, onTogglePrivacy, onDelete, onFork, selection }: QuizRowProps) {
  const selectable = Boolean(selection && quiz.can_manage);
  const minutes = Math.max(1, Math.round((quiz.duration_seconds || 0) / 60));
  const questions = quiz.question_count || 0;
  const canFork = !quiz.can_manage && quiz.is_public && signedIn;
  const facts = [
    `${questions} сұрақ`,
    questions > 0 ? `≈ ${minutes} мин` : null,
    quiz.play_count ? `${quiz.play_count} рет ойналды` : null,
  ].filter(Boolean);

  return (
    <li className={`group relative flex items-center gap-3 px-3 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl sm:gap-4 sm:px-4 ${
      busy || (selection && !selectable) ? "opacity-40" : selection?.selected ? "bg-purple-50" : "hover:bg-purple-50/50"
    }`}>
      {selectable && (
        <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          selection!.selected ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300 bg-white"
        }`}>
          {selection!.selected && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      )}
      <div className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ${gradeTone(quiz.grade)}`}>
        {quiz.grade ? (
          <>
            <span className="text-base font-bold leading-none">{quiz.grade}</span>
            <span className="mt-0.5 text-[9px] font-semibold leading-none">сынып</span>
          </>
        ) : (
          <Icon name="quiz" className="h-5 w-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* The stretched link makes the whole row open the quiz; real controls sit above it. */}
        {selectable ? (
          <button type="button" role="checkbox" aria-checked={selection!.selected} onClick={selection!.onToggle} className={`${TITLE} text-left`}>
            {quiz.title}
          </button>
        ) : selection ? (
          <span className="line-clamp-2 font-semibold text-slate-900 sm:line-clamp-1">{quiz.title}</span>
        ) : (
          <Link href={`/quizzes/${quiz.id}`} className={`${TITLE} group-hover:text-purple-700`}>
            {quiz.title}
          </Link>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {quiz.topic && (selection ? (
            <span className="max-w-full truncate font-semibold text-purple-700">{quiz.topic}</span>
          ) : (
            <button type="button" onClick={() => onPickTopic(quiz.topic!)} title="Осы тақырыптағы квиздер"
              className="relative z-10 max-w-full truncate font-semibold text-purple-700 hover:underline">
              {quiz.topic}
            </button>
          ))}
          {facts.map((fact) => <span key={fact}>{fact}</span>)}
          {!quiz.is_public && (
            // From sm up the switch on the right says "Жеке" itself; a phone only has room for its track.
            <span className={`items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 ${quiz.can_manage && !selection ? "inline-flex sm:hidden" : "inline-flex"}`} title="Тек сізге көрінетін жеке квиз">
              <Icon name="lock" className="h-3 w-3" />
              Жеке
            </span>
          )}
        </div>
        {quiz.description && <p className="mt-1 hidden text-xs text-slate-400 md:line-clamp-1">{quiz.description}</p>}
      </div>

      {!selection && (
        <span aria-hidden className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-sm font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 sm:inline-flex">
          <Icon name="play" className="h-3.5 w-3.5" />
          Ашу
        </span>
      )}

      {/* Open or hide the quiz in the catalog right from the list. */}
      {!selection && quiz.can_manage && (
        <button
          type="button"
          role="switch"
          aria-checked={quiz.is_public}
          aria-label={`«${quiz.title}» каталогта ашық`}
          title={quiz.is_public ? "Каталогта бәріне көрінеді. Жасыру үшін басыңыз" : "Тек сізге көрінеді. Каталогқа шығару үшін басыңыз"}
          onClick={onTogglePrivacy}
          disabled={busy}
          className="relative z-10 inline-flex shrink-0 items-center gap-2 rounded-xl px-2 py-2 text-xs font-bold transition-colors hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <span className={`hidden w-9 text-right sm:inline ${quiz.is_public ? "text-emerald-700" : "text-amber-700"}`}>
            {quiz.is_public ? "Ашық" : "Жеке"}
          </span>
          <span aria-hidden className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${quiz.is_public ? "bg-emerald-500" : "bg-slate-300"}`}>
            <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${quiz.is_public ? "translate-x-4" : ""}`} />
          </span>
        </button>
      )}

      {!selection && (quiz.can_manage || canFork) && (
        <div data-quiz-menu className={`relative shrink-0 ${menuOpen ? "z-20" : "z-10"}`}>
          <button
            type="button"
            onClick={onToggleMenu}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`«${quiz.title}» әрекеттері`}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${menuOpen ? "bg-slate-200/70 text-slate-700" : ""}`}
          >
            <Icon name={busy ? "loader" : "more"} className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {quiz.can_manage ? (
                <>
                  <Link role="menuitem" href={`/quizzes/${quiz.id}/edit`} className={`${MENU_ITEM} text-slate-700`}>
                    <Icon name="edit" className="h-4 w-4 text-slate-400" />
                    Өңдеу
                  </Link>
                  <button role="menuitem" type="button" onClick={onDelete} className={`${MENU_ITEM} border-t border-slate-100 text-red-600 hover:bg-red-50`}>
                    <Icon name="trash" className="h-4 w-4" />
                    Өшіру
                  </button>
                </>
              ) : (
                <button role="menuitem" type="button" onClick={onFork} className={`${MENU_ITEM} text-slate-700`}>
                  <Icon name="copy" className="h-4 w-4 text-slate-400" />
                  Өзіме көшіріп алу
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
