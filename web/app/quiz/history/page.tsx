"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { getQuizProgress, getUserQuizHistory } from "@/lib/api/quizzes";
import { listQuizPlayers, saveQuizPlayer } from "@/lib/quiz-player-storage";
import { QUIZ_RESULTS_LINKED, syncGuestQuizResults } from "@/lib/quiz-guest-sync";
import type { QuizPlayerCredentials } from "@/types/quiz";
import { useI18n } from "@/lib/i18n/provider";
import { tr } from "@/lib/i18n/translate";

type HistoryItem = { sessionId: number; participantId: number; title: string; score: number; correct: number; total: number; finished: boolean; pin?: string; player?: QuizPlayerCredentials; localOnly?: boolean };

export default function QuizHistoryPage() {
  const { data: session, status } = useSession();
  const { t } = useI18n();
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
      const pendingPlayers: QuizPlayerCredentials[] = [];
      for (const player of listQuizPlayers()) {
        if (player.accountEmail && player.accountEmail.toLowerCase() !== email) continue;
        const key = `${player.sessionId}:${player.participantId}`;
        const saved = merged.get(key);
        if (saved) { saved.player = player; continue; }
        pendingPlayers.push(player);
      }
      const fetched = await Promise.all(
        pendingPlayers.map(async (player) => ({
          player,
          response: await getQuizProgress(player.sessionId, { participantToken: player.token }),
        }))
      );
      for (const { player, response } of fetched) {
        if (!response.data) {
          // Ignore 404/401 for deleted or expired sessions instead of showing a permanent error banner.
          if (response.status !== 404 && response.status !== 401 && response.status !== 403) {
            issue = true;
          }
          continue;
        }
        const progress = response.data;
        const key = `${player.sessionId}:${player.participantId}`;
        merged.set(key, { sessionId: player.sessionId, participantId: player.participantId,
          title: progress.session?.quiz_title || tr("history.quizNumber", { id: player.sessionId }),
          score: progress.participant.score, correct: progress.participant.correct_count, total: progress.question_count,
          finished: !!progress.participant.is_finished || progress.status === "finished", player, localOnly: !player.accountEmail });
      }
      if (!active) return;
      setItems([...merged.values()].sort((a, b) => b.sessionId - a.sessionId));
      if (issue) setError(tr("history.someFailed"));
      setLoading(false);
    })().catch(() => { if (active) { setError(tr("history.loadFailed")); setLoading(false); } });
    return () => { active = false; };
  }, [email, status, reload]);

  return <main className="min-h-screen bg-slate-50 p-4 text-gray-900 sm:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <Link href="/quizzes" className="text-sm font-semibold text-purple-700">← {t("nav.quizzes")}</Link>
    <h1 className="text-2xl font-bold">{t("history.title")}</h1>
    {!email && <div className="rounded-xl border border-purple-100 bg-white p-5 text-sm">
      <p>{t("history.guestNote")}</p>
      <button onClick={() => void signIn("google", { callbackUrl: "/quiz/history" })} className="mt-3 font-semibold text-purple-700">{t("history.signInToSave")}</button>
    </div>}
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{error}</p><button onClick={refresh} className="mt-2 font-bold">{t("quizPlay.reload")}</button></div>}
    {loading ? <p role="status">{t("history.loading")}</p> : items.length === 0 ? <p>{t("history.empty")}</p> :
      items.map((item) => <article key={`${item.sessionId}:${item.participantId}`} className="rounded-xl border bg-white p-5">
        <h2 className="font-bold">{item.title}</h2>
        <p className="mt-2 text-sm text-gray-600">{t("history.itemSummary", { count: item.score, correct: item.correct, total: item.total })} · {item.finished ? t("history.finished") : t("history.inProgress")}</p>
        {email && item.localOnly && <div className="mt-2 text-sm text-amber-800">{t("history.localOnly")} <button onClick={refresh} className="font-bold underline">{t("history.relink")}</button></div>}
        <Link onClick={() => { if (item.player && !item.finished) saveQuizPlayer(item.player); }}
          href={item.finished ? `/quiz/review/${item.sessionId}?participant=${item.participantId}` : item.player ? `/quiz/play/${item.sessionId}` : `/join?pin=${item.pin || ""}`}
          className="mt-3 inline-block font-semibold text-purple-700">{item.finished ? t("history.review") : t("history.backToGame")}</Link>
      </article>)}
    <Link href="/join" className="inline-block rounded-lg bg-purple-600 px-4 py-2 font-semibold text-white">{t("history.joinByPin")}</Link>
  </div></main>;
}
