"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { RatingUser } from "@/types";
import { ALL_LEAGUES, LEAGUE_COLORS, LEAGUE_ICONS } from "@/lib/constants";
import { getRating, getUserData } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

export default function LeaguePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionEmail = session?.user?.email || null;
  const [leaguesData, setLeaguesData] = useState<Record<string, RatingUser[]>>({});
  const [userLeague, setUserLeague] = useState<string>("");
  const [userPosition, setUserPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);

  const fetchAllLeagues = useCallback(async () => {
    if (!sessionEmail) return;

    setLoading(true);
    
    try {
      // Get user data to know their league
      const { data: userData, error: userError } = await getUserData(sessionEmail);
      
      if (userError || !userData) {
        // Only log in development
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch user data:", userError);
        }
        setLoading(false);
        return;
      }
      
      setUserLeague(userData.league || "");
      setUserPosition(userData.league_position ?? null);

      // Fetch rating ONLY for user's league
      const leagues: Record<string, RatingUser[]> = {};
      for (const league of ALL_LEAGUES) {
        if (league === userData.league) {
          // Only fetch rating for user's league
          try {
            const { data: leagueData, error: leagueError } = await getRating(50, league);
            if (leagueError) {
              // Only log in development
              if (process.env.NODE_ENV === "development") {
                console.error(`Failed to fetch rating for league ${league}:`, leagueError);
              }
              leagues[league] = [];
            } else {
              leagues[league] = leagueData || [];
            }
          } catch (err) {
            // Only log in development
            if (process.env.NODE_ENV === "development") {
              console.error(`Error fetching rating for league ${league}:`, err);
            }
            leagues[league] = [];
          }
        } else {
          // All other leagues are empty
          leagues[league] = [];
        }
      }
      setLeaguesData(leagues);
      // Expand user's league by default
      setExpandedLeague(userData.league);
    } catch (err) {
      // Only log in development
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching leagues:", err);
      }
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
      void fetchAllLeagues();
    }
  }, [sessionEmail, status, router, fetchAllLeagues]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="league" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="max-w-4xl mx-auto">
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


  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-5xl">
        <div className="mb-6">
          {userPosition && userLeague && (
            <div className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 rounded-2xl p-5 text-white shadow-2xl border-2 border-white/30">
              <div className="text-sm text-blue-100 mb-1 font-semibold">Сіздің лигаңыз: {userLeague}</div>
              <div className="text-3xl font-bold">Орын: {userPosition}</div>
            </div>
          )}
        </div>

        {/* Horizontal league selector */}
        <div className="mb-6 overflow-x-auto overflow-y-hidden -mx-4 px-4">
          <div className="flex gap-3 pb-2 flex-nowrap justify-center w-full">
          {ALL_LEAGUES.map((league) => {
            const isUserLeague = league === userLeague;
            const isExpanded = expandedLeague === league;
            const rating = leaguesData[league] || [];
            
            return (
               <button
                 key={league}
                  onClick={async () => {
                    if (isExpanded) {
                      setExpandedLeague(null);
                    } else {
                      setExpandedLeague(league);
                      // Fetch rating if not loaded yet
                      if (rating.length === 0 && league !== userLeague) {
                        const { data: leagueData } = await getRating(50, league);
                        if (leagueData) {
                          setLeaguesData({ ...leaguesData, [league]: leagueData });
                        }
                      }
                    }
                  }}
                  title={league}
                  aria-label={league}
                  className={`flex-shrink-0 flex flex-col items-center gap-2 p-2 rounded-xl transition-transform ${
                    isExpanded ? "scale-[1.2]" : "scale-100"
                  } text-white`}
                >
                  <span className="text-4xl">{LEAGUE_ICONS[league] || "🏅"}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Expanded league content */}
        {expandedLeague && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-blue-400 ring-2 ring-blue-200">
            <div className={`rounded-t-xl p-4 text-white ${
              expandedLeague === "Қола" ? "bg-gradient-to-r from-orange-600 to-orange-800" :
              expandedLeague === "Күміс" ? "bg-gradient-to-r from-gray-400 to-gray-600" :
              expandedLeague === "Алтын" ? "bg-gradient-to-r from-yellow-400 to-yellow-600" :
              expandedLeague === "Платина" ? "bg-gradient-to-r from-cyan-400 to-cyan-600" :
              expandedLeague === "Алмас" ? "bg-gradient-to-r from-purple-500 to-purple-700" :
              "bg-gradient-to-r from-gray-400 to-gray-600"
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{LEAGUE_ICONS[expandedLeague] || "🏅"}</span>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white drop-shadow-md">{expandedLeague}</h3>
                  <p className="text-sm text-white/90 drop-shadow-sm">
                    {leaguesData[expandedLeague]?.length > 0 
                      ? `${leaguesData[expandedLeague].length} игроков` 
                      : "Пусто"}
                  </p>
                </div>
                {expandedLeague === userLeague && (
                  <span className="bg-white/30 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white drop-shadow-md border border-white/40">
                    Сіздің лигаңыз
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto">
              {!leaguesData[expandedLeague] || leaguesData[expandedLeague].length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm">Бұл лигада әлі ойыншылар жоқ</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaguesData[expandedLeague].map((user, idx) => {
                    const isCurrentUser = user.email === session?.user?.email;
                    const hasDefaultNickname = user.nickname?.startsWith("User ") && /User -?\d+/.test(user.nickname);
                    // All users are clickable now (for public profiles)
                    const isClickable = user.email && true;
                    
                    return (
                      <div
                        key={user.id}
                        onClick={() => {
                          if (isClickable && user.id) {
                            router.push(`/profile/${user.id}`);
                          }
                        }}
                        className={`flex justify-between items-center p-3 rounded-lg border transition-all ${
                          isClickable
                            ? "cursor-pointer hover:shadow-glow hover:border-purple-400"
                            : "hover:shadow-md"
                        } ${
                          idx < 3
                            ? "bg-gradient-to-r from-purple-100 via-pink-50 to-blue-50 border-purple-300 shadow-glow"
                            : isCurrentUser
                            ? "bg-green-50 border-green-300 ring-1 ring-green-200"
                            : "glass border-white/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                            idx === 0 ? "bg-gradient-to-br from-yellow-400 to-yellow-500 text-white" :
                            idx === 1 ? "bg-gradient-to-br from-gray-300 to-gray-400 text-white" :
                            idx === 2 ? "bg-gradient-to-br from-orange-400 to-orange-500 text-white" :
                            "bg-gray-200 text-gray-600"
                          }`}>
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                          </div>
                          <div>
                            <div className={`font-semibold text-sm ${
                              isCurrentUser 
                                ? "text-green-700" 
                                : "text-gray-800"
                            }`}>
                              {user.nickname || user.email?.split("@")[0] || "Ойыншы"}
                              {hasDefaultNickname && isCurrentUser && (
                                <span className="ml-2 text-xs text-orange-600">(никнеймді орнату үшін)</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{user.total_solved} шешілген</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${
                            isCurrentUser 
                              ? "text-green-600" 
                              : "text-gray-800"
                          }`}>
                            {user.week_points}
                          </div>
                          <div className="text-xs text-gray-500">ұпай</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </main>

      <MobileNav currentPage="league" />
    </div>
  );
}

