"use client";
import Icon, { ContentIcon } from "@/components/ui/Icon";


import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { UserData } from "@/types";
import { getUserData } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useI18n } from "@/lib/i18n/provider";
import { tr } from "@/lib/i18n/translate";

export default function AchievementsPage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const sessionEmail = session?.user?.email || null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async () => {
    if (!sessionEmail) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getUserData(sessionEmail);
      if (fetchError) {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch user data:", fetchError);
        }
        setUserData(null);
        setError(fetchError);
      } else if (data) {
        setUserData(data);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching user data:", err);
      }
      setUserData(null);
      setError(tr("achievements.loadError"));
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (sessionEmail) {
      void fetchUserData();
    } else if (status !== "loading") {
      setLoading(false);
    }
  }, [sessionEmail, status, fetchUserData]);

  if (status === "loading" || (session && loading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center pb-20 md:pb-0">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600 font-medium">{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthRedirectScreen loading={false} />;
  }

  const unlockedCount = userData?.achievements?.filter(a => a.unlocked).length || 0;
  const totalCount = userData?.achievements?.length || 0;

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
        <div className="mb-6">
          <Link
            href="/profile"
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm transition-all hover:bg-purple-50 hover:text-purple-700 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Icon name="arrowLeft" />
            <span>{t("common.back")}</span>
          </Link>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-2">{t("achievements.all")}</h1>
          <p className="text-gray-700 font-semibold text-lg">
            {t("achievements.unlocked")}: <span className="text-purple-600 font-bold">{unlockedCount}</span> / <span className="text-gray-600">{totalCount}</span>
          </p>
        </div>

        {error ? (
          <div className="bg-white rounded-xl shadow-lg p-12 border border-red-200 text-center">
            <div className="text-red-500 mb-4">
              <Icon name="info" className="w-16 h-16 mx-auto" />
            </div>
            <div className="text-gray-700 text-lg mb-4">{error}</div>
            <button
              type="button"
              onClick={() => void fetchUserData()}
              className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
            >
              {t("profile.reload")}
            </button>
          </div>
        ) : userData?.achievements && userData.achievements.length > 0 ? (
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {userData.achievements.map((achievement) => (
                <div
                  key={achievement.id}
                    className={`flex flex-col items-center p-5 rounded-2xl border-2 transition-all transform hover:scale-110 ${
                      achievement.unlocked
                        ? "bg-gradient-to-br from-yellow-100 via-orange-50 to-pink-50 border-yellow-300 hover:border-yellow-400 shadow-lg hover:shadow-glow"
                        : "bg-gray-100 border-gray-300 opacity-60 grayscale"
                    }`}
                  title={achievement.description}
                >
                  <div className={`text-4xl mb-2 ${achievement.unlocked ? "" : "opacity-50"}`}>
                    <ContentIcon value={achievement.icon} size={40} className={achievement.unlocked ? "text-amber-600" : "text-slate-400"} />
                  </div>
                  <div className={`text-sm font-semibold text-center ${
                    achievement.unlocked ? "text-gray-800" : "text-gray-500"
                  }`}>
                    {achievement.name}
                  </div>
                  <div className={`text-xs text-center mt-1 ${
                    achievement.unlocked ? "text-gray-600" : "text-gray-400"
                  }`}>
                    {achievement.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center">
            <div className="text-gray-400 mb-4">
              <Icon name="award" className="w-16 h-16 mx-auto" />
            </div>
            <div className="text-gray-600 text-lg">{t("achievements.notLoaded")}</div>
          </div>
        )}
        </div>
      </main>

      <MobileNav currentPage="profile" />
    </div>
  );
}

