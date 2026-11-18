"use client";
import Icon from "@/components/ui/Icon";

import ProfileHeader from "./_components/ProfileHeader";
import WeekActivityPanel from "./_components/WeekActivityPanel";
import StreakReminderCard from "./_components/StreakReminderCard";

import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import MobileNav from "@/components/MobileNav";
import { useRequireAuth } from "@/lib/use-require-auth";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { getUserData, updateNickname } from "@/lib/api";
import { getProfileWeekActivityDaysSet } from "@/lib/week-activity";
import { UserData } from "@/types";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  const { data: session, status } = useRequireAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [streakAnimated, setStreakAnimated] = useState(false);
  const sessionEmail = session?.user?.email || "";

  const weekDays = [
    { short: "Дс", weekDay: 1 }, // Monday
    { short: "Сс", weekDay: 2 }, // Tuesday
    { short: "Ср", weekDay: 3 }, // Wednesday
    { short: "Бс", weekDay: 4 }, // Thursday
    { short: "Жм", weekDay: 5 }, // Friday
    { short: "Сб", weekDay: 6 }, // Saturday
    { short: "Жс", weekDay: 0 }, // Sunday
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
      const t = setTimeout(() => setStreakAnimated(false), 1500);
      return () => clearTimeout(t);
    }
  }, [userData?.streak]);

  const fetchUserData = useCallback(async () => {
    if (!sessionEmail) return;

    setLoading(true);
    try {
      const { data, error } = await getUserData(sessionEmail);
      if (error) {
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch user data:", error);
        }
        // Set default user data so page can still render
        setUserData({
          id: 0,
          email: sessionEmail,
          total_solved: 0,
        });
      } else if (data) {
        setUserData(data);
        setNickname(data.nickname || "");
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching user data:", err);
      }
      // Set default user data so page can still render
      setUserData({
        id: 0,
        email: sessionEmail || "",
        total_solved: 0,
      });
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

    const { error } = await updateNickname(sessionEmail, nickname.trim());
    if (error) {
      setMessage({ type: "error", text: error });
    } else {
      setMessage({ type: "success", text: "Никнейм сәтті жаңартылды!" });
      if (userData) {
        setUserData({ ...userData, nickname: nickname.trim() });
      }
      setIsEditingNickname(false);
      setTimeout(() => setMessage(null), 3000);
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

              {sessionEmail && <StreakReminderCard email={sessionEmail} />}

              <Link
                href="/achievements"
                className="glass flex items-center gap-4 rounded-3xl border border-white/30 p-5 shadow-xl transition-colors hover:border-purple-300"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                  <Icon name="trophy" className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-gray-900">Жетістіктер</span>
                  <span className="block text-sm text-gray-500">
                    {totalAchievements > 0 ? `${unlockedAchievements} / ${totalAchievements} ашылды` : "Барлық жетістіктерді көру"}
                  </span>
                </span>
                <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-gray-400" />
              </Link>

              {/* Logout Button */}
              <div className="glass rounded-2xl shadow-xl p-6 border border-white/30">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-[1.02] text-lg"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Icon name="logOut" className="w-5 h-5" />
                    Аккаунттан шығу
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center">
              <div className="text-gray-400 mb-4">
                <Icon name="info" className="w-16 h-16 mx-auto" />
              </div>
              <div className="text-gray-600 text-lg">Профиль деректерін жүктеу мүмкін болмады</div>
            </div>
          )}
        </div>
      </main>

      <MobileNav currentPage="profile" />
    </div>
  );
}
