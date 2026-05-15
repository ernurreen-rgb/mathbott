"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { RatingUser, UserData } from "@/types";
import { getRating, getUserData } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

const GLOBAL_RATING_LIMIT = 100;

export default function RatingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [globalRating, setGlobalRating] = useState<RatingUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionEmail = session?.user?.email || null;

  const fetchRating = useCallback(async () => {
    if (!sessionEmail) return;
    
    setLoading(true);
    
    try {
      const [ratingResult, userResult] = await Promise.all([
        getRating(GLOBAL_RATING_LIMIT),
        getUserData(sessionEmail),
      ]);

      if (userResult.error || !userResult.data) {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch current user:", userResult.error);
        }
        setCurrentUserId(null);
        setCurrentUser(null);
      } else {
        setCurrentUserId(userResult.data.id);
        setCurrentUser(userResult.data);
      }

      const { data, error } = ratingResult;
      if (error) {
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch rating:", error);
        }
        setGlobalRating([]); // Set empty array on error
      } else if (data) {
        setGlobalRating(data);
      } else {
        setGlobalRating([]);
      }
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching rating:", err);
      }
      setGlobalRating([]);
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
      void fetchRating();
    }
  }, [sessionEmail, status, router, fetchRating]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="rating" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-4xl mx-auto">
            <SkeletonLoader variant="card" className="mb-4" />
            <SkeletonLoader variant="card" className="mb-4" />
            <SkeletonLoader variant="card" className="mb-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const currentUserInTop = currentUserId !== null && globalRating.some((user) => user.id === currentUserId);
  const showCurrentUserRow = Boolean(
    currentUser &&
      currentUserId &&
      !currentUserInTop &&
      currentUser.global_position &&
      currentUser.global_position > GLOBAL_RATING_LIMIT
  );

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-4xl">
        
        <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-2xl flex items-center justify-center text-3xl shadow-glow">
              🌍
            </div>
            <div>
              <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">Жаһандық рейтинг</h2>
              <p className="text-sm font-semibold text-gray-700">Барлық лигалардан топ ойыншылар</p>
            </div>
          </div>

          <div className="space-y-3">
            {globalRating.length > 0 ? (
              <>
              {globalRating.map((user, idx) => {
                const isCurrentUser = user.id === currentUserId;
                const hasDefaultNickname = user.nickname?.startsWith("User ") && /User -?\d+/.test(user.nickname);
                // All users are clickable now (for public profiles)
                const isClickable = user.id > 0;

                return (
                  <button
                    type="button"
                    key={user.id}
                    onClick={() => {
                      if (isClickable && user.id) {
                        router.push(`/profile/${user.id}`);
                      }
                    }}
                    disabled={!isClickable}
                    className={`w-full text-left flex justify-between items-center p-5 rounded-2xl border-2 transition-all ${
                      isClickable
                        ? "cursor-pointer hover:shadow-glow hover:border-purple-400"
                        : "hover:shadow-lg"
                    } ${
                      idx < 3
                        ? "bg-gradient-to-r from-purple-100 via-pink-50 to-blue-50 border-purple-300 shadow-glow"
                        : "glass border-white/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
                        idx === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-white" :
                        idx === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-white" :
                        idx === 2 ? "bg-gradient-to-br from-orange-400 to-orange-500 text-white" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">
                          {user.nickname || "Ойыншы"}
                          {hasDefaultNickname && isCurrentUser && (
                            <span className="ml-2 text-xs text-orange-600">(никнеймді орнату үшін)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-blue-600 font-medium">{user.league}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500">{user.total_solved} шешілген</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-gray-800">
                        {user.total_points}
                      </div>
                      <div className="text-xs text-gray-500">ұпай</div>
                    </div>
                  </button>
                );
              })}

              {showCurrentUserRow && currentUser && (
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser.id) {
                      router.push(`/profile/${currentUser.id}`);
                    }
                  }}
                  className="w-full text-left flex justify-between items-center p-5 rounded-2xl border-2 transition-all cursor-pointer hover:shadow-glow hover:border-purple-400 bg-white/90 border-purple-300"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg bg-purple-100 text-purple-700">
                      #{currentUser.global_position}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800">
                        Сіз: {currentUser.nickname || "Ойыншы"}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-blue-600 font-medium">{currentUser.league}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{currentUser.total_solved} шешілген</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg text-gray-800">
                      {currentUser.total_points}
                    </div>
                    <div className="text-xs text-gray-500">ұпай</div>
                  </div>
                </button>
              )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <p>Рейтинг бос</p>
              </div>
            )}
          </div>
        </div>
        </div>
      </main>

      <MobileNav currentPage="rating" />
    </div>
  );
}

