"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import QRCode from "react-qr-code";
import {
  getQuizSession,
  startQuizSession,
  finishQuizSession,
  getQuizLeaderboard,
  getQuizSessionStats,
} from "@/lib/api/quizzes";
import { resolveWebSocketBase } from "@/lib/websocket-url";
import { QuizSession, QuizParticipant, QuizSessionStats } from "@/types/quiz";
import MathRender from "@/components/ui/MathRender";
import toast from "react-hot-toast";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function HostQuizPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = parseInt(resolvedParams.sessionId, 10);
  const router = useRouter();
  const { data: session } = useSession();

  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [stats, setStats] = useState<QuizSessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"podium" | "questions">("podium");

  const socketRef = useRef<WebSocket | null>(null);

  // Set Join URL on mount
  useEffect(() => {
    if (typeof window !== "undefined" && quizSession?.pin_code) {
      setJoinUrl(`${window.location.origin}/join?pin=${quizSession.pin_code}`);
    }
  }, [quizSession?.pin_code]);

  // Initial load
  useEffect(() => {
    if (!sessionId) return;

    const fetchSession = async () => {
      setLoading(true);
      try {
        const { data, error } = await getQuizSession(sessionId);
        if (error || !data) {
          toast.error("Сессия табылмады");
          return;
        }
        setQuizSession(data);
        if (data.participants) {
          setParticipants(data.participants);
        }

        if (data.status === "finished") {
          const statsRes = await getQuizSessionStats(sessionId);
          if (statsRes.data) {
            setStats(statsRes.data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // WebSocket Connection
  useEffect(() => {
    if (!sessionId) return;
    const wsBase = resolveWebSocketBase();
    if (!wsBase) return;

    const wsUrl = `${wsBase}/ws/quiz/${sessionId}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "participant_joined") {
          setParticipants((prev) => {
            const exists = prev.some((p) => p.id === msg.participant.id);
            if (exists) return prev;
            return [...prev, msg.participant];
          });
        } else if (msg.type === "game_started") {
          setQuizSession((prev) => (prev ? { ...prev, status: "in_progress" } : null));
        } else if (msg.type === "answer_submitted") {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === msg.participant_id
                ? {
                    ...p,
                    score: msg.score,
                    streak: msg.streak,
                    total_answered: p.total_answered + 1,
                    correct_count: msg.is_correct ? p.correct_count + 1 : p.correct_count,
                  }
                : p
            )
          );
        } else if (msg.type === "participant_finished") {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === msg.participant_id ? { ...p, is_finished: true } : p
            )
          );
        } else if (msg.type === "game_finished") {
          setQuizSession((prev) => (prev ? { ...prev, status: "finished" } : null));
          if (msg.stats) {
            setStats(msg.stats);
          }
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    };

    // Heartbeat ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [sessionId]);

  // Polling fallback when in_progress to keep scores strictly accurate
  useEffect(() => {
    if (!sessionId || quizSession?.status !== "in_progress") return;

    const interval = setInterval(async () => {
      const res = await getQuizLeaderboard(sessionId);
      if (res.data) {
        setParticipants(res.data);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [sessionId, quizSession?.status]);

  const handleStartGame = async () => {
    if (participants.length === 0) {
      if (!confirm("Ойыншылар әлі қосылмады. Бәрібір ойынды бастайсыз ба?")) return;
    }
    setActionLoading(true);
    try {
      const email = session?.user?.email || undefined;
      const { data, error } = await startQuizSession(sessionId, email);
      if (error || !data) {
        toast.error(error || "Ойынды бастау мүмкін болмады");
        return;
      }
      setQuizSession(data);
      toast.success("Ойын басталды!");
    } catch {
      toast.error("Қате орын алды");
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinishGame = async () => {
    if (!confirm("Ойынды тоқтатып, жеңімпаздар тұғырын ашқыңыз келе ме?")) return;
    setActionLoading(true);
    try {
      const email = session?.user?.email || undefined;
      const { data, error } = await finishQuizSession(sessionId, email);
      if (error || !data) {
        toast.error(error || "Ойынды аяқтау мүмкін болмады");
        return;
      }
      setStats(data);
      setQuizSession((prev) => (prev ? { ...prev, status: "finished" } : null));
      toast.success("Ойын аяқталды! Жеңімпаздар анықталды!");
    } catch {
      toast.error("Қате орын алды");
    } finally {
      setActionLoading(false);
    }
  };

  const copyPin = () => {
    if (!quizSession) return;
    navigator.clipboard.writeText(quizSession.pin_code);
    toast.success("PIN көшірілді!");
  };

  const copyJoinLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl);
    toast.success("Сілтеме көшірілді!");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-lg">Ойын бөлмесі жүктелуде...</p>
        </div>
      </div>
    );
  }

  if (!quizSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-800 p-4">
        <div className="bg-white p-8 rounded-3xl border border-gray-200 text-center max-w-md shadow-lg">
          <h2 className="text-2xl font-bold mb-3">Сессия табылмады</h2>
          <Link
            href="/quizzes"
            className="px-6 py-2.5 bg-purple-600 text-white rounded-xl font-bold inline-block"
          >
            Квиздерге қайту
          </Link>
        </div>
      </div>
    );
  }

  // Sorted leaderboard
  const sortedLeaderboard = [...participants].sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-pink-50/50 text-gray-900 flex flex-col select-none">
      {/* Top Presentation Bar */}
      <header className="h-20 border-b border-purple-100 bg-white/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href={`/quizzes/${quizSession.quiz_id}`}
            className="p-2.5 rounded-2xl bg-gray-50 border border-gray-200 hover:border-purple-300 text-gray-600 hover:text-gray-900 transition-colors"
            title="Квизге оралу"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              <span>{quizSession.quiz_title || "Квиз ойыны"}</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  quizSession.status === "lobby"
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : quizSession.status === "in_progress"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200 animate-pulse"
                    : "bg-purple-100 text-purple-800 border border-purple-200"
                }`}
              >
                {quizSession.status === "lobby"
                  ? "Лобби (Күтуде)"
                  : quizSession.status === "in_progress"
                  ? "Ойын жүріп жатыр"
                  : "Аяқталды"}
              </span>
            </h1>
            <p className="text-xs text-gray-500">
              Қатысушылар саны: <strong className="text-gray-900 font-bold">{participants.length}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {quizSession.status === "lobby" && (
            <button
              onClick={handleStartGame}
              disabled={actionLoading}
              className="px-8 py-3.5 rounded-2xl font-black text-base bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-xl shadow-emerald-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2.5 disabled:opacity-50"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" />
              </svg>
              Ойынды бастау!
            </button>
          )}

          {quizSession.status === "in_progress" && (
            <button
              onClick={handleFinishGame}
              disabled={actionLoading}
              className="px-6 py-3 rounded-2xl font-extrabold text-sm bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-xl shadow-red-500/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Ойынды аяқтау (Finish)
            </button>
          )}

          {quizSession.status === "finished" && (
            <Link
              href="/quizzes"
              className="px-6 py-3 rounded-2xl font-bold text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 transition-all shadow-sm"
            >
              Каталогқа қайту
            </Link>
          )}
        </div>
      </header>

      {/* VIEW 1: LOBBY */}
      {quizSession.status === "lobby" && (
        <main className="flex-1 max-w-7xl mx-auto w-full p-6 flex flex-col lg:flex-row items-center gap-8 justify-center">
          {/* Join Instructions Card */}
          <div className="w-full lg:w-[460px] bg-white/95 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-xl flex flex-col items-center text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-700 mb-2">
              Телефоннан немесе планшеттен қосылыңыз
            </span>

            {/* Huge PIN Display */}
            <div
              onClick={copyPin}
              title="PIN көшіру үшін басыңыз"
              className="w-full bg-gradient-to-b from-purple-50 via-indigo-50/60 to-purple-50 border-2 border-purple-300 rounded-3xl py-6 px-4 my-4 cursor-pointer hover:border-purple-500 transition-all group shadow-sm"
            >
              <span className="text-xs font-bold text-purple-800 block mb-1">
                ОЙЫН PIN-КОДЫ
              </span>
              <div className="text-6xl sm:text-7xl font-black font-mono tracking-widest text-purple-700 group-hover:scale-105 transition-transform">
                {quizSession.pin_code}
              </div>
              <span className="text-[11px] text-purple-600 font-semibold block mt-2">
                Көшіру үшін басыңыз 📋
              </span>
            </div>

            {/* QR Code */}
            {joinUrl && (
              <div className="bg-white p-4 rounded-2xl shadow-md border-2 border-purple-100 my-2">
                <QRCode value={joinUrl} size={180} />
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Немесе браузерде ашыңыз:{" "}
              <strong className="text-purple-700 font-mono">/join</strong>
            </p>

            <button
              onClick={copyJoinLink}
              className="mt-4 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-xs font-bold text-purple-700 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Тікелей сілтемені көшіру
            </button>
          </div>

          {/* Joined Players Arena */}
          <div className="flex-1 w-full bg-white/90 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-xl flex flex-col h-[560px]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Қатысушылар алаңы</h2>
                <p className="text-xs text-gray-500">
                  Оқушылар өз құрылғылары арқылы қосылуда
                </p>
              </div>
              <div className="px-4 py-2 rounded-2xl bg-purple-50 border border-purple-200 text-purple-800 font-extrabold text-lg flex items-center gap-2 shadow-sm">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                {participants.length} адам
              </div>
            </div>

            {participants.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mb-4 animate-bounce">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">
                  Қатысушыларды күтуде...
                </h3>
                <p className="text-xs text-gray-500 max-w-xs">
                  Студенттер телефондарынан экрандағы PIN-кодты енгізген кезде, олардың есімдері осында шығады.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 content-start">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-white border border-purple-100/80 shadow-sm flex items-center gap-3 animate-fadeIn transition-transform hover:scale-105"
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-md"
                      style={{ backgroundColor: p.avatar_color || "#8b5cf6" }}
                    >
                      {p.nickname.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-sm text-gray-800 truncate">
                      {p.nickname}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* VIEW 2: IN PROGRESS (LIVE LEADERBOARD) */}
      {quizSession.status === "in_progress" && (
        <main className="flex-1 max-w-5xl mx-auto w-full p-6 flex flex-col justify-between">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-purple-100 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <span>Тікелей көшбасшылар тақтасы</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                </h2>
                <p className="text-xs text-gray-500">
                  Ұпайлар оқушылар жауап берген сайын нақты уақытта жаңарады
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs font-semibold text-gray-500 block">
                  Аяқтағандар:
                </span>
                <span className="text-sm font-extrabold text-purple-700">
                  {participants.filter((p) => p.is_finished).length} / {participants.length} оқушы
                </span>
              </div>
            </div>

            {/* Dynamic Rank List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {sortedLeaderboard.map((p, idx) => {
                const maxScore = sortedLeaderboard[0]?.score || 1;
                const percentage = Math.min(100, Math.max(8, (p.score / (maxScore || 1)) * 100));

                return (
                  <div
                    key={p.id}
                    className={`relative p-4 rounded-2xl border transition-all flex items-center justify-between overflow-hidden shadow-sm ${
                      idx === 0
                        ? "bg-amber-50/80 border-amber-300"
                        : idx === 1
                        ? "bg-slate-50 border-gray-300"
                        : idx === 2
                        ? "bg-orange-50/70 border-orange-200"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    {/* Animated Score Bar Background */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-purple-500/10 transition-all duration-500 pointer-events-none rounded-2xl"
                      style={{ width: `${percentage}%` }}
                    />

                    <div className="flex items-center gap-4 relative z-10">
                      {/* Rank badge */}
                      <span
                        className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center ${
                          idx === 0
                            ? "bg-amber-400 text-gray-900 shadow-md"
                            : idx === 1
                            ? "bg-slate-300 text-gray-900"
                            : idx === 2
                            ? "bg-orange-400 text-white"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {idx + 1}
                      </span>

                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base shadow"
                        style={{ backgroundColor: p.avatar_color || "#8b5cf6" }}
                      >
                        {p.nickname.charAt(0).toUpperCase()}
                      </div>

                      {/* Nickname & streak */}
                      <div>
                        <div className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                          <span>{p.nickname}</span>
                          {p.streak > 1 && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-orange-100 text-orange-700 border border-orange-300 flex items-center gap-1">
                              🔥 {p.streak}
                            </span>
                          )}
                          {p.is_finished && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              Аяқтады ✓
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {p.correct_count} дұрыс / {p.total_answered} жауап
                        </div>
                      </div>
                    </div>

                    {/* Points */}
                    <div className="text-right relative z-10">
                      <div className="text-2xl font-black font-mono text-purple-700">
                        {p.score.toLocaleString()}
                      </div>
                      <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500">
                        ұпай
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {/* VIEW 3: FINISHED (PODIUM & STATS) */}
      {quizSession.status === "finished" && (
        <main className="flex-1 max-w-5xl mx-auto w-full p-6 flex flex-col">
          {/* Subtabs */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={() => setActiveTab("podium")}
              className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all ${
                activeTab === "podium"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                  : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"
              }`}
            >
              🏆 Жеңімпаздар тұғыры (Podium)
            </button>
            <button
              onClick={() => setActiveTab("questions")}
              className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition-all ${
                activeTab === "questions"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                  : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"
              }`}
            >
              📊 Сұрақтар талдауы (Analytics)
            </button>
          </div>

          {activeTab === "podium" ? (
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-xl flex-1 flex flex-col justify-center items-center">
              <h2 className="text-3xl font-black text-gray-900 mb-8 text-center">
                🎉 Құттықтаймыз! Викторина аяқталды! 🎉
              </h2>

              {/* 3D Podium Graphic */}
              <div className="w-full max-w-2xl flex items-end justify-center gap-4 h-80 my-4">
                {/* 2nd Place (Silver) */}
                <div className="flex-1 flex flex-col items-center">
                  {sortedLeaderboard[1] && (
                    <div className="text-center mb-3">
                      <div
                        className="w-14 h-14 rounded-2xl mx-auto mb-2 flex items-center justify-center text-white text-xl font-black shadow-lg"
                        style={{ backgroundColor: sortedLeaderboard[1].avatar_color || "#3b82f6" }}
                      >
                        {sortedLeaderboard[1].nickname.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-extrabold text-sm text-gray-800 truncate max-w-[120px]">
                        {sortedLeaderboard[1].nickname}
                      </div>
                      <div className="text-xs font-mono font-bold text-gray-500">
                        {sortedLeaderboard[1].score} ұпай
                      </div>
                    </div>
                  )}
                  <div className="w-full h-44 rounded-t-3xl bg-gradient-to-t from-slate-300 to-slate-200 border-t-4 border-slate-400 flex flex-col items-center justify-center text-slate-800 font-black text-3xl shadow-md">
                    <span>🥈</span>
                    <span className="text-xl">2</span>
                  </div>
                </div>

                {/* 1st Place (Gold) */}
                <div className="flex-1 flex flex-col items-center">
                  {sortedLeaderboard[0] && (
                    <div className="text-center mb-3">
                      <span className="text-3xl animate-bounce block mb-1">👑</span>
                      <div
                        className="w-16 h-16 rounded-2xl mx-auto mb-2 flex items-center justify-center text-white text-2xl font-black shadow-xl ring-4 ring-amber-400"
                        style={{ backgroundColor: sortedLeaderboard[0].avatar_color || "#f59e0b" }}
                      >
                        {sortedLeaderboard[0].nickname.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-black text-base text-gray-900 truncate max-w-[140px]">
                        {sortedLeaderboard[0].nickname}
                      </div>
                      <div className="text-sm font-mono font-extrabold text-amber-700">
                        {sortedLeaderboard[0].score} ұпай
                      </div>
                    </div>
                  )}
                  <div className="w-full h-60 rounded-t-3xl bg-gradient-to-t from-amber-400 to-amber-300 border-t-4 border-yellow-500 flex flex-col items-center justify-center text-amber-950 font-black text-4xl shadow-xl">
                    <span>🥇</span>
                    <span className="text-2xl">1</span>
                  </div>
                </div>

                {/* 3rd Place (Bronze) */}
                <div className="flex-1 flex flex-col items-center">
                  {sortedLeaderboard[2] && (
                    <div className="text-center mb-3">
                      <div
                        className="w-14 h-14 rounded-2xl mx-auto mb-2 flex items-center justify-center text-white text-xl font-black shadow-lg"
                        style={{ backgroundColor: sortedLeaderboard[2].avatar_color || "#f97316" }}
                      >
                        {sortedLeaderboard[2].nickname.charAt(0).toUpperCase()}
                      </div>
                      <div className="font-extrabold text-sm text-gray-800 truncate max-w-[120px]">
                        {sortedLeaderboard[2].nickname}
                      </div>
                      <div className="text-xs font-mono font-bold text-gray-500">
                        {sortedLeaderboard[2].score} ұпай
                      </div>
                    </div>
                  )}
                  <div className="w-full h-32 rounded-t-3xl bg-gradient-to-t from-orange-300 to-orange-200 border-t-4 border-orange-400 flex flex-col items-center justify-center text-orange-950 font-black text-3xl shadow-md">
                    <span>🥉</span>
                    <span className="text-xl">3</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Questions Analytics View */
            <div className="bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-purple-100 shadow-xl space-y-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Сұрақтар бойынша дәлдік пен нәтижелер
              </h3>

              {stats?.question_stats?.map((qStat, idx) => {
                const total = qStat.total_answers || 1;
                const correct = qStat.correct_answers || 0;
                const accuracy = Math.round((correct / total) * 100);

                return (
                  <div
                    key={qStat.question_id}
                    className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-6 h-6 rounded-lg bg-purple-600 text-white font-bold text-xs flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-gray-500">
                          {qStat.avg_time ? `Орташа уақыт: ${qStat.avg_time}с` : ""}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-gray-800">
                        <MathRender latex={qStat.question_text} />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="text-right">
                        <span className="text-xs text-gray-500 block">
                          {correct} / {total} дұрыс
                        </span>
                        <span
                          className={`text-lg font-black font-mono ${
                            accuracy >= 70
                              ? "text-emerald-600"
                              : accuracy >= 40
                              ? "text-amber-600"
                              : "text-rose-600"
                          }`}
                        >
                          {accuracy}%
                        </span>
                      </div>

                      <div className="w-24 bg-gray-200 h-3 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            accuracy >= 70
                              ? "bg-emerald-500"
                              : accuracy >= 40
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${accuracy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}
    </div>
  );
}
