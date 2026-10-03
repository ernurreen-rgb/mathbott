"use client";

import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getQuizSession,
  getSessionQuestions,
  submitQuizAnswer,
  completeQuizParticipant,
  getQuizLeaderboard,
} from "@/lib/api/quizzes";
import { resolveWebSocketBase } from "@/lib/websocket-url";
import { QuizSession, QuizQuestion, QuizAnswerResult, QuizParticipant } from "@/types/quiz";
import MathRender from "@/components/ui/MathRender";
import toast from "react-hot-toast";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

const MCQ_THEMES = [
  {
    id: "A",
    bg: "bg-red-500 hover:bg-red-600 active:bg-red-700",
    border: "border-red-600",
    icon: "▲",
  },
  {
    id: "B",
    bg: "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
    border: "border-blue-600",
    icon: "◆",
  },
  {
    id: "C",
    bg: "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
    border: "border-amber-600",
    icon: "●",
  },
  {
    id: "D",
    bg: "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
    border: "border-emerald-600",
    icon: "■",
  },
];

export default function PlayQuizPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = parseInt(resolvedParams.sessionId, 10);
  const router = useRouter();

  // Participant info from session storage
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [nickname, setNickname] = useState<string>("");
  const [avatarColor, setAvatarColor] = useState<string>("#8b5cf6");

  // Game state
  const [sessionData, setSessionData] = useState<QuizSession | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Per-question state
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerTotal, setTimerTotal] = useState(30);
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [inputAnswer, setInputAnswer] = useState("");
  const [isAnswered, setIsAnswered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<QuizAnswerResult | null>(null);

  // Score & Streak
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const socketRef = useRef<WebSocket | null>(null);

  // 1. Load participant details from session storage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedPid = sessionStorage.getItem("quiz_participant_id");
      const storedNick = sessionStorage.getItem("quiz_nickname");
      const storedColor = sessionStorage.getItem("quiz_avatar_color");

      if (storedPid) {
        setParticipantId(parseInt(storedPid, 10));
      }
      if (storedNick) {
        setNickname(storedNick);
      }
      if (storedColor) {
        setAvatarColor(storedColor);
      }
    }
  }, []);

  // 2. Fetch session and questions
  useEffect(() => {
    if (!sessionId) return;

    const loadGame = async () => {
      setLoading(true);
      try {
        const [sessRes, qRes] = await Promise.all([
          getQuizSession(sessionId),
          getSessionQuestions(sessionId, false),
        ]);

        if (sessRes.data) {
          setSessionData(sessRes.data);
          if (sessRes.data.status === "finished") {
            setIsFinished(true);
          }
        }

        if (qRes.data) {
          setQuestions(qRes.data);
        }
      } catch (err) {
        console.error("Load game error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadGame();
  }, [sessionId]);

  // 3. Connect to WebSocket
  useEffect(() => {
    if (!sessionId) return;
    const wsBase = resolveWebSocketBase();
    if (!wsBase) return;

    const ws = new WebSocket(`${wsBase}/ws/quiz/${sessionId}`);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "game_started") {
          setSessionData((prev) => (prev ? { ...prev, status: "in_progress" } : null));
          toast("Ойын басталды! Сәттілік!", { icon: "🚀" });
        } else if (msg.type === "game_finished" || msg.type === "game_over") {
          setSessionData((prev) => (prev ? { ...prev, status: "finished" } : null));
          setIsFinished(true);
        }
      } catch (e) {
        console.error("WS error:", e);
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  const submitAnswer = async (answerValue: string) => {
    if (isAnswered || submitting || !participantId) return;

    const currentQ = questions[currentQIndex];
    if (!currentQ) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setIsAnswered(true);
    setSubmitting(true);

    const elapsed = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(50);
      }

      const res = await submitQuizAnswer(sessionId, {
        participant_id: participantId,
        question_id: currentQ.id,
        answer: answerValue,
        time_taken_seconds: elapsed,
      });

      if (res.data) {
        setLastResult(res.data);
        setTotalScore(res.data.total_score);
        setStreak(res.data.streak);
        if (res.data.is_correct) {
          setCorrectCount((prev) => prev + 1);
        }
      }
    } catch (e) {
      console.error("Submit answer error:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const submitAnswerRef = useRef(submitAnswer);
  submitAnswerRef.current = submitAnswer;

  const sessionStatus = sessionData?.status;

  // 4. Timer management per question
  useEffect(() => {
    if (
      sessionStatus !== "in_progress" ||
      isFinished ||
      isAnswered ||
      questions.length === 0
    ) {
      return;
    }

    const currentQ = questions[currentQIndex];
    if (!currentQ) return;

    const totalSecs = currentQ.time_limit_seconds || 30;
    setTimerTotal(totalSecs);
    setTimeLeft(totalSecs);
    startTimeRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          submitAnswerRef.current("__timeout__");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQIndex, sessionStatus, isFinished, isAnswered, questions]);

  const handleNextQuestion = async () => {
    setIsAnswered(false);
    setLastResult(null);
    setSelectedMulti([]);
    setInputAnswer("");

    if (currentQIndex + 1 < questions.length) {
      setCurrentQIndex((prev) => prev + 1);
    } else {
      // Finished all questions
      setIsFinished(true);
      if (participantId) {
        await completeQuizParticipant(sessionId, participantId);
        // Fetch rank
        const lbRes = await getQuizLeaderboard(sessionId);
        if (lbRes.data) {
          const myIndex = lbRes.data.findIndex((p) => p.id === participantId);
          if (myIndex !== -1) {
            setRank(myIndex + 1);
          }
        }
      }
    }
  };

  const handleMultiSubmit = () => {
    if (selectedMulti.length === 0) {
      toast.error("Кем дегенде бір нұсқаны таңдаңыз");
      return;
    }
    submitAnswer(selectedMulti.sort().join(","));
  };

  const toggleMultiOption = (optId: string) => {
    setSelectedMulti((prev) =>
      prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-800">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-bold">Ойын жүктелуде...</p>
        </div>
      </div>
    );
  }

  // If student opened directly without joining first
  if (!participantId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-gray-800 p-4">
        <div className="bg-white p-8 rounded-3xl border border-gray-200 text-center max-w-sm shadow-xl">
          <h2 className="text-xl font-bold mb-2">Ойынға қосылыңыз</h2>
          <p className="text-xs text-gray-500 mb-6">
            Ойнау үшін алдымен PIN-код пен атыңызды енгізу қажет.
          </p>
          <Link
            href={`/join?pin=${sessionData?.pin_code || ""}`}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm block shadow-md shadow-purple-500/20"
          >
            Қосылу бетіне өту
          </Link>
        </div>
      </div>
    );
  }

  // STATE A: LOBBY (WAITING FOR HOST TO START)
  if (sessionData?.status === "lobby") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50/80 via-purple-50/50 to-pink-50/60 text-gray-900 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-2xl flex flex-col items-center">
          {/* Avatar Icon */}
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-4xl font-black shadow-xl ring-4 ring-purple-100 mb-4 animate-bounce"
            style={{ backgroundColor: avatarColor }}
          >
            {nickname.charAt(0).toUpperCase()}
          </div>

          <h2 className="text-2xl font-black text-gray-900 mb-1">{nickname}</h2>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full border border-purple-200 mb-6">
            Ойынға дайынсыз
          </span>

          <div className="w-full bg-purple-50/60 rounded-2xl p-4 border border-purple-100 mb-6">
            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-2 animate-spin">
              ⌛
            </div>
            <h3 className="text-sm font-bold text-gray-800 mb-1">
              Мұғалім ойынды бастаған сәтте...
            </h3>
            <p className="text-xs text-gray-500">
              Сұрақтар автоматты түрде экраныңызда пайда болады. Тақтаға назар аударыңыз!
            </p>
          </div>

          <div className="text-xs text-gray-500">
            PIN коды: <strong className="text-purple-700 font-mono text-sm">{sessionData.pin_code}</strong>
          </div>
        </div>
      </div>
    );
  }

  // STATE C: FINISHED (PLAYER SUMMARY)
  if (isFinished || currentQIndex >= questions.length) {
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 text-gray-900 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-2xl flex flex-col items-center">
          <span className="text-5xl animate-bounce mb-3">🎉</span>
          <h1 className="text-3xl font-black text-gray-900 mb-1">
            Тамаша нәтиже!
          </h1>
          <p className="text-xs text-gray-500 mb-6">Викторина сәтті аяқталды</p>

          {/* Rank Badge */}
          {rank && (
            <div className="w-full bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block mb-0.5">
                Сіздің орныңыз
              </span>
              <div className="text-3xl font-black text-amber-700">
                🏆 #{rank}-орын
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="w-full grid grid-cols-2 gap-3 mb-6">
            <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100 text-center">
              <span className="text-[11px] font-bold uppercase text-gray-500 block mb-1">
                Жалпы ұпай
              </span>
              <span className="text-2xl font-black font-mono text-purple-700">
                {totalScore.toLocaleString()}
              </span>
            </div>
            <div className="bg-purple-50/60 rounded-2xl p-4 border border-purple-100 text-center">
              <span className="text-[11px] font-bold uppercase text-gray-500 block mb-1">
                Дәлдік
              </span>
              <span className="text-2xl font-black font-mono text-emerald-600">
                {accuracy}%
              </span>
            </div>
          </div>

          <div className="text-xs text-gray-500 mb-6">
            Дұрыс жауаптар: <strong className="text-gray-900">{correctCount}</strong> / {questions.length}
          </div>

          <Link
            href="/quizzes"
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-extrabold text-sm shadow-xl shadow-purple-600/25 transition-all text-center"
          >
            Квиздер каталогына қайту
          </Link>
        </div>
      </div>
    );
  }

  // STATE B: IN-GAME QUESTION
  const currentQ = questions[currentQIndex];
  const timerPercent = timerTotal > 0 ? (timeLeft / timerTotal) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50/60 via-purple-50/30 to-pink-50/40 text-gray-900 flex flex-col justify-between select-none">
      {/* Top Header Bar */}
      <header className="px-4 py-3 bg-white/90 backdrop-blur border-b border-purple-100 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shadow"
            style={{ backgroundColor: avatarColor }}
          >
            {nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="text-xs font-bold text-gray-800 block">
              Сұрақ {currentQIndex + 1} / {questions.length}
            </span>
            <span className="text-[10px] text-gray-500">{nickname}</span>
          </div>
        </div>

        {/* Streak indicator */}
        <div className="flex items-center gap-3">
          {streak > 1 && (
            <div className="px-2.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-orange-700 font-black text-xs flex items-center gap-1 animate-pulse">
              🔥 {streak}x
            </div>
          )}

          {/* Current Score */}
          <div className="text-right">
            <span className="text-base font-black font-mono text-purple-700">
              {totalScore.toLocaleString()}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-gray-500 block -mt-1">
              ұпай
            </span>
          </div>
        </div>
      </header>

      {/* Animated Timer Progress Bar */}
      <div className="w-full bg-gray-200 h-2.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ease-linear rounded-r-full ${
            timerPercent > 50
              ? "bg-emerald-500"
              : timerPercent > 20
              ? "bg-amber-500"
              : "bg-red-500 animate-pulse"
          }`}
          style={{ width: `${timerPercent}%` }}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl mx-auto w-full p-4 flex flex-col justify-between">
        {/* Question Text Box */}
        <div className="my-auto py-4">
          <div className="bg-white border border-purple-100 rounded-3xl p-6 sm:p-8 shadow-lg text-center">
            <div className="text-lg sm:text-2xl font-bold text-gray-900 leading-relaxed">
              <MathRender latex={currentQ.question_text} />
            </div>
          </div>
        </div>

        {/* IF ANSWERED: INSTANT FEEDBACK CARD (Quizizz Style) */}
        {isAnswered && lastResult && (
          <div
            className={`rounded-3xl p-6 text-center shadow-2xl mb-4 border-2 animate-fadeIn ${
              lastResult.is_correct
                ? "bg-emerald-50 border-emerald-500 text-emerald-950"
                : "bg-rose-50 border-rose-500 text-rose-950"
            }`}
          >
            <div className="text-4xl mb-2">
              {lastResult.is_correct ? "🎉" : "❌"}
            </div>
            <h3 className="text-2xl font-black mb-1">
              {lastResult.is_correct ? "Дұрыс! Өте жақсы!" : "Қате жауап"}
            </h3>

            {lastResult.points_awarded > 0 && (
              <div className="text-lg font-mono font-black text-amber-700 mb-2">
                +{lastResult.points_awarded} ұпай!
              </div>
            )}

            {!lastResult.is_correct && lastResult.correct_answer && (
              <div className="my-2 p-3 bg-white/90 rounded-xl text-xs text-gray-800 border border-gray-200 flex items-center justify-center gap-2">
                <span className="font-bold">Дұрыс жауап:</span>
                <MathRender latex={lastResult.correct_answer} />
              </div>
            )}

            {lastResult.explanation && (
              <p className="text-xs text-gray-600 my-2 max-w-md mx-auto">
                {lastResult.explanation}
              </p>
            )}

            <button
              onClick={handleNextQuestion}
              className="mt-4 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              Келесі сұраққа өту →
            </button>
          </div>
        )}

        {/* IF NOT ANSWERED: ANSWER OPTIONS INTERFACE */}
        {!isAnswered && (
          <div className="w-full pb-4">
            {/* 1. MCQ (4 colorful Quizizz buttons) */}
            {currentQ.question_type === "mcq" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentQ.options?.map((opt, idx) => {
                  const theme = MCQ_THEMES[idx % MCQ_THEMES.length];
                  return (
                    <button
                      key={opt.id}
                      onClick={() => submitAnswer(opt.id)}
                      disabled={submitting}
                      className={`h-24 sm:h-28 rounded-2xl p-4 text-white font-extrabold text-base shadow-lg transition-all active:scale-95 flex items-center gap-4 text-left border-b-4 ${theme.bg} ${theme.border}`}
                    >
                      <span className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center font-black text-sm shrink-0">
                        {theme.icon}
                      </span>
                      <div className="flex-1 overflow-y-auto">
                        <MathRender latex={opt.text} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 2. TRUE / FALSE (2 big buttons) */}
            {currentQ.question_type === "tf" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => submitAnswer("A")}
                  disabled={submitting}
                  className="h-28 rounded-2xl bg-blue-600 hover:bg-blue-500 border-b-4 border-blue-800 text-white font-black text-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">✓</span>
                  <span>Шын (True)</span>
                </button>
                <button
                  onClick={() => submitAnswer("B")}
                  disabled={submitting}
                  className="h-28 rounded-2xl bg-amber-600 hover:bg-amber-500 border-b-4 border-amber-800 text-white font-black text-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <span className="text-2xl">✗</span>
                  <span>Жалған (False)</span>
                </button>
              </div>
            )}

            {/* 3. MULTI-SELECT */}
            {currentQ.question_type === "multi_select" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQ.options?.map((opt) => {
                    const isSelected = selectedMulti.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleMultiOption(opt.id)}
                        className={`min-h-[70px] rounded-2xl p-4 font-bold text-sm border-2 transition-all flex items-center gap-3 text-left ${
                          isSelected
                            ? "bg-purple-50 border-purple-600 text-purple-950 shadow-md ring-2 ring-purple-300"
                            : "bg-white border-gray-200 text-gray-800 hover:border-purple-300 shadow-sm"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs border ${
                            isSelected
                              ? "bg-purple-600 border-purple-600 text-white"
                              : "border-gray-300 bg-white text-transparent"
                          }`}
                        >
                          ✓
                        </div>
                        <div className="flex-1">
                          <MathRender latex={opt.text} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleMultiSubmit}
                  disabled={submitting || selectedMulti.length === 0}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl font-black text-base shadow-xl disabled:opacity-50 transition-all active:scale-95"
                >
                  Жауапты растау ({selectedMulti.length} таңдалды)
                </button>
              </div>
            )}

            {/* 4. OPEN INPUT (Numeric / Math Formula) */}
            {currentQ.question_type === "input" && (
              <div className="bg-white rounded-3xl p-5 border border-purple-100 shadow-md space-y-4">
                <input
                  type="text"
                  placeholder="Математикалық жауапты жазыңыз..."
                  value={inputAnswer}
                  onChange={(e) => setInputAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inputAnswer.trim()) {
                      submitAnswer(inputAnswer.trim());
                    }
                  }}
                  className="w-full bg-gray-50 border-2 border-gray-200 focus:bg-white rounded-2xl px-4 py-3.5 text-lg font-mono text-center text-gray-900 focus:outline-none focus:border-purple-600 placeholder-gray-400"
                  autoFocus
                />

                <button
                  type="button"
                  onClick={() => inputAnswer.trim() && submitAnswer(inputAnswer.trim())}
                  disabled={submitting || !inputAnswer.trim()}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-2xl font-black text-base shadow-xl disabled:opacity-50 transition-all active:scale-95"
                >
                  Жауапты жіберу 🚀
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
