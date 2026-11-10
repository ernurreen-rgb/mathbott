"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import TaskStatement from "@/components/student/TaskStatement";
import StudentChoiceAnswerFields from "@/components/student/StudentChoiceAnswerFields";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import StudentWrittenAnswerFields from "@/components/student/StudentWrittenAnswerFields";
import { apiPath, getMiniLessonReview, submitMiniLessonReviewAnswer } from "@/lib/api";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { consumeReviewOpenedFromLesson } from "@/lib/module-review-navigation";
import { getTaskMcqCorrectCount, isMcqAnswerComplete, parseMcqAnswerLabels } from "@/lib/question-options";
import { isSelectAnswerComplete } from "@/lib/trial-test-answer";
import { isWrittenAnswerComplete, parseWrittenAnswerSlots } from "@/lib/written-answer";
import type { LessonTask, MiniLessonReview, MiniLessonReviewAnswerResult, MiniLessonReviewTask } from "@/types";

const toLessonTask = (task: MiniLessonReviewTask): LessonTask => ({
  id: task.bank_task_id,
  text: task.text,
  question_type: task.question_type,
  answer_mode: task.answer_mode,
  correct_count: task.correct_count,
  text_scale: task.text_scale,
  options: task.options,
  subquestions: task.subquestions,
  image_filename: task.image_filename,
  sort_order: 0,
});

/** Readable form of the graded answer: option texts for choices, slots for written answers. */
function correctAnswerParts(task: LessonTask, raw: string): string[] {
  if (task.question_type === "tf") return [raw === "false" ? "\\text{Жалған}" : "\\text{Дұрыс}"];
  if ((task.question_type === "mcq" || task.question_type === "mcq6") && getTaskAnswerMode(task) === "choices") {
    return parseMcqAnswerLabels(raw).map((label) => task.options?.find((option) => option.label.toUpperCase() === label)?.text || label);
  }
  if (task.question_type === "select" && getTaskAnswerMode(task) === "choices") {
    try {
      const labels: unknown = JSON.parse(raw);
      if (Array.isArray(labels)) return labels.map((label, index) => `${index + 1}\\to ${String(label)}`);
    } catch { /* Fall through to the raw answer. */ }
  }
  const count = task.question_type === "select" ? 2 : task.question_type === "mcq" || task.question_type === "mcq6" ? getTaskMcqCorrectCount(task) : 1;
  const slots = parseWrittenAnswerSlots(raw, count).filter(Boolean);
  return slots.length ? slots : [raw];
}

function AnswerControls({ task, value, onChange, result, checking, onSubmit }: {
  task: LessonTask; value: string; onChange: (value: string) => void;
  result: MiniLessonReviewAnswerResult | null; checking: boolean; onSubmit: (value: string) => void;
}) {
  const locked = !!result;
  // A wrong answer reveals the key, so choices are coloured like in the lesson.
  const correctAnswer = result ? result.correct_answer ?? value : undefined;
  const submitButton = (ready: boolean) => !locked && (
    <button type="button" onClick={() => onSubmit(value)} disabled={checking || !ready}
      className="self-stretch sm:self-end bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 px-6 rounded-lg">
      {checking ? "Тексерілуде..." : "Тексеру"}
    </button>
  );

  if (task.question_type === "tf") {
    return <div className="flex gap-2" role="group" aria-label="Жауап таңдау">
      {[{ value: "true", label: "Дұрыс", color: "bg-green-600 hover:bg-green-700" }, { value: "false", label: "Жалған", color: "bg-red-600 hover:bg-red-700" }].map((choice) => {
        const selected = value === choice.value;
        const style = !result ? `${choice.color} text-white`
          : correctAnswer === choice.value ? (selected ? "bg-green-600 text-white ring-2 ring-green-300" : "bg-green-100 border-2 border-green-500 text-green-800")
          : selected ? "bg-red-600 text-white ring-2 ring-red-300" : "bg-gray-100 text-gray-400";
        return <button key={choice.value} type="button" disabled={checking || locked} onClick={() => { onChange(choice.value); onSubmit(choice.value); }}
          aria-pressed={selected} className={`flex-1 font-bold py-2 px-3 rounded-lg disabled:cursor-default ${style}`}>
          {choice.label}
        </button>;
      })}
    </div>;
  }

  const choices = getTaskAnswerMode(task) === "choices";
  if (task.question_type === "select" || task.question_type === "mcq" || task.question_type === "mcq6") {
    const isSelect = task.question_type === "select";
    const count = isSelect ? 2 : getTaskMcqCorrectCount(task);
    const ready = choices
      ? (isSelect ? isSelectAnswerComplete(value) : isMcqAnswerComplete(value, count))
      : isWrittenAnswerComplete(value, count);
    return <div className="flex flex-col gap-3">
      {choices
        ? <StudentChoiceAnswerFields task={task} value={value} onChange={onChange} disabled={locked}
          isAnswered={locked} isCorrect={!!result?.correct} correctAnswer={correctAnswer} selectedAnswer={value} />
        : <>
          {!isSelect && count > 1 && <p className="text-sm text-gray-600">{count} жауап жазыңыз</p>}
          <StudentWrittenAnswerFields value={value} onChange={onChange} count={count} disabled={locked}
            labels={isSelect ? [0, 1].map((index) => `${String.fromCharCode(65 + index)}) ${task.subquestions?.[index]?.text || `Қосымша сұрақ ${index + 1}`}`) : []} />
        </>}
      {submitButton(ready)}
    </div>;
  }

  return <div className="flex flex-col gap-3">
    <StudentMathAnswerInput value={value} onChange={onChange} disabled={locked} placeholder="Жауапты жазыңыз" />
    {submitButton(!!value.trim())}
  </div>;
}

