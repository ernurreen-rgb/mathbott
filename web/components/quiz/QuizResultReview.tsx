"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MathRender from "@/components/ui/MathRender";
import MathFieldInput from "@/components/ui/MathFieldInput";
import TaskStatement from "@/components/student/TaskStatement";
import { checkQuizPracticeAnswer, getQuizReview } from "@/lib/api/quizzes";
import { readQuizPlayer } from "@/lib/quiz-player-storage";
import type { QuizAuth, QuizPracticeResult, QuizQuestion, QuizReview } from "@/types/quiz";

function answerText(question: QuizQuestion, answer: string) {
  if (!answer || answer === "__timeout__") return "Жауап берілмеді";
  if (question.question_type === "input") return answer;
  return answer.split(",").map((id) => question.options.find((option) => option.id === id)?.text || id).join("; ");
}

export default function QuizResultReview({ sessionId, participantId }: { sessionId: number; participantId: number }) {
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
    if (!current || !answer.trim() || checking) return;
    setChecking(true); setError(null);
    try {
      const response = await checkQuizPracticeAnswer(sessionId, participantId, current.question.id, answer, auth);
      if (response.error || !response.data) { setError(response.error || "Жауап тексерілмеді. Қайта көріңіз."); return; }
      setResult(response.data);
      if (response.data.is_correct) setSolved((previous) => new Set([...previous, current.question.id]));
    } finally { setChecking(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-gray-900 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/quiz/history" className="text-sm font-semibold text-purple-700">← Менің ойындарым</Link>
        <h1 className="text-2xl font-bold">Қателермен жұмыс</h1>
        {loading ? <p role="status">Нәтижелер жүктелуде...</p> : error && !review ? (
          <div role="alert" className="rounded-xl border bg-white p-5">
            <p>Нәтижені ашу мүмкін болмады. Осы ойынды ойнаған браузерді қолданыңыз немесе өз аккаунтыңызға кіріңіз.</p>
            <button onClick={() => setReload((value) => value + 1)} className="mt-3 font-semibold text-purple-700">Қайта жүктеу</button>
          </div>
        ) : review && <>
          <div className="rounded-2xl border bg-white p-5">
            <h2 className="text-lg font-bold">{review.quiz_title}</h2>
            <p className="mt-2 text-sm text-gray-600">{review.participant.nickname} · {review.participant.score} ұпай · {mistakes.length} қате немесе жауапсыз сұрақ</p>
            <p className="mt-1 text-sm text-gray-500">Жаттығу бастапқы нәтиже мен рейтингті өзгертпейді.</p>
            {!practicing && mistakes.length > 0 && <button className="mt-4 rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white"
              onClick={() => { setIndex(0); resetAnswer(); setPracticing(true); }}>Қателерді қайта орындау</button>}
            {mistakes.length === 0 && <p className="mt-3 font-semibold text-green-700">Барлық сұраққа дұрыс жауап бердіңіз!</p>}
          </div>
          {practicing && current ? <section className="space-y-5 rounded-2xl border bg-white p-5 sm:p-8" aria-label="Қайталау тапсырмасы">
            <p className="text-sm text-gray-500">Сұрақ {index + 1} / {mistakes.length} · Осы жаттығуда түзетілді: {solved.size}</p>
            <TaskStatement task={{ text: current.question.question_text, image_filename: current.question.image_filename, text_scale: "md" }} />
            {current.question.question_type === "input" ? <MathFieldInput key={current.question.id} ariaLabel="Қайталау жауабы" value={answer}
              onChange={setAnswer} defaultMode="math" smartMode={false} readOnly={checking || !!result?.is_correct} /> :
              <div className="grid gap-2">{current.question.options.map((option) => {
                const selected = answer.split(",").includes(option.id);
                return <button key={option.id} aria-pressed={selected} disabled={checking || !!result?.is_correct}
                  className={`rounded-lg border p-4 text-left ${selected ? "border-purple-600 bg-purple-50" : "border-gray-200"}`}
                  onClick={() => { setResult(null); setAnswer(current.question.question_type === "multi_select" ?
                    (selected ? answer.split(",").filter((id) => id !== option.id) : [...answer.split(",").filter(Boolean), option.id]).sort().join(",") : option.id); }}>
                  <span className="mr-2 font-bold">{option.id}</span><MathRender inline latex={option.text} />
                </button>;
              })}</div>}
            {error && <p role="alert" className="text-red-700">{error}</p>}
            {result && <div role="status" className={`rounded-lg p-4 ${result.is_correct ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
              <p className="font-semibold">{result.is_correct ? "Дұрыс!" : "Қайта байқап көріңіз"}</p>
              <div className="mt-2">Дұрыс жауап: <MathRender inline latex={answerText(current.question, result.correct_answer)} /></div>
              {result.explanation && <div className="mt-2"><MathRender latex={result.explanation} /></div>}
            </div>}
            <div className="flex flex-wrap gap-3">
              {!result?.is_correct && <button disabled={checking || !answer.trim()} onClick={() => void check()}
                className="rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{checking ? "Тексерілуде..." : "Тексеру"}</button>}
              {index < mistakes.length - 1 ? <button disabled={checking} onClick={() => { setIndex(index + 1); resetAnswer(); }} className="rounded-lg border px-4 py-2">Келесі сұрақ</button> :
                <button disabled={checking} onClick={() => setPracticing(false)} className="rounded-lg border px-4 py-2">Талдауға оралу</button>}
            </div>
          </section> : review.items.map((item, itemIndex) => <article key={item.question.id} className="space-y-3 rounded-xl border bg-white p-5">
            <p className={`text-sm font-bold ${item.is_correct ? "text-green-700" : "text-red-700"}`}>Сұрақ {itemIndex + 1} · {item.is_correct ? "Дұрыс" : "Қате / жауап берілмеді"}</p>
            <TaskStatement task={{ text: item.question.question_text, image_filename: item.question.image_filename, text_scale: "md" }} />
            <div className="text-sm text-gray-600">Сіздің жауабыңыз: <MathRender inline latex={answerText(item.question, item.user_answer)} /></div>
            {!item.is_correct && <div className="text-sm text-green-800">Дұрыс жауап: <MathRender inline latex={answerText(item.question, item.question.correct_answer || "")} /></div>}
            {item.question.explanation && <div className="border-t pt-3 text-sm"><MathRender latex={item.question.explanation} /></div>}
          </article>)}
        </>}
      </div>
    </main>
  );
}
