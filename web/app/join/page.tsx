"use client";
import Icon from "@/components/ui/Icon";


import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { joinQuizSession, getQuizSessionByPin } from "@/lib/api/quizzes";
import { readQuizPlayer, saveQuizPlayer } from "@/lib/quiz-player-storage";
import {
  QuizAvatar,
  QuizAvatarPicker,
  encodeQuizAvatar,
  parseQuizAvatar,
  QUIZ_AVATAR_COLORS,
  QUIZ_AVATAR_CHARACTERS,
} from "@/components/quiz/QuizAvatar";
import toast from "react-hot-toast";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [pinCode, setPinCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(() =>
    encodeQuizAvatar(QUIZ_AVATAR_COLORS[0].hex, QUIZ_AVATAR_CHARACTERS[0].id)
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pinParam = searchParams.get("pin");
    if (pinParam) {
      setPinCode(pinParam.trim());
    }
    if (session?.user?.name) {
      setNickname(session.user.name);
    }
  }, [searchParams, session]);

  const parsedAvatar = parseQuizAvatar(selectedAvatar, nickname || "Ойыншы");

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinCode.trim().replace(/\s+/g, "");
    const cleanNick = nickname.trim();

    if (!cleanPin || cleanPin.length !== 6) {
      toast.error("6 таңбалы PIN кодты енгізіңіз");
      return;
    }

    if (!cleanNick) {
      toast.error("Лақап атыңызды (аты-жөніңізді) жазыңыз");
      return;
    }

    setLoading(true);
    try {
      const email = session?.user?.email || undefined;
      const lobby = await getQuizSessionByPin(cleanPin);
      if (!lobby.data) {
        toast.error(lobby.error || "Ойын табылмады");
        setLoading(false);
        return;
      }
      const saved = readQuizPlayer(lobby.data.id);
      const { data, error } = await joinQuizSession(
        cleanPin,
        cleanNick,
        email,
        selectedAvatar,
        saved?.nickname === cleanNick ? saved.token : undefined
      );

      if (error || !data) {
        toast.error(error || "Қосылу мүмкін болмады. PIN кодты тексеріңіз.");
        setLoading(false);
        return;
      }

      // Store in session storage for student play page
      if (typeof window !== "undefined") {
        saveQuizPlayer({
          sessionId: data.session.id,
          participantId: data.participant.id,
          token: data.participant_token,
          nickname: data.participant.nickname,
          avatarColor: data.participant.avatar_color,
        });
      }

      toast.success("Сәтті қосылдыңыз!");
      router.push(`/quiz/play/${data.session.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Сессияға қосылу қатесі");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/80 shadow-2xl shadow-purple-900/10">
      <div className="text-center mb-6">
        <div className="relative inline-block mb-3">
          <QuizAvatar
            avatarColor={selectedAvatar}
            nickname={nickname || "Ойыншы"}
            size="xl"
            className="ring-4 ring-purple-100 shadow-xl"
          />
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold shadow">
            {parsedAvatar.character.name}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-2">
          Ойынға қосылу
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Мұғалімнің экранындағы 6 таңбалы кодты енгізіп, кейіпкеріңізді таңдаңыз
        </p>
      </div>

      <form onSubmit={handleJoin} className="space-y-5">
        {/* PIN Code Input */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 text-center">
            Ойын PIN коды
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            className="w-full text-center text-3xl font-extrabold font-mono tracking-widest py-3 px-4 rounded-2xl bg-gray-50 border-2 border-gray-200 focus:bg-white focus:border-purple-600 focus:outline-none transition-all text-purple-700 placeholder-gray-300"
          />
        </div>

        {/* Nickname Input */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
            Сіздің есіміңіз (Никнейм)
          </label>
          <input
            type="text"
            maxLength={25}
            placeholder="Мысалы: Арман немесе Айша"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full py-3 px-4 rounded-2xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-purple-600 focus:outline-none transition-all text-gray-800 font-semibold text-base placeholder-gray-400"
          />
        </div>

        {/* Avatar Character & Color Picker */}
        <div className="p-4 rounded-2xl bg-slate-50/80 border border-purple-100/80">
          <QuizAvatarPicker
            value={selectedAvatar}
            nickname={nickname || "Ойыншы"}
            onChange={setSelectedAvatar}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 rounded-2xl font-extrabold text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl shadow-purple-500/25 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Қосылуда...
            </span>
          ) : (
            <>Ойынға кіру <Icon name="rocket" /></>
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/quizzes"
          className="text-xs font-bold text-gray-500 hover:text-purple-600 transition-colors"
        >
          <Icon name="arrowLeft" /> Квиздер каталогына оралу
        </Link>
      </div>
    </div>
  );
}

export default function JoinQuizPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-lg bg-white/90 rounded-3xl p-8 text-center text-gray-600">
            Жүктелуде...
          </div>
        }
      >
        <JoinForm />
      </Suspense>
    </div>
  );
}
