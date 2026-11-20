"use client";
import Icon from "@/components/ui/Icon";

import { useSession, signIn } from "next-auth/react";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_AUTHENTICATED_PATH, resolveSafeCallbackPath } from "@/lib/use-require-auth";
import { useI18n } from "@/lib/i18n/provider";

function HomeContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const callbackUrl = resolveSafeCallbackPath(
    searchParams?.get("callbackUrl"),
    DEFAULT_AUTHENTICATED_PATH,
  );

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">{t("common.loading")}</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-math animate-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10 w-full max-w-md px-4">
          <div className="glass rounded-3xl shadow-2xl p-8 border border-white/20">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4 animate-float"><Icon name="graduation" /></div>
              <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Mathbot
              </h1>
              <p className="text-gray-700 text-lg font-medium">
                {t("home.tagline")}
              </p>
            </div>
            <button
              onClick={() => signIn("google", { callbackUrl })}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 hover:from-purple-700 hover:via-pink-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-105 text-lg"
            >
              {t("home.signInGoogle")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-xl">{t("home.redirecting")}</div>
    </div>
  );
}

export default function Home() {
  return <HomeWithFallback />;
}

function HomeWithFallback() {
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-xl">{t("common.loading")}</div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
