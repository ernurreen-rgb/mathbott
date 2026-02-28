"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { UserData } from "@/types";
import { getPublicUserDataById, getUserData } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

export default function PublicAchievementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const sessionEmail = session?.user?.email || null;
  const userId = params?.id ? parseInt(params.id as string, 10) : null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentUserData = useCallback(async () => {
    if (!sessionEmail) return;
    try {
      const { data } = await getUserData(sessionEmail);
      if (data) {
        setCurrentUserData(data);
      }
    } catch (err) {
      // Silently fail - not critical
    }
  }, [sessionEmail]);

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
      setError("Ошибка загрузки достижений");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && !isNaN(userId)) {
      void fetchUserData();
      // Also fetch current user data to check if viewing own profile
      if (sessionEmail) {
        void fetchCurrentUserData();
      }
    } else {
      setError("Неверный ID пользователя");
      setLoading(false);
    }
  }, [userId, sessionEmail, fetchUserData, fetchCurrentUserData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="achievements" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-5xl mx-auto">
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
                href="/rating"
                className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-glow transition-all"
              >
                Рейтингке оралу
              </Link>
            </div>
          </div>
        </main>
        <MobileNav currentPage="achievements" />
      </div>
    );
  }

  const unlockedCount = userData?.achievements?.filter(a => a.unlocked).length || 0;
  const totalCount = userData?.achievements?.length || 0;
  // Check if this is current user's profile by comparing user IDs
  const isCurrentUser = currentUserData?.id === userData?.id;

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
              Барлық жетістіктер
            </h1>
            {!isCurrentUser && (
              <Link
                href={`/profile/${userData.id}`}
                className="text-purple-600 hover:text-pink-600 font-bold text-sm flex items-center gap-1 transition-colors px-3 py-1 rounded-lg hover:bg-white/50"
              >
                ← Профильге оралу
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-gray-700 font-semibold text-lg">
              {isCurrentUser ? "Сіздің" : `${userData.nickname || "Пайдаланушының"}`} ашық жетістіктері: <span className="text-purple-600 font-bold">{unlockedCount}</span> / <span className="text-gray-600">{totalCount}</span>
            </p>
          </div>
        </div>

        {userData?.achievements && userData.achievements.length > 0 ? (
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
                    {achievement.icon}
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
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div className="text-gray-600 text-lg">Жетістіктер әлі жүктеліп тұрған жоқ</div>
          </div>
        )}
        </div>
      </main>

      <MobileNav currentPage="achievements" />
    </div>
  );
}
