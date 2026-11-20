"use client";
import Icon from "@/components/ui/Icon";


import { useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { UserData } from "@/types";
import { getPublicUserDataById } from "@/lib/api";
import { getProfileWeekActivityDaysSet } from "@/lib/week-activity";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { useI18n } from "@/lib/i18n/provider";

export default function PublicProfilePage() {
  const params = useParams();
  const { t } = useI18n();
  const rawId = typeof params?.id === "string" ? params.id.trim() : "";
  const parsedId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  const userId = Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streakAnimated, setStreakAnimated] = useState(false);

  const weekDays = [
    { short: t("week.short.1"), weekDay: 1 }, // Monday
    { short: t("week.short.2"), weekDay: 2 }, // Tuesday
    { short: t("week.short.3"), weekDay: 3 }, // Wednesday
    { short: t("week.short.4"), weekDay: 4 }, // Thursday
    { short: t("week.short.5"), weekDay: 5 }, // Friday
    { short: t("week.short.6"), weekDay: 6 }, // Saturday
    { short: t("week.short.0"), weekDay: 0 }, // Sunday
  ];
  const streakDaysSet = getProfileWeekActivityDaysSet({
    recentActivityTimestamps: userData?.recent_activity_timestamps,
    streak: userData?.streak,
    lastStreakDate: userData?.last_streak_date,
  });

  const fetchUserData = useCallback(async () => {
    if (!userId || isNaN(userId)) return;

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getPublicUserDataById(userId);
      if (fetchError) {
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch user data:", fetchError);
        }
        setError(fetchError);
      } else if (data) {
        setUserData(data);
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching user data:", err);
      }
      setError(t("publicProfile.loadError"));
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => {
    if (userData?.streak && userData.streak > 0) {
      setStreakAnimated(true);
      const timer = setTimeout(() => setStreakAnimated(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [userData?.streak]);

  useEffect(() => {
    if (userId && !isNaN(userId)) {
      fetchUserData();
    } else {
      setError(t("publicProfile.badId"));
      setLoading(false);
    }
  }, [userId, fetchUserData, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="profile" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-2xl mx-auto">
            <SkeletonLoader variant="card" className="mb-4" />
            <SkeletonLoader variant="card" className="mb-4" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
        <div className="absolute inset-0 bg-black/5"></div>
        <DesktopNav />
        <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="w-full max-w-5xl">
            <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center">
              <div className="text-gray-400 mb-4">
                <Icon name="info" className="w-16 h-16 mx-auto" />
              </div>
              <div className="text-gray-600 text-lg mb-4">
                {error || t("publicProfile.notFound")}
              </div>
              <Link
                href="/modules"
                className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-glow transition-all"
              >
                {t("publicProfile.backToModules")}
              </Link>
            </div>
          </div>
        </main>
        <MobileNav currentPage="profile" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
        {/* Profile Header Card */}
        <div className="bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 rounded-3xl shadow-2xl p-8 mb-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl font-bold border-4 border-white/30">
                {userData?.nickname?.[0]?.toUpperCase() || <><Icon name="user" /></>}
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1">
                  {userData?.nickname || t("profile.user")}
                </h1>
              </div>
            </div>
          </div>
        </div>

        {userData ? (
          <div className="space-y-6">
            {/* Weekly streak bar (before statistics) */}
            <div className="rounded-3xl shadow-xl p-4 border border-white/20 bg-slate-900/90 backdrop-blur-md text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-glow ${streakAnimated ? "animate-bounce" : ""}`}>
                    <Icon name="flame" className="w-5 h-5 text-white" />
                  </div>
                  <div className={`flex items-baseline gap-1 ${streakAnimated ? "animate-pulse" : ""}`}>
                    <span className="text-2xl font-extrabold text-orange-400">{userData?.streak || 0}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-300">{t("profile.streakDays", { count: userData?.streak || 0 })}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                {weekDays.map((day) => {
                  const isActive = streakDaysSet.has(day.weekDay);
                  return (
                    <div key={day.short} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${
                          isActive
                            ? "bg-gradient-to-br from-orange-400 to-red-500 shadow-glow"
                            : "bg-slate-700"
                        }`}
                      >
                        <Icon name="flame" className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400"}`} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-200">{day.short}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center">
            <div className="text-gray-400 mb-4">
              <Icon name="info" className="w-16 h-16 mx-auto" />
            </div>
            <div className="text-gray-600 text-lg">{t("profile.loadFailed")}</div>
          </div>
        )}
        </div>
      </main>

      <MobileNav currentPage="profile" />
    </div>
  );
}
