"use client";
import Icon, { ContentIcon } from "@/components/ui/Icon";


import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";
import DesktopNav from "@/components/DesktopNav";
import { UserData } from "@/types";
import { getPublicUserDataById, getUserData } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { useI18n } from "@/lib/i18n/provider";
import { tr } from "@/lib/i18n/translate";

export default function PublicAchievementsPage() {
  const { data: session } = useSession();
  const params = useParams();
  const { t } = useI18n();
  const sessionEmail = session?.user?.email || null;
  const rawUserId = params?.id ? Number(params.id) : NaN;
  const userId = Number.isInteger(rawUserId) && rawUserId > 0 ? rawUserId : null;
  const [userData, setUserData] = useState<UserData | null>(null);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setUserData(null);
      setError(tr("publicProfile.badId"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const { data, error: fetchError } = await getPublicUserDataById(userId);
        if (cancelled) return;
        if (fetchError) {
          if (process.env.NODE_ENV === "development") {
            console.error("Failed to fetch user data:", fetchError);
          }
          setError(fetchError);
        } else if (data) {
          setUserData(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (process.env.NODE_ENV === "development") {
            console.error("Error fetching user data:", err);
          }
          setError(tr("achievements.loadError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!sessionEmail) {
      setCurrentUserData(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await getUserData(sessionEmail);
        if (!cancelled && data) {
          setCurrentUserData(data);
        }
      } catch {
        // Silently fail - not critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionEmail]);

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
                <Icon name="info" className="w-16 h-16 mx-auto" />
              </div>
              <div className="text-gray-600 text-lg mb-4">
                {error || t("publicProfile.notFound")}
              </div>
              <Link
                href="/achievements"
                className="inline-block px-6 py-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-bold rounded-xl hover:shadow-glow transition-all"
              >
                {t("achievements.backTo")}
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
              {t("achievements.all")}
            </h1>
            {!isCurrentUser && (
              <Link
                href={`/profile/${userData.id}`}
                className="text-purple-600 hover:text-pink-600 font-bold text-sm flex items-center gap-1 transition-colors px-3 py-1 rounded-lg hover:bg-white/50"
              >
                <Icon name="arrowLeft" /> {t("achievements.backToProfile")}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-gray-700 font-semibold text-lg">
              {isCurrentUser ? t("achievements.yoursUnlocked") : t("achievements.userUnlocked", { name: userData.nickname || t("achievements.userFallback") })}: <span className="text-purple-600 font-bold">{unlockedCount}</span> / <span className="text-gray-600">{totalCount}</span>
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

      <MobileNav currentPage="achievements" />
    </div>
  );
}
