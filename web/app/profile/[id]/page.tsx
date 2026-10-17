"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { FriendStatus, UserData } from "@/types";
import { getFriendStatus, getPublicUserDataById, sendFriendRequest } from "@/lib/api";
import { getProfileWeekActivityDaysSet } from "@/lib/week-activity";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

export default function PublicProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const userId = params?.id ? parseInt(params.id as string, 10) : null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streakAnimated, setStreakAnimated] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [friendStatusLoading, setFriendStatusLoading] = useState(false);
  const [friendActionMessage, setFriendActionMessage] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

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
      setError("Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userData?.streak && userData.streak > 0) {
      setStreakAnimated(true);
      const t = setTimeout(() => setStreakAnimated(false), 1500);
      return () => clearTimeout(t);
    }
  }, [userData?.streak]);

  useEffect(() => {
    if (userId && !isNaN(userId)) {
      fetchUserData();
    } else {
      setError("Неверный ID пользователя");
      setLoading(false);
    }
  }, [userId, fetchUserData]);

  useEffect(() => {
    const userEmail = session?.user?.email;
    if (!userEmail || !userId || isNaN(userId)) {
      setFriendStatus(null);
      return;
    }
    const loadStatus = async () => {
      setFriendStatusLoading(true);
      const { data, error: statusError } = await getFriendStatus(userEmail, userId);
      if (statusError) {
        // Ensure error is always a string
        const errorString = typeof statusError === 'string' ? statusError : JSON.stringify(statusError);
        setFriendActionMessage(errorString);
        setFriendStatus(null);
      } else if (data) {
        setFriendStatus(data);
      }
      setFriendStatusLoading(false);
    };
    loadStatus();
  }, [session?.user?.email, userId]);

  const handleSendFriendRequest = async () => {
    const userEmail = session?.user?.email;
    // Prevent multiple simultaneous requests
    if (!userEmail || !userId || friendActionLoading || friendStatusLoading) return;
    
    // Also check if request is already pending - don't allow sending again
    if (friendStatus?.has_pending_outgoing) return;
    
    setFriendActionLoading(true);
    setFriendActionMessage(null);
    const { error: requestError } = await sendFriendRequest(userEmail, userId);
    
    // Always refresh friend status after sending request (even if error)
    // This ensures UI shows correct state (e.g., hides button if request already pending)
    const { data } = await getFriendStatus(userEmail, userId);
    if (data) {
      setFriendStatus(data);
    }
    
    if (requestError) {
      // If error is "Request already pending" or similar, show friendly message
      // Ensure error is always a string (handle both string and object cases)
      let errorString: string;
      if (typeof requestError === 'string') {
        errorString = requestError;
      } else if (requestError && typeof requestError === 'object') {
        // Try to extract meaningful error message from object
        errorString = (requestError as any).detail || 
                     (requestError as any).message || 
                     (requestError as any).error ||
                     JSON.stringify(requestError);
      } else {
        errorString = String(requestError);
      }
      
      const errorLower = errorString.toLowerCase();
      if (errorLower.includes('already pending') || 
          errorLower.includes('уже отправлен') ||
          errorLower.includes('request already') ||
          errorLower.includes('запрос уже')) {
        // Don't show error message if status shows pending request (button will be hidden)
        if (data?.has_pending_outgoing) {
          setFriendActionMessage(null); // Clear message since button will be hidden
        } else {
          setFriendActionMessage("Сұраныс жіберілген");
        }
      } else {
        setFriendActionMessage(errorString);
      }
    } else {
      setFriendActionMessage("Сұраныс жіберілді");
    }
    
    setFriendActionLoading(false);
  };

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
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-gray-600 text-lg mb-4">
                {error || "Пайдаланушы табылмады"}
              </div>
              <Link
                href="/modules"
                className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-glow transition-all"
              >
                Модульдерге оралу
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
                {userData?.nickname?.[0]?.toUpperCase() || "👤"}
              </div>
              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-1">
                  {userData?.nickname || "Пайдаланушы"}
                </h2>
                {session?.user?.email && friendStatus && !friendStatus.is_self && !friendStatus.is_blocked && !friendStatus.is_friend && (
                  <div className="mt-2">
                    {friendStatus.has_pending_outgoing ? (
                      <span className="text-sm text-blue-100">Сұраныс жіберілген</span>
                    ) : (
                      <button
                        onClick={handleSendFriendRequest}
                        disabled={friendActionLoading || friendStatusLoading}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all text-sm font-semibold"
                      >
                        {friendActionLoading ? "Жіберілуде..." : "Дос ретінде қосу"}
                      </button>
                    )}
                  </div>
                )}
                {friendStatus?.is_friend && (
                  <div className="mt-2 text-sm text-blue-100">Сіздер доссыздар</div>
                )}
                {friendStatus?.is_blocked && (
                  <div className="mt-2 text-sm text-blue-100">Нельзя добавить в друзья</div>
                )}
                {friendActionMessage && !friendStatus?.has_pending_outgoing && (
                  <div className="mt-2 text-sm text-blue-100">{friendActionMessage}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {userData ? (
          <div className="space-y-6">
            {/* Weekly streak bar (before statistics) */}
            <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-slate-900/80 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-glow ${streakAnimated ? "animate-bounce" : ""}`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                      />
                    </svg>
                  </div>
                  <div className={`flex items-baseline gap-1 ${streakAnimated ? "animate-pulse" : ""}`}>
                    <span className="text-2xl font-extrabold text-orange-500">{userData?.streak || 0}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-500">күн</span>
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
                        <svg
                          className={`w-3 h-3 ${isActive ? "text-white" : "text-slate-400"}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                          />
                        </svg>
                      </div>
                      <span className="text-[11px] font-semibold text-black">{day.short}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-12 border border-gray-100 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
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
