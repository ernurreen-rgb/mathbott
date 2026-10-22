"use client";
import Icon from "@/components/ui/Icon";


import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useQuizPlayer } from "@/lib/use-quiz-player";
import {
  QuizAvatar,
  QuizAvatarPicker,
  parseQuizAvatar,
} from "@/components/quiz/QuizAvatar";
import MathRender from "@/components/ui/MathRender";
import toast from "react-hot-toast";
import { completeQuizParticipant } from "@/lib/api/quizzes";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

const MCQ_THEMES = [
  {
    id: "A",
    bg: "bg-red-500 hover:bg-red-600 active:bg-red-700",
    border: "border-red-600",
    icon: "triangle",
  },
  {
    id: "B",
    bg: "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
    border: "border-blue-600",
    icon: "diamond",
  },
  {
    id: "C",
    bg: "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
    border: "border-amber-600",
    icon: "circle",
  },
  {
    id: "D",
    bg: "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
    border: "border-emerald-600",
    icon: "square",
  },
] as const;

export default function PlayQuizPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = parseInt(resolvedParams.sessionId, 10);

  const game = useQuizPlayer(sessionId);
  const {
    credentials,
    progress,
    sessionData,
    loading,
    submitting,
    rank,
    timeLeft,
    submitAnswer,
    updateAvatar,
  } = game;
  const participantId = credentials?.participantId;
  const nickname = progress?.participant.nickname || credentials?.nickname || "";
  const avatarColor =
    progress?.participant.avatar_color || credentials?.avatarColor || "#8b5cf6:fox";
  const currentQIndex = progress?.current_question_index || 0;
  const questionCount = progress?.question_count || 0;
  const timerTotal = progress?.current_question?.time_limit_seconds || 30;
  const lastResult = progress?.result || null;
  const isAnswered = !!lastResult;
  const totalScore = progress?.participant.score || 0;
  const streak = progress?.participant.streak || 0;
  const correctCount = progress?.participant.correct_count || 0;
  const isFinished = progress?.status === "finished" || !!progress?.participant.is_finished;
  const isAllAnswered = questionCount > 0 && currentQIndex >= questionCount;

  useEffect(() => {
    if ((isFinished || isAllAnswered) && credentials?.token && participantId && !progress?.participant.is_finished) {
      void completeQuizParticipant(sessionId, participantId, { participantToken: credentials.token });
    }
  }, [isFinished, isAllAnswered, credentials?.token, participantId, progress?.participant.is_finished, sessionId]);

  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [inputAnswer, setInputAnswer] = useState("");
  const [editingAvatar, setEditingAvatar] = useState(false);

  useEffect(() => {
    setSelectedMulti([]);
    setInputAnswer("");
  }, [currentQIndex]);

  const handleNextQuestion = () => void game.advance();

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

  if (loading || (credentials && !progress && !game.error)) {
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

  const myParsedAvatar = parseQuizAvatar(avatarColor, nickname);
  const lobbyParticipants = sessionData?.participants || (progress?.participant ? [progress.participant] : []);

  // STATE A: LOBBY (WAITING FOR HOST TO START)
  if (sessionData?.status === "lobby") {
    return (
      <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center p-4 sm:p-6 select-none">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Card: Student's Own Hero Card & Avatar Customizer */}
          <div className="lg:col-span-5 bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-purple-100 shadow-xl flex flex-col items-center text-center">
            <div className="relative mb-3">
              <QuizAvatar
                avatarColor={avatarColor}
                nickname={nickname}
                size="2xl"
                className="ring-4 ring-purple-100 shadow-xl animate-bounce"
              />
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-0.5 rounded-full bg-purple-600 text-white text-xs font-extrabold shadow-md">
                {myParsedAvatar.character.name}
              </span>
            </div>

            <h2 className="text-2xl font-black text-gray-900 mt-2 mb-1">{nickname}</h2>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 mb-4">
              <Icon name="check" /> Ойынға дайынсыз
            </span>

            {/* Toggle Avatar Customizer */}
            <button
              type="button"
              onClick={() => setEditingAvatar((prev) => !prev)}
              className="mb-5 px-4 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span><Icon name="palette" /></span>
              <span>{editingAvatar ? "Дайын (Жабу)" : "Аватарды өзгерту"}</span>
            </button>

            {editingAvatar && (
              <div className="w-full p-4 rounded-2xl bg-slate-50 border border-purple-100 mb-5 animate-fadeIn">
                <QuizAvatarPicker
                  value={myParsedAvatar.encoded}
                  nickname={nickname}
                  compact
                  onChange={(nextAvatar) => {
                    void updateAvatar(nextAvatar);
                  }}
                />
              </div>
            )}

            <div className="w-full bg-purple-50/60 rounded-2xl p-4 border border-purple-100 mb-4">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto mb-2">
                <Icon name="loader" className="animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-gray-800 mb-1">
                Мұғалім ойынды бастаған сәтте...
              </h3>
              <p className="text-xs text-gray-500">
                Сұрақтар автоматты түрде экраныңызда пайда болады. Тақтаға назар аударыңыз!
              </p>
            </div>

            <div className="text-xs text-gray-500">
              PIN коды:{" "}
              <strong className="text-purple-700 font-mono text-sm">
                {sessionData.pin_code}
              </strong>
            </div>
          </div>

          {/* Right Card: Live Joined Classmates Arena */}
          <div className="lg:col-span-7 bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-purple-100 shadow-xl flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  Лоббидегі оқушылар
                </h3>
                <p className="text-xs text-gray-500">
                  Қосылған сыныптастарыңыз нақты уақытта көрінеді
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-800 font-extrabold text-sm flex items-center gap-2 shadow-sm">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>{lobbyParticipants.length} ойыншы</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start overflow-y-auto max-h-[420px] pr-1">
              {lobbyParticipants.map((p) => {
                const isMe = p.id === participantId;
                const pAvatar = parseQuizAvatar(p.avatar_color, p.nickname);
                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center gap-3 animate-fadeIn ${
                      isMe
                        ? "bg-purple-50/90 border-purple-400 shadow-md ring-2 ring-purple-200"
                        : "bg-white border-purple-100/80 shadow-sm hover:scale-[1.02]"
                    }`}
                  >
                    <QuizAvatar
                      avatarColor={p.avatar_color}
                      nickname={p.nickname}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-gray-900 truncate">
                          {p.nickname}
                        </span>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded-md bg-purple-600 text-white text-[9px] font-black uppercase shrink-0">
                            Сіз
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-semibold text-gray-500 block truncate">
                        {pAvatar.character.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STATE C: FINISHED (PLAYER SUMMARY)
  if (progress && (isFinished || (questionCount > 0 && currentQIndex >= questionCount))) {
    const accuracy = questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : 0;

    return (
      <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl p-8 border border-purple-100 shadow-2xl flex flex-col items-center">
          <div className="relative mb-3">
            <QuizAvatar
              avatarColor={avatarColor}
              nickname={nickname}
              size="xl"
              className="ring-4 ring-amber-300 shadow-xl"
            />
            <span className="absolute -top-2 -right-2 text-2xl animate-bounce"><Icon name="sparkles" /></span>
          </div>
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
                <Icon name="trophy" /> #{rank}-орын
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
            Дұрыс жауаптар: <strong className="text-gray-900">{correctCount}</strong> / {questionCount}
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
  const currentQ = progress?.current_question;
  if (!currentQ) return (
    <div className="p-8 text-center">
      <p>{game.error || "Сұрақ жүктелуде..."}</p>
      <button onClick={() => void game.refresh()} className="mt-4 rounded bg-purple-600 px-4 py-2 text-white">Қайта жүктеу</button>
      <Link className="block mt-4" href="/join">Ойынға қайта қосылу</Link>
    </div>
  );
  const timerPercent = timerTotal > 0 ? (timeLeft / timerTotal) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900 flex flex-col justify-between select-none">
      {/* Top Header Bar */}
      <header className="px-4 py-3 bg-white/90 backdrop-blur border-b border-purple-100 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <QuizAvatar
            avatarColor={avatarColor}
            nickname={nickname}
            size="sm"
          />
          <div>
            <span className="text-xs font-bold text-gray-800 block">
              Сұрақ {currentQIndex + 1} / {questionCount}
            </span>
            <span className="text-[10px] text-gray-500">{nickname}</span>
          </div>
        </div>

        {/* Streak indicator */}
        <div className="flex items-center gap-3">
          {streak > 1 && (
            <div className="px-2.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-orange-700 font-black text-xs flex items-center gap-1 animate-pulse">
              <Icon name="flame" /> {streak}x
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

      {game.error && (
        <div role="alert" className="bg-red-50 p-4 text-center text-red-800">
          <p>{game.error}</p>
          <button disabled={submitting} onClick={isAnswered ? () => void game.advance() : game.retryAnswer}
            className="mt-2 rounded bg-purple-600 px-4 py-2 text-white disabled:opacity-50">Қайта жіберу</button>
        </div>
      )}
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
              {lastResult.is_correct ? <><Icon name="sparkles" /></> : <><Icon name="closeCircle" /></>}
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
              disabled={submitting}
              className="mt-4 px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black text-sm shadow-xl hover:scale-105 active:scale-95 transition-all"
            >
              Келесі сұраққа өту <Icon name="arrowRight" />
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
                        <Icon name={theme.icon} size={20} />
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
                  <span className="text-2xl"><Icon name="check" /></span>
                  <span>Шын (True)</span>
                </button>
                <button
                  onClick={() => submitAnswer("B")}
                  disabled={submitting}
                  className="h-28 rounded-2xl bg-amber-600 hover:bg-amber-500 border-b-4 border-amber-800 text-white font-black text-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                  <span className="text-2xl"><Icon name="close" /></span>
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
                          <Icon name="check" />
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
                  Жауапты жіберу <Icon name="rocket" />
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
