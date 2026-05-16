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

const TEXT = {
  title: "\u0416\u0430\u04bb\u0430\u043d\u0434\u044b\u049b \u0440\u0435\u0439\u0442\u0438\u043d\u0433",
  subtitle:
    "\u0411\u0430\u0440\u043b\u044b\u049b \u043b\u0438\u0433\u0430\u043b\u0430\u0440\u0434\u0430\u043d \u0442\u043e\u043f \u043e\u0439\u044b\u043d\u0448\u044b\u043b\u0430\u0440",
  you: "\u0421\u0456\u0437",
  player: "\u041e\u0439\u044b\u043d\u0448\u044b",
  solved: "\u0448\u0435\u0448\u0456\u043b\u0433\u0435\u043d",
  points: "\u04b1\u043f\u0430\u0439",
  empty: "\u0420\u0435\u0439\u0442\u0438\u043d\u0433 \u0431\u043e\u0441",
  nicknameHint:
    "\u043d\u0438\u043a\u043d\u0435\u0439\u043c\u0434\u0456 \u043e\u0440\u043d\u0430\u0442\u0443 \u04af\u0448\u0456\u043d",
};

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
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch rating:", error);
        }
        setGlobalRating([]);
      } else if (data) {
        setGlobalRating(data);
      } else {
        setGlobalRating([]);
      }
    } catch (err) {
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

  const showCurrentUserSummary = Boolean(
    currentUser &&
      currentUserId !== null &&
      currentUser.global_position
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
                {"\u{1F30D}"}
              </div>
              <div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                  {TEXT.title}
                </h2>
                <p className="text-sm font-semibold text-gray-700">
                  {TEXT.subtitle}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {globalRating.length > 0 ? (
                <>
                  {showCurrentUserSummary && currentUser && (
                    <RatingButton
                      rank={`#${currentUser.global_position}`}
                      name={`${TEXT.you}: ${currentUser.nickname || TEXT.player}`}
                      league={currentUser.league}
                      solved={currentUser.total_solved}
                      points={currentUser.total_points}
                      highlighted
                      onClick={() => router.push(`/profile/${currentUser.id}`)}
                    />
                  )}

                  {globalRating.map((user, idx) => {
                    const isCurrentUser = user.id === currentUserId;
                    const hasDefaultNickname =
                      user.nickname?.startsWith("User ") &&
                      /User -?\d+/.test(user.nickname);
                    const isClickable = user.id > 0;

                    return (
                      <RatingButton
                        key={user.id}
                        rank={idx < 3 ? getMedal(idx) : String(idx + 1)}
                        name={user.nickname || TEXT.player}
                        hint={
                          hasDefaultNickname && isCurrentUser
                            ? `(${TEXT.nicknameHint})`
                            : undefined
                        }
                        league={user.league}
                        solved={user.total_solved}
                        points={user.total_points}
                        podium={idx < 3}
                        highlighted={isCurrentUser}
                        disabled={!isClickable}
                        onClick={() => {
                          if (isClickable) {
                            router.push(`/profile/${user.id}`);
                          }
                        }}
                      />
                    );
                  })}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  <p>{TEXT.empty}</p>
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

function RatingButton({
  rank,
  name,
  hint,
  league,
  solved,
  points,
  podium = false,
  highlighted = false,
  disabled = false,
  onClick,
}: {
  rank: string;
  name: string;
  hint?: string;
  league: string;
  solved: number;
  points: number;
  podium?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left flex justify-between items-center p-5 rounded-2xl border-2 transition-all ${
        disabled ? "hover:shadow-lg" : "cursor-pointer hover:shadow-glow hover:border-purple-400"
      } ${
        highlighted
          ? "bg-white/95 border-purple-400 shadow-glow"
          : podium
            ? "bg-gradient-to-r from-purple-100 via-pink-50 to-blue-50 border-purple-300 shadow-glow"
            : "glass border-white/30"
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg ${
            getRankClass(rank, highlighted)
          }`}
        >
          {rank}
        </div>
        <div>
          <div className="font-semibold text-gray-800">
            {name}
            {hint && <span className="ml-2 text-xs text-orange-600">{hint}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-blue-600 font-medium">{league}</span>
            <span className="text-gray-400">{"\u2022"}</span>
            <span className="text-gray-500">
              {solved} {TEXT.solved}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-bold text-lg text-gray-800">{points}</div>
        <div className="text-xs text-gray-500">{TEXT.points}</div>
      </div>
    </button>
  );
}

function getMedal(index: number): string {
  if (index === 0) return "\u{1F947}";
  if (index === 1) return "\u{1F948}";
  return "\u{1F949}";
}

function getRankClass(rank: string, highlighted: boolean): string {
  if (highlighted) return "bg-purple-100 text-purple-700";
  if (rank === "\u{1F947}") return "bg-gradient-to-br from-yellow-400 to-yellow-500 text-white";
  if (rank === "\u{1F948}") return "bg-gradient-to-br from-gray-300 to-gray-400 text-white";
  if (rank === "\u{1F949}") return "bg-gradient-to-br from-orange-400 to-orange-500 text-white";
  return "bg-gray-100 text-gray-600";
}
