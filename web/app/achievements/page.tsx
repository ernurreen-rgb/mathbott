"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { UserData } from "@/types";
import { getUserData } from "@/lib/api";

export default function AchievementsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionEmail = session?.user?.email || null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

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
        setUserData(null);
      } else if (data) {
        setUserData(data);
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching user data:", err);
      }
      setUserData(null);
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (sessionEmail) {
      void fetchUserData();
    }
  }, [sessionEmail, status, router, fetchUserData]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center pb-20 md:pb-0">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-600 font-medium">Жүктелуде...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-2">Барлық жетістіктер</h1>
          <p className="text-gray-700 font-semibold text-lg">
            Ашық: <span className="text-purple-600 font-bold">{unlockedCount}</span> / <span className="text-gray-600">{totalCount}</span>
          </p>
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

      <MobileNav currentPage="profile" />
    </div>
  );
}

