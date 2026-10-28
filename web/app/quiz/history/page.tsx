"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { getQuizProgress, getUserQuizHistory } from "@/lib/api/quizzes";
import { listQuizPlayers, saveQuizPlayer } from "@/lib/quiz-player-storage";
import { QUIZ_RESULTS_LINKED, syncGuestQuizResults } from "@/lib/quiz-guest-sync";
import type { QuizPlayerCredentials } from "@/types/quiz";

type HistoryItem = { sessionId: number; participantId: number; title: string; score: number; correct: number; total: number; finished: boolean; pin?: string; player?: QuizPlayerCredentials; localOnly?: boolean };

export default function QuizHistoryPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email?.toLowerCase();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener(QUIZ_RESULTS_LINKED, refresh);
    return () => window.removeEventListener(QUIZ_RESULTS_LINKED, refresh);
  }, [refresh]);
  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    setLoading(true); setItems([]); setError(null);
    void (async () => {
      const merged = new Map<string, HistoryItem>();
      let issue = false;
      if (email) {
        await syncGuestQuizResults(email);
        const history = await getUserQuizHistory(email);
        if (history.error) issue = true;
        for (const item of history.data || []) merged.set(`${item.session_id}:${item.participant_id}`, {
          sessionId: item.session_id, participantId: item.participant_id, title: item.quiz_title,
          score: item.score, correct: item.correct_count, total: item.question_count,
          finished: !!item.is_finished || item.session_status === "finished", pin: item.pin_code,
        });
      }
      for (const player of listQuizPlayers()) {
        if (player.accountEmail && player.accountEmail.toLowerCase() !== email) continue;
        const key = `${player.sessionId}:${player.participantId}`;
        const saved = merged.get(key);
        if (saved) { saved.player = player; continue; }
        const response = await getQuizProgress(player.sessionId, { participantToken: player.token });
        if (!response.data) { issue = true; continue; }
        const progress = response.data;
        merged.set(key, { sessionId: player.sessionId, participantId: player.participantId,
          title: progress.session?.quiz_title || `Квиз #${player.sessionId}`,
          score: progress.participant.score, correct: progress.participant.correct_count, total: progress.question_count,
          finished: !!progress.participant.is_finished || progress.status === "finished", player, localOnly: !player.accountEmail });
      }
      if (!active) return;
      setItems([...merged.values()].sort((a, b) => b.sessionId - a.sessionId));
      if (issue) setError("Кейбір нәтижелер жүктелмеді. Байланыс қалпына келгенде қайта жүктеңіз; сақталған ойын кілттері өшірілмейді.");
      setLoading(false);
    })().catch(() => { if (active) { setError("Нәтижелерді жүктеу мүмкін болмады"); setLoading(false); } });
    return () => { active = false; };
  }, [email, status, reload]);

  return <main className="min-h-screen bg-slate-50 p-4 text-gray-900 sm:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <Link href="/quizzes" className="text-sm font-semibold text-purple-700">← Квиздер</Link>
    <h1 className="text-2xl font-bold">Менің ойындарым</h1>
    {!email && <div className="rounded-xl border border-purple-100 bg-white p-5 text-sm">
      <p>Тіркелмей ойнауға болады. Нәтижелер осы браузерде қолжетімді. Басқа құрылғыдан да көру үшін осы жерден аккаунтқа кіріңіз. Оған дейін браузер деректерін тазаламаңыз.</p>
      <button onClick={() => void signIn("google", { callbackUrl: "/quiz/history" })} className="mt-3 font-semibold text-purple-700">Аккаунтқа кіріп, нәтижелерді сақтау</button>
    </div>}
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{error}</p><button onClick={refresh} className="mt-2 font-bold">Қайта жүктеу</button></div>}
    {loading ? <p role="status">Ойындар жүктелуде...</p> : items.length === 0 ? <p>Сақталған ойындар әзірге жоқ. PIN-кодпен қосылып ойнай аласыз.</p> :
      items.map((item) => <article key={`${item.sessionId}:${item.participantId}`} className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">{item.title}</h2>
        <p className="mt-2 text-sm text-gray-600">{item.score} ұпай · Дұрыс: {item.correct} / {item.total} · {item.finished ? "Аяқталды" : "Ойын жалғасуда"}</p>
        {email && item.localOnly && <div className="mt-2 text-sm text-amber-800">Бұл нәтиже әлі аккаунтқа қосылмады, осы браузерде қолжетімді. <button onClick={refresh} className="font-bold underline">Қайта байланыстыру</button></div>}
        <Link onClick={() => { if (item.player && !item.finished) saveQuizPlayer(item.player); }}
          href={item.finished ? `/quiz/review/${item.sessionId}?participant=${item.participantId}` : item.player ? `/quiz/play/${item.sessionId}` : `/join?pin=${item.pin || ""}`}
          className="mt-3 inline-block font-semibold text-purple-700">{item.finished ? "Талдау және қателермен жұмыс" : "Ойынға оралу"}</Link>
      </article>)}
    <Link href="/join" className="inline-block rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white">PIN-кодпен қосылу</Link>
  </div></main>;
}