export default function MiniLessonReviewPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const lessonId = Number(params.id);
  const miniLessonId = Number(params.miniId);
  const email = session?.user?.email || null;

  const [review, setReview] = useState<MiniLessonReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<MiniLessonReviewAnswerResult | null>(null);

  const load = useCallback(async () => {
    if (!email || !miniLessonId) return;
    setLoading(true); setError(null);
    const { data, error: err } = await getMiniLessonReview(miniLessonId, email);
    setReview(data); setError(err); setAnswer(""); setResult(null); setLoading(false);
  }, [email, miniLessonId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (value: string) => {
    const current = review?.current;
    if (!email || !current || checking || result) return;
    setChecking(true); setError(null);
    const { data, error: err } = await submitMiniLessonReviewAnswer(
      miniLessonId, { task_id: current.task_id, bank_task_id: current.task.bank_task_id, answer: value }, email,
    );
    if (data) { setResult(data); setReview((previous) => previous && { ...previous, summary: data.summary }); }
    else setError(err || "Жауапты тексеру мүмкін болмады.");
    setChecking(false);
  };

  const backHref = `/lessons/${review?.lesson_id ?? lessonId}`;
  // Opened from the lesson: step back. Opened directly: replace, so the review never sits between two lesson visits.
  const returnToLesson = () => {
    if (consumeReviewOpenedFromLesson(window.location.pathname)) router.back();
    else router.replace(backHref);
  };
  const shell = (children: ReactNode) => <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
    <div className="absolute inset-0 bg-black/5" />
    <DesktopNav />
    <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
      <div className="w-full max-w-4xl space-y-6">{children}</div>
    </main>
    <MobileNav currentPage="modules" />
  </div>;

  if (status !== "loading" && !session) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-xl">Сабақтарға қолжетімділік үшін кіріңіз</div></div>;
  }
  if (loading && !review) return shell(<><SkeletonLoader variant="card" /><SkeletonLoader variant="card" /></>);

  const summary = review?.summary;
  const current = review?.current;
  const task = current ? toLessonTask(current.task) : null;
  const done = summary ? summary.resolved + summary.weak : 0;

  return shell(<>
    <section className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
      <button type="button" onClick={returnToLesson} className="text-gray-700 hover:text-gray-900 inline-flex items-center gap-1.5"><Icon name="arrowLeft" /> Сабаққа оралу</button>
      <h1 className="mt-4 text-2xl font-extrabold text-gray-900">Қателерді талдау</h1>
      <p className="mt-1 text-sm text-gray-700">Бірінші әрекетте қате кеткен есептерге ұқсас, сандары өзгерген есептерді шығарыңыз. Бұл сабақ прогресіне әсер етпейді.</p>
      {summary && summary.mistakes > 0 && <>
        <div className="mt-4 h-2 rounded-full bg-white/60 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={summary.mistakes} aria-valuenow={done} aria-label="Талдау барысы">
          <div className="h-2 rounded-full bg-purple-600 transition-all" style={{ width: `${(done / summary.mistakes) * 100}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">Түзетілді: {summary.resolved}</span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Әлсіз тұс: {summary.weak}</span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-gray-700">Қалды: {summary.pending}</span>
        </div>
      </>}
    </section>

    {error && <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-800">
      {error} <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">Қайта жүктеу</button>
    </div>}

    {current && task ? <section className="glass rounded-3xl shadow-2xl p-6 border border-white/30 space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-700">
        <span>Қате {current.position} / {summary?.mistakes ?? current.position}{current.attempt > 1 ? ` · ${current.attempt}-әрекет` : ""}</span>
        <span className={`rounded-full px-3 py-1 font-semibold ${current.kind === "twin" ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-700"}`}>
          {current.kind === "twin" ? "Ұқсас есеп · сандары өзгертілген" : "Сол есеп · ұқсас нұсқасы әлі жоқ"}
        </span>
      </div>
      <div className="bg-white/70 rounded-2xl p-4 border border-white/40 space-y-4">
        <TaskStatement task={task} />
        <AnswerControls key={`${current.task_id}-${task.id}`} task={task} value={answer} onChange={setAnswer}
          result={result} checking={checking} onSubmit={(value) => void submit(value)} />
      </div>

      {result && (result.correct
        ? <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-green-800">
          <p className="font-semibold"><Icon name="checkCircle" className="mr-1.5" />Дұрыс! Бұл қате түзетілді.</p>
        </div>
        : <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800 space-y-3">
          <p className="font-semibold"><Icon name="closeCircle" className="mr-1.5" />Қате.</p>
          {result.correct_answer && <p>Дұрыс жауап: {correctAnswerParts(task, result.correct_answer).map((part, index) => (
            <span key={index} className="ml-2 inline-block font-semibold"><MathRender inline latex={part} /></span>
          ))}</p>}
          {result.solution_filename && <Image src={apiPath(`images/${result.solution_filename}`)} alt="Шешуі" width={1280} height={720} unoptimized
            className="max-h-80 w-auto max-w-full rounded-lg border border-red-200 bg-white object-contain" />}
          <p className="text-sm">{result.has_next_twin
            ? "Шешуін қарап шығып, тағы бір ұқсас есепті шығарып көріңіз."
            : "Бұл есеп әлсіз тұстар тізіміне қосылды. Сабақ түсіндірмесін қайта қарап шығыңыз."}</p>
        </div>)}

      {result && <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-5 rounded-lg inline-flex items-center gap-1.5">
          {!result.correct && result.has_next_twin ? "Тағы бір ұқсас есеп" : result.summary.pending > 0 ? "Келесі қате" : "Нәтижені көру"} <Icon name="arrowRight" />
        </button>
      </div>}
    </section>
    : review && <section className="glass rounded-3xl shadow-2xl p-6 border border-white/30 text-center space-y-3">
      {review.summary.mistakes === 0
        ? <p className="text-gray-700">Бұл мини-сабақта талдайтын қате жоқ. Талдау мини-сабақтың есептері шешілгеннен кейін ашылады.</p>
        : <>
          <div className="text-5xl"><Icon name="sparkles" /></div>
          <h2 className="text-xl font-extrabold text-gray-900">Талдау аяқталды!</h2>
          <p className="text-gray-700">Түзетілген қателер: {review.summary.resolved} / {review.summary.mistakes}</p>
          {review.summary.weak > 0 && <p className="text-amber-800">Әлсіз тұстар: {review.summary.weak} есеп. Сабақ түсіндірмесін қайта қарап, кейін тағы жаттығыңыз.</p>}
        </>}
      <button type="button" onClick={returnToLesson} className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-5 rounded-lg">Сабаққа оралу <Icon name="arrowRight" /></button>
    </section>}
  </>);
}
