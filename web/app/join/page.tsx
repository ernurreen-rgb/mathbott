"use client";
import Icon from "@/components/ui/Icon";


import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { joinQuizSession, getQuizSessionByPin } from "@/lib/api/quizzes";
import { readQuizPlayer, saveQuizPlayer } from "@/lib/quiz-player-storage";
import {
  QuizAvatar,
  QuizAvatarPicker,
  encodeQuizAvatar,
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
  const [step, setStep] = useState<"identity" | "avatar">("identity");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const cleanPin = pinCode.trim().replace(/\s+/g, "");
    const cleanNick = nickname.trim();

    if (!cleanPin || cleanPin.length !== 6) {
      toast.error("6 таңбалы PIN кодты енгізіңіз");
      pinRef.current?.focus();
      return;
    }

    if (!cleanNick) {
      toast.error("Лақап атыңызды (аты-жөніңізді) жазыңыз");
      nicknameRef.current?.focus();
      return;
    }

    if (step === "identity") {
      setPinCode(cleanPin);
      setNickname(cleanNick);
      setStep("avatar");
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

      // Preserve guest access after closing the tab and signing up later.
      if (typeof window !== "undefined") {
        const persisted = saveQuizPlayer({
          sessionId: data.session.id,
          participantId: data.participant.id,
          token: data.participant_token,
          nickname: data.participant.nickname,
          avatarColor: data.participant.avatar_color,
        });
        if (!persisted) toast.error("Браузер сақтау орнын бұғаттады. Нәтижені жоғалтпау үшін осы вкладканы жаппаңыз.");
      }

      toast.success("Сәтті қосылдыңыз!");
      router.push(`/quiz/play/${data.session.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Сессияға қосылу қатесі");
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="join-title" className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-2xl shadow-purple-900/10">
      <div className="shrink-0 px-5 pb-4 pt-5 text-center sm:px-8 sm:pt-6">
        <ol aria-label="Қосылу қадамдары" className="mb-4 flex justify-center gap-4 text-xs font-bold">
          {(["identity", "avatar"] as const).map((item, index) => (
            <li key={item} aria-current={step === item ? "step" : undefined}
              className={`flex items-center gap-2 ${step === item ? "text-purple-700" : "text-gray-400"}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${step === item ? "bg-purple-600 text-white" : "bg-gray-100"}`}>
                {index + 1}
              </span>
              {item === "identity" ? "PIN және есім" : "Кейіпкер"}
            </li>
          ))}
        </ol>
        <h1 id="join-title" ref={titleRef} tabIndex={-1} className="text-2xl font-extrabold tracking-tight text-gray-900 outline-none sm:text-3xl">
          {step === "identity" ? "Ойынға қосылу" : "Кейіпкеріңізді таңдаңыз"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {step === "identity"
            ? "Мұғалім берген PIN код пен есіміңізді енгізіңіз"
            : "Кейіпкеріңізді таңдап, ойынға кіріңіз"}
        </p>
      </div>

      <form onSubmit={handleJoin} className="flex min-h-0 flex-col">
        <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-4 sm:px-6">
          {step === "identity" ? (
            <div className="space-y-4 px-2">
              <div>
                <label htmlFor="quiz-pin" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5 text-center">
                  Ойын PIN коды
                </label>
                <input
                  id="quiz-pin"
                  ref={pinRef}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  className="w-full text-center text-3xl font-extrabold font-mono tracking-widest py-3 px-4 rounded-2xl bg-gray-50 border-2 border-gray-200 focus:bg-white focus:border-purple-600 focus:outline-none transition-all text-purple-700 placeholder-gray-300"
                />
              </div>
              <div>
                <label htmlFor="quiz-nickname" className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                  Сіздің есіміңіз (Никнейм)
                </label>
                <input
                  id="quiz-nickname"
                  ref={nicknameRef}
                  type="text"
                  autoComplete="nickname"
                  enterKeyHint="next"
                  maxLength={25}
                  placeholder="Мысалы: Арман немесе Айша"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full py-3 px-4 rounded-2xl bg-gray-50 border border-gray-200 focus:bg-white focus:border-purple-600 focus:outline-none transition-all text-gray-800 font-semibold text-base placeholder-gray-400"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-1 flex items-center gap-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3">
                <QuizAvatar avatarColor={selectedAvatar} nickname={nickname} size="lg" />
                <div className="min-w-0">
                  <p className="break-words text-base font-bold text-gray-900">{nickname}</p>
                </div>
              </div>
              <QuizAvatarPicker
                value={selectedAvatar}
                nickname={nickname}
                onChange={setSelectedAvatar}
                compact
                showCharacterNames={false}
              />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-purple-100 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex gap-3">
            {step === "avatar" && (
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep("identity")}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-gray-200 px-3 py-3 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <Icon name="arrowLeft" /> Артқа
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 py-4 px-3 rounded-2xl font-extrabold text-sm sm:text-base bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-xl shadow-purple-500/25 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Қосылуда...
                </span>
              ) : step === "identity" ? (
                <>Кейіпкерді таңдау <Icon name="arrowRight" /></>
              ) : (
                <>Ойынға кіру <Icon name="rocket" /></>
              )}
            </button>
          </div>
          {step === "identity" && (
            <div className="mt-4 text-center">
              <Link href="/quizzes" className="text-xs font-bold text-gray-500 hover:text-purple-600 transition-colors">
                <Icon name="arrowLeft" /> Квиздер каталогына оралу
              </Link>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}

export default function JoinQuizPage() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-3 sm:p-4">
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
