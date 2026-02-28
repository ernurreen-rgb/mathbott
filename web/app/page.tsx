"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/api";
import OnboardingSurvey from "@/components/OnboardingSurvey";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  // Check onboarding status for authenticated users
  useEffect(() => {
    const checkOnboarding = async () => {
      if (status === "authenticated" && session?.user?.email) {
        try {
          const response = await fetch(`${apiPath("user/onboarding/status")}?email=${encodeURIComponent(session.user.email)}`);
          if (response.ok) {
            const data = await response.json();
            setOnboardingCompleted(data.completed);
            if (data.completed) {
              router.push("/modules");
            }
          }
        } catch (error) {
          console.error("Error checking onboarding:", error);
        } finally {
          setCheckingOnboarding(false);
        }
      } else if (status === "unauthenticated") {
        setCheckingOnboarding(false);
      }
    };

    checkOnboarding();
  }, [status, session?.user?.email, router]);

  if (status === "loading" || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Жүктелуде...</div>
      </div>
    );
  }

  // Show onboarding if user is authenticated but hasn't completed onboarding
  if (status === "authenticated" && !onboardingCompleted) {
    return (
      <OnboardingSurvey
        onComplete={() => {
          setOnboardingCompleted(true);
          router.push("/modules");
        }}
      />
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-math animate-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10 w-full max-w-md px-4">
          <div className="glass rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4 animate-float">🎓</div>
              <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Mathbot
              </h1>
              <p className="text-gray-700 text-lg font-medium">
                Математикалық есептерді шешу платформасы
              </p>
            </div>
            <button
              onClick={() => signIn("google")}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-105 text-lg"
            >
              Google арқылы кіру
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl">Басқа бетке өтілуде...</div>
    </div>
  );
}

