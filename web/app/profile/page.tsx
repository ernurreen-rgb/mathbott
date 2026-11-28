"use client";
import Icon from "@/components/ui/Icon";

import ProfileHeader from "./_components/ProfileHeader";
import ProfileLinkCard from "./_components/ProfileLinkCard";
import WeekActivityPanel from "./_components/WeekActivityPanel";
import { useI18n } from "@/lib/i18n/provider";
import { tr } from "@/lib/i18n/translate";

import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import MobileNav from "@/components/MobileNav";
import { useRequireAuth } from "@/lib/use-require-auth";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { getUserData, updateNickname } from "@/lib/api";
import { getProfileWeekActivityDaysSet } from "@/lib/week-activity";
import { UserData } from "@/types";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const { data: session, status } = useRequireAuth();
  const { t } = useI18n();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [streakAnimated, setStreakAnimated] = useState(false);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionEmail = session?.user?.email || "";

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
  const unlockedAchievements = userData?.achievements?.filter((achievement) => achievement.unlocked).length ?? 0;
  const totalAchievements = userData?.achievements?.length ?? 0;

  useEffect(() => {
    if (userData?.streak && userData.streak > 0) {
      setStreakAnimated(true);
      const timer = setTimeout(() => setStreakAnimated(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [userData?.streak]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  const fetchUserData = useCallback(async () => {
    if (!sessionEmail) return;

    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await getUserData(sessionEmail);
      if (error || !data) {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch user data:", error);
        }
        setFetchError(error || tr("profile.loadFailed"));
      } else {
        setUserData(data);
        setNickname(data.nickname || "");
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching user data:", err);
      }
      setFetchError(tr("profile.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (!sessionEmail) {
      setLoading(false);
      return;
    }
    void fetchUserData();
  }, [sessionEmail, fetchUserData]);

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;

    setSaving(true);
    setMessage(null);
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }

    const { error } = await updateNickname(sessionEmail, nickname.trim());
    if (error) {
      setMessage({ type: "error", text: error });
    } else {
      setMessage({ type: "success", text: t("profile.nicknameSaved") });
      if (userData) {
        setUserData({ ...userData, nickname: nickname.trim() });
      }
      setIsEditingNickname(false);
      messageTimerRef.current = setTimeout(() => {
        setMessage(null);
        messageTimerRef.current = null;
      }, 3000);
    }
    setSaving(false);
  };

  if (status === "loading" || loading) {
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

  if (!session) {
    return <AuthRedirectScreen loading={false} />;
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
          {/* Profile Header Card */}
          <ProfileHeader
            userData={userData}
            isEditingNickname={isEditingNickname}
            handleSaveNickname={handleSaveNickname}
            nickname={nickname}
            setNickname={setNickname}
            saving={saving}
            setIsEditingNickname={setIsEditingNickname}
            setMessage={setMessage}
            message={message}
          />

          {userData ? (
            <div className="space-y-6">
              {/* Weekly streak bar */}
              <WeekActivityPanel
                streakAnimated={streakAnimated}
                userData={userData}
                weekDays={weekDays}
                streakDaysSet={streakDaysSet}
              />

              <ProfileLinkCard
                href="/achievements"
                icon="trophy"
                iconClassName="bg-amber-100 text-amber-600"
                title={t("profile.achievements")}
                hint={
                  totalAchievements > 0
                    ? t("profile.achievementsUnlocked", { unlocked: unlockedAchievements, total: totalAchievements })
                    : t("profile.achievementsAll")
                }
              />

              {/* The streak reminder, language, theme and sign-out live on /settings. */}
              <ProfileLinkCard
                href="/settings"
                icon="gear"
                iconClassName="bg-purple-100 text-purple-600"
                title={t("settings.title")}
                hint={t("settings.hint")}
              />
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center space-y-4">
              <div className="text-gray-400">
                <Icon name="info" className="w-16 h-16 mx-auto" />
              </div>
              <div role="alert" className="text-gray-700 text-lg">
                {fetchError || t("profile.loadFailed")}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void fetchUserData()}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors"
                >
                  {t("profile.reload")}
                </button>
                {/* Kept here as well as on /settings: a student whose profile fails to load can still sign out. */}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="px-6 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold transition-colors"
                >
                  {t("profile.signOut")}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <MobileNav currentPage="profile" />
    </div>
  );
}
