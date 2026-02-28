"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/api";
import { showToast } from "@/lib/toast";

interface OnboardingSurveyProps {
  onComplete: () => void;
}

export default function OnboardingSurvey({ onComplete }: OnboardingSurveyProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nickname: "",
    how_did_you_hear: "",
    math_level: "",
  });

  const howDidYouHearOptions = [
    "Достардан естідім",
    "Әлеуметтік желілерден",
    "Іздеу жүйесінен",
    "Мектептен/Университеттен",
    "Басқа жерден",
  ];

  const mathLevelOptions = [
    { value: "beginner", label: "Бастапқы деңгей" },
    { value: "intermediate", label: "Орташа деңгей" },
    { value: "advanced", label: "Жоғары деңгей" },
    { value: "expert", label: "Маман деңгейі" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!session?.user?.email) {
      showToast.error("Кіру қажет");
      return;
    }

    if (!formData.nickname.trim()) {
      showToast.error("Есіміңізді енгізіңіз");
      return;
    }

    if (formData.nickname.trim().length < 2) {
      showToast.error("Есім кемінде 2 таңбадан тұруы керек");
      return;
    }

    if (!formData.how_did_you_hear) {
      showToast.error("Бізді қалай білгеніңізді таңдаңыз");
      return;
    }

    if (!formData.math_level) {
      showToast.error("Математика деңгейіңізді таңдаңыз");
      return;
    }

    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("email", session.user.email);
      formDataToSend.append("nickname", formData.nickname.trim());
      formDataToSend.append("how_did_you_hear", formData.how_did_you_hear);
      formDataToSend.append("math_level", formData.math_level);

      const response = await fetch(apiPath("user/onboarding"), {
        method: "POST",
        body: formDataToSend,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Қате орын алды");
      }

      showToast.success("Қош келдіңіз! 🎉");
      onComplete();
      router.push("/modules");
    } catch (error: any) {
      showToast.error(error.message || "Қате орын алды");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/10"></div>
      <div className="relative z-10 w-full max-w-2xl">
        <div className="glass rounded-3xl shadow-2xl p-8 sm:p-12 border border-white/20">
          {/* Welcome Header */}
          {step === 1 && (
            <div className="text-center mb-8">
              <div className="text-7xl mb-6 animate-float">👋</div>
              <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Қош келдіңіз!
              </h1>
              <p className="text-gray-700 text-lg sm:text-xl mb-8">
                Mathbot-қа қош келдіңіз! Біз сізді білу үшін бірнеше сұрақ қоямыз.
              </p>
              <button
                onClick={() => setStep(2)}
                className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-105 text-lg"
              >
                Бастау
              </button>
            </div>
          )}

          {/* Step 2: Name */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">✏️</div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900">
                  Есіміңізді енгізіңіз
                </h2>
                <p className="text-gray-600">
                  Бұл есім рейтингте көрсетіледі
                </p>
              </div>
              <input
                type="text"
                value={formData.nickname}
                onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                placeholder="Мысалы: Асхат"
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 text-lg focus:border-purple-500 focus:outline-none"
                maxLength={50}
                autoFocus
              />
              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 px-6 rounded-xl transition-all"
                >
                  Артқа
                </button>
                <button
                  onClick={() => {
                    if (formData.nickname.trim().length >= 2) {
                      setStep(3);
                    } else {
                      showToast.error("Есім кемінде 2 таңбадан тұруы керек");
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg"
                >
                  Келесі
                </button>
              </div>
            </div>
          )}

          {/* Step 3: How did you hear */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900">
                  Бізді қалай білдіңіз?
                </h2>
                <p className="text-gray-600">
                  Біз үшін маңызды ақпарат
                </p>
              </div>
              <div className="space-y-3">
                {howDidYouHearOptions.map((option) => (
                  <button
                    key={option}
                    onClick={() => setFormData({ ...formData, how_did_you_hear: option })}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      formData.how_did_you_hear === option
                        ? "border-purple-500 bg-purple-50 shadow-lg"
                        : "border-gray-200 hover:border-purple-300 hover:bg-gray-50"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 px-6 rounded-xl transition-all"
                >
                  Артқа
                </button>
                <button
                  onClick={() => {
                    if (formData.how_did_you_hear) {
                      setStep(4);
                    } else {
                      showToast.error("Бірін таңдаңыз");
                    }
                  }}
                  disabled={!formData.how_did_you_hear}
                  className="flex-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Келесі
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Math Level */}
          {step === 4 && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">📊</div>
                <h2 className="text-3xl font-bold mb-2 text-gray-900">
                  Математика деңгейіңіз қандай?
                </h2>
                <p className="text-gray-600">
                  Біз сізге сәйкес тапсырмалар ұсынамыз
                </p>
              </div>
              <div className="space-y-3">
                {mathLevelOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, math_level: option.value })}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      formData.math_level === option.value
                        ? "border-purple-500 bg-purple-50 shadow-lg"
                        : "border-gray-200 hover:border-purple-300 hover:bg-gray-50"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-4 px-6 rounded-xl transition-all"
                >
                  Артқа
                </button>
                <button
                  type="submit"
                  disabled={!formData.math_level || loading}
                  className="flex-1 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Сақталуда..." : "Аяқтау"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

