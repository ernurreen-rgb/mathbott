"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MathRender from "@/components/ui/MathRender";
import StudentMathAnswerInput from "@/components/student/StudentMathAnswerInput";
import TaskStatement from "@/components/student/TaskStatement";
import { hasEmptyMcqOptionTexts } from "@/lib/comparison-task";
import { checkQuizPracticeAnswer, getQuizReview } from "@/lib/api/quizzes";
import { readQuizPlayer } from "@/lib/quiz-player-storage";
import type { QuizAuth, QuizPracticeResult, QuizQuestion, QuizReview } from "@/types/quiz";
import { useI18n } from "@/lib/i18n/provider";
import { tr, type Translate } from "@/lib/i18n/translate";

function answerText(question: QuizQuestion, answer: string, t: Translate) {
  if (!answer || answer === "__timeout__") return t("review.noAnswer");
  if (question.question_type === "input") return answer;
  const options = Array.isArray(question.options) ? question.options : [];
  return answer
    .split(",")
    .map((id) => options.find((option) => option.id === id)?.text?.trim() || id)
    .join("; ");
}

export default function QuizResultReview({ sessionId, participantId }: { sessionId: number; participantId: number }) {
  const { t } = useI18n();
  const { data: session, status } = useSession();
  const email = session?.user?.email || undefined;
  const [review, setReview] = useState<QuizReview | null>(null);
  const [auth, setAuth] = useState<QuizAuth>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [practicing, setPracticing] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<QuizPracticeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const [solved, setSolved] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    setLoading(true); setError(null); setReview(null);
    setPracticing(false); setSolved(new Set());
    const nextAuth = { email, participantToken: readQuizPlayer(sessionId, participantId)?.token };
    setAuth(nextAuth);
    void getQuizReview(sessionId, participantId, nextAuth).then((response) => {
      if (!active) return;
      setReview(response.data);
      setError(response.error);
      setLoading(false);
    });
    return () => { active = false; };
  }, [sessionId, participantId, email, status, reload]);

  const mistakes = review?.items.filter((item) => !item.is_correct) || [];
  const current = mistakes[index];
  const resetAnswer = () => { setAnswer(""); setResult(null); setError(null); };
  const check = async () => {
    if (!current || !answer.trim() || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true); setError(null);
    try {
      const response = await checkQuizPracticeAnswer(sessionId, participantId, current.question.id, answer, auth);
      if (response.error || !response.data) { setError(response.error || tr("review.checkFailed")); return; }
      setResult(response.data);
      if (response.data.is_correct) setSolved((previous) => new Set([...previous, current.question.id]));
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-gray-900 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/quiz/history" className="text-sm font-semibold text-purple-700">← {t("history.title")}</Link>
        <h1 className="text-2xl font-bold">{t("quizPlay.mistakesReview")}</h1>
        {loading ? <p role="status">{t("review.loading")}</p> : error && !review ? (
          <div role="alert" className="rounded-xl border bg-white p-5">
            <p>{t("review.openFailed")}</p>
            <button onClick={() => setReload((value) => value + 1)} className="mt-3 font-semibold text-purple-700">{t("quizPlay.reload")}</button>
          </div>
        ) : review && <>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">{review.quiz_title}</h2>
            <p className="mt-2 text-sm text-gray-600">{review.participant.nickname} · {t("host.points", { count: review.participant.score })} · {t("review.mistakesCount", { count: mistakes.length })}</p>
            <p className="mt-1 text-sm text-gray-500">{t("review.practiceNote")}</p>
            {!practicing && mistakes.length > 0 && <button className="mt-4 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white"
              onClick={() => { setIndex(0); resetAnswer(); setPracticing(true); }}>{t("review.redoMistakes")}</button>}
            {mistakes.length === 0 && <p className="mt-3 font-semibold text-green-700">{t("review.allCorrect")}</p>}
          </div>
          {practicing && current ? <section className="space-y-5 rounded-2xl border bg-white p-5 sm:p-8" aria-label={t("review.practiceAria")}>
            <p className="text-sm text-gray-500">{t("quizPlay.questionOf", { n: index + 1, total: mistakes.length })} · {t("review.fixedInPractice", { count: solved.size })}</p>
            <TaskStatement task={{ text: current.question.question_text, image_filename: current.question.image_filename, text_scale: "md" }} />
            {current.question.question_type === "input" ? <StudentMathAnswerInput key={current.question.id} ariaLabel={t("review.practiceAnswerAria")} value={answer}
              onChange={setAnswer} disabled={checking || !!result?.is_correct} /> : (() => {
              const quizOptions = Array.isArray(current.question.options) ? current.question.options : [];
              const labelOnly = hasEmptyMcqOptionTexts(quizOptions);
              return <div className={labelOnly ? "grid grid-cols-2 sm:grid-cols-4 gap-2" : "grid gap-2"}>{quizOptions.map((option) => {
                const selected = answer.split(",").includes(option.id);
                return <button key={option.id} aria-pressed={selected} disabled={checking || !!result?.is_correct}
                  className={`rounded-lg border p-4 ${labelOnly ? "text-center font-bold text-lg" : "text-left"} ${selected ? "border-purple-600 bg-purple-50" : "border-gray-200"}`}
                  onClick={() => { setResult(null); setAnswer(current.question.question_type === "multi_select" ?
                    (selected ? answer.split(",").filter((id) => id !== option.id) : [...answer.split(",").filter(Boolean), option.id]).sort().join(",") : option.id); }}>
                  {labelOnly ? <span>{option.id}</span> : <><span className="mr-2 font-bold">{option.id}</span><MathRender inline latex={option.text} /></>}
                </button>;
              })}</div>;
            })()}
            {error && <p role="alert" className="text-red-700">{error}</p>}
            {result && <div role="status" className={`rounded-lg p-4 ${result.is_correct ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
              <p className="font-semibold">{result.is_correct ? t("review.correct") : t("review.tryAgain")}</p>
              <div className="mt-2">{t("quizPlay.correctAnswerLabel")} <MathRender inline latex={answerText(current.question, result.correct_answer, t)} /></div>
              {result.explanation && <div className="mt-2"><MathRender latex={result.explanation} /></div>}
            </div>}
            <div className="flex flex-wrap gap-3">
              {!result?.is_correct && <button disabled={checking || !answer.trim()} onClick={() => void check()}
                className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{checking ? t("review.checking") : t("review.check")}</button>}
              {index < mistakes.length - 1 ? <button disabled={checking} onClick={() => { setIndex(index + 1); resetAnswer(); }} className="rounded-lg border px-4 py-2">{t("review.nextQuestion")}</button> :
                <button disabled={checking} onClick={() => setPracticing(false)} className="rounded-lg border px-4 py-2">{t("review.backToAnalysis")}</button>}
            </div>
          </section> : review.items.map((item, itemIndex) => <article key={item.question.id} className="space-y-3 rounded-xl border bg-white p-5">
            <p className={`text-sm font-bold ${item.is_correct ? "text-green-700" : "text-red-700"}`}>{t("review.questionN", { n: itemIndex + 1 })} · {item.is_correct ? t("review.itemCorrect") : t("review.itemWrong")}</p>
            <TaskStatement task={{ text: item.question.question_text, image_filename: item.question.image_filename, text_scale: "md" }} />
            <div className="text-sm text-gray-600">{t("review.yourAnswer")} <MathRender inline latex={answerText(item.question, item.user_answer, t)} /></div>
            {!item.is_correct && <div className="text-sm text-green-800">{t("quizPlay.correctAnswerLabel")} <MathRender inline latex={answerText(item.question, item.question.correct_answer || "", t)} /></div>}
            {item.question.explanation && <div className="border-t pt-3 text-sm"><MathRender latex={item.question.explanation} /></div>}
          </article>)}
        </>}
      </div>
    </main>
  );
}
