"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { joinQuizSession } from "@/lib/api/quizzes";
import toast from "react-hot-toast";

const AVATAR_COLORS = [
  { name: "Күлгін", hex: "#8b5cf6", bg: "bg-purple-500" },
  { name: "Көк", hex: "#3b82f6", bg: "bg-blue-500" },
  { name: "Қызғылт", hex: "#ec4899", bg: "bg-pink-500" },
  { name: "Сәбіз", hex: "#f97316", bg: "bg-orange-500" },
  { name: "Жасыл", hex: "#10b981", bg: "bg-emerald-500" },
  { name: "Көгілдір", hex: "#06b6d4", bg: "bg-cyan-500" },
];

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [pinCode, setPinCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0].hex);
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
      const { data, error } = await joinQuizSession(
        cleanPin,
        cleanNick,
        email,
        selectedColor
      );

      if (error || !data) {
        toast.error(error || "Қосылу мүмкін болмады. PIN кодты тексеріңіз.");
        setLoading(false);
        return;
      }

      // Store in session storage for student play page
      if (typeof window !== "undefined") {
        sessionStorage.setItem("quiz_participant_id", String(data.participant.id));
        sessionStorage.setItem("quiz_session_id", String(data.session.id));
        sessionStorage.setItem("quiz_nickname", data.participant.nickname);
        sessionStorage.setItem("quiz_avatar_color", data.participant.avatar_color);
      }

      toast.success("Сәтті қосылдыңыз!");
      router.push(`/quiz/play/${data.session.id}`);
    } catch (err: any) {
      toast.error(err?.message || "Сессияға қосылу қатесі");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 border border-white/80 shadow-2xl shadow-purple-900/10">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-purple-500/30">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
          Ойынға қосылу
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Мұғалімнің экранындағы 6 таңбалы кодты енгізіңіз
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

        {/* Avatar Color Picker */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
            Түсіңізді таңдаңыз
          </label>
          <div className="flex items-center justify-between gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c.hex}
                onClick={() => setSelectedColor(c.hex)}
                className={`w-9 h-9 rounded-full ${c.bg} transition-all flex items-center justify-center ${
                  selectedColor === c.hex
                    ? "ring-4 ring-offset-2 ring-purple-600 scale-110 shadow-md"
                    : "opacity-80 hover:opacity-100 hover:scale-105"
                }`}
                title={c.name}
              >
                {selectedColor === c.hex && (
                  <span className="w-2 h-2 rounded-full bg-white" />
                )}
              </button>
            ))}
          </div>
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
            "Ойынға кіру 🚀"
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/quizzes"
          className="text-xs font-bold text-gray-500 hover:text-purple-600 transition-colors"
        >
          ← Квиздер каталогына оралу
        </Link>
      </div>
    </div>
  );
}

export default function JoinQuizPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50/50 to-pink-50 flex flex-col items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white/90 rounded-3xl p-8 text-center text-gray-600">
            Жүктелуде...
          </div>
        }
      >
        <JoinForm />
      </Suspense>
    </div>
  );
}
