"use client";
import AcceptInvitePanel from "./_components/AcceptInvitePanel";
import IncomingRequestsPanel from "./_components/IncomingRequestsPanel";
import InviteDialog from "./_components/InviteDialog";
import ProfileHeader from "./_components/ProfileHeader";
import StatisticsPanel from "./_components/StatisticsPanel";
import WeekActivityPanel from "./_components/WeekActivityPanel";

import MobileNav from "@/components/MobileNav";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";


import DesktopNav from "@/components/DesktopNav";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { acceptFriendInvite, acceptFriendRequest, cancelFriendRequest, createFriendInvite, declineFriendRequest, getFriendInviteDetails, getUserData, listFriendInvites, listFriendRequests, listFriends, removeFriend, revokeFriendInvite, updateNickname } from "@/lib/api";
import { getProfileWeekActivityDaysSet } from "@/lib/week-activity";
import { FriendInvite, FriendInviteDetails, FriendRequestItem, FriendUser, UserData } from "@/types";

export const dynamic = "force-dynamic";

function ProfilePageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [streakAnimated, setStreakAnimated] = useState(false);
  const [inviteDetails, setInviteDetails] = useState<FriendInviteDetails | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteActionMessage, setInviteActionMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showOwnInviteWarning, setShowOwnInviteWarning] = useState(true);
  const [invites, setInvites] = useState<FriendInvite[]>([]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestItem[]>([]);
  const sessionEmail = session?.user?.email || "";

  const normalizeErrorMessage = (value: unknown, fallback: string = "Произошла ошибка"): string => {
    if (typeof value === "string" && value.trim()) return value;
    if (value instanceof Error && value.message) return value.message;
    if (value && typeof value === "object") {
      const obj = value as { detail?: unknown; message?: unknown; error?: unknown };
      if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
      if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
      if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
      try {
        const serialized = JSON.stringify(value);
        if (serialized && serialized !== "{}") return serialized;
      } catch { }
    }
    return fallback;
  };
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsMessage, setFriendsMessage] = useState<string | null>(null);
  const [removingFriends, setRemovingFriends] = useState<Set<number>>(new Set());
  const [requestActions, setRequestActions] = useState<Set<number>>(new Set());
  const inviteToken = searchParams?.get("invite");

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

  useEffect(() => {
    if (userData?.streak && userData.streak > 0) {
      setStreakAnimated(true);
      const t = setTimeout(() => setStreakAnimated(false), 1500);
      return () => clearTimeout(t);
    }
  }, [userData?.streak]);

  // Auto-hide own invite warning after 15 seconds
  useEffect(() => {
    if (inviteDetails && inviteDetails.status === "active" && inviteDetails.inviter.id === userData?.id && showOwnInviteWarning) {
      const timer = setTimeout(() => {
        setShowOwnInviteWarning(false);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [inviteDetails, userData?.id, showOwnInviteWarning]);

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
          total_points: 0,
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
        total_points: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  const buildInviteUrl = (token: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/profile?invite=${token}`;
    }
    return `/profile?invite=${token}`;
  };

  const formatInviteDate = (value?: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("ru-RU");
  };

  const fetchFriendsData = useCallback(async () => {
    if (!sessionEmail) return;
    setFriendsLoading(true);
    setFriendsMessage(null);
    try {
      const [friendsRes, invitesRes, incomingRes, outgoingRes] = await Promise.all([
        listFriends(sessionEmail),
        listFriendInvites(sessionEmail),
        listFriendRequests(sessionEmail, "incoming"),
        listFriendRequests(sessionEmail, "outgoing"),
      ]);

      if (!friendsRes.error && friendsRes.data) {
        setFriends(friendsRes.data.items || []);
      }
      if (!invitesRes.error && invitesRes.data) {
        setInvites(invitesRes.data.items || []);
      }
      if (!incomingRes.error && incomingRes.data) {
        setIncomingRequests(incomingRes.data.items || []);
      }
      if (!outgoingRes.error && outgoingRes.data) {
        setOutgoingRequests(outgoingRes.data.items || []);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching friends data:", err);
      }
      setFriendsMessage("\u0414\u043e\u0441\u0442\u0430\u0440 \u0434\u0435\u0440\u0435\u043a\u0442\u0435\u0440\u0456\u043d \u0436\u04af\u043a\u0442\u0435\u0443 \u0441\u04d9\u0442\u0441\u0456\u0437 \u0430\u044f\u049b\u0442\u0430\u043b\u0434\u044b");
    } finally {
      setFriendsLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (!sessionEmail) {
      setLoading(false);
      return;
    }
    void fetchUserData();
    void fetchFriendsData();
  }, [sessionEmail, fetchUserData, fetchFriendsData]);

  useEffect(() => {
    if (!inviteToken || !sessionEmail) {
      setInviteDetails(null);
      setInviteLoading(false);
      return;
    }

    let cancelled = false;
    setInviteLoading(true);
    setInviteActionMessage(null);

    void (async () => {
      const { data, error } = await getFriendInviteDetails(inviteToken, sessionEmail);
      if (cancelled) return;
      if (error) {
        setInviteDetails(null);
        setInviteActionMessage(typeof error === "string" ? error : "Не удалось загрузить приглашение");
      } else {
        setInviteDetails(data || null);
      }
      setInviteLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken, sessionEmail]);

  const handleCreateInvite = async () => {
    if (!session?.user?.email) return;
    setInviteCreating(true);
    setInviteActionMessage(null);
    try {
      const { data, error } = await createFriendInvite(sessionEmail);
      if (error || !data) {
        // Ensure error is a string
        const errorMessage = typeof error === 'string' ? error : (error || "Не удалось создать приглашение");
        setInviteActionMessage(errorMessage);
        // Auto-hide error message after 5 seconds
        setTimeout(() => setInviteActionMessage(null), 5000);
        return;
      }
      // Clear any previous error messages on success
      setInviteActionMessage(null);
      const url = buildInviteUrl(data.token);
      setInviteLink(url);
      setShowInviteModal(true);
      await fetchFriendsData();
    } catch (err: any) {
      // Handle unexpected errors
      const errorMessage = normalizeErrorMessage(err, "Произошла непредвиденная ошибка");
      setInviteActionMessage(errorMessage);
      setTimeout(() => setInviteActionMessage(null), 5000);
    } finally {
      setInviteCreating(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteActionMessage("Ссылка скопирована");
      setTimeout(() => setInviteActionMessage(null), 2000);
    } catch (err) {
      setInviteActionMessage("Не удалось скопировать ссылку");
    }
  };

  const handleShareInvite = async () => {
    if (!inviteLink) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Приглашение в друзья",
          text: "Присоединяйся ко мне!",
          url: inviteLink,
        });
      } else {
        // Fallback: копируем в буфер обмена
        await handleCopyInvite();
      }
    } catch (err) {
      // Пользователь отменил или произошла ошибка
      if ((err as Error).name !== "AbortError") {
        console.error("Error sharing:", err);
      }
    }
  };

  const handleAcceptInvite = async () => {
    if (!session?.user?.email || !inviteToken) return;
    setInviteLoading(true);
    setInviteActionMessage(null);
    try {
      const { data, error } = await acceptFriendInvite(inviteToken, sessionEmail);
      if (error) {
        setInviteActionMessage(error);
        return;
      }
      if (data?.already_friends) {
        setInviteActionMessage("Вы уже друзья");
      } else {
        setInviteActionMessage("Дружба подтверждена");
      }
      await fetchFriendsData();
      router.replace("/profile");
      setInviteDetails(null);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (token: string) => {
    if (!session?.user?.email) return;
    const { error } = await revokeFriendInvite(token, sessionEmail);
    if (error) {
      setInviteActionMessage(error);
      return;
    }
    setInviteActionMessage("Инвайт отозван");
    setInvites(prevInvites => prevInvites.filter(inv => inv.token !== token));
    setInviteLink(null);
  };

  const handleRemoveFriend = async (friendId: number) => {
    if (!session?.user?.email || removingFriends.has(friendId)) return;

    setRemovingFriends(prev => new Set(prev).add(friendId));
    // Optimistically remove from UI
    const friendToRemove = friends.find(f => f.id === friendId);
    setFriends(prev => prev.filter(f => f.id !== friendId));

    try {
      const { error } = await removeFriend(sessionEmail, friendId);
      if (error) {
        // Revert on error
        if (friendToRemove) {
          setFriends(prev => [...prev, friendToRemove]);
        }
        const errorMessage = normalizeErrorMessage(error);
        setFriendsMessage(errorMessage);
        return;
      }
      // Optionally refresh to ensure sync, but UI is already updated
      fetchFriendsData().catch(() => {
        // Silent refresh failure - UI is already updated
      });
    } finally {
      setRemovingFriends(prev => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  };

  const handleCancelRequest = async (requestId: number) => {
    if (!session?.user?.email || requestActions.has(requestId)) return;
    setRequestActions(prev => new Set(prev).add(requestId));

    // Optimistically remove from outgoing requests
    const requestToCancel = outgoingRequests.find(r => r.id === requestId);
    setOutgoingRequests(prev => prev.filter(r => r.id !== requestId));

    try {
      const { error } = await cancelFriendRequest(sessionEmail, requestId);
      if (error) {
        // Revert on error
        if (requestToCancel) {
          setOutgoingRequests(prev => [...prev, requestToCancel]);
        }
        const errorMessage = normalizeErrorMessage(error);
        setFriendsMessage(errorMessage);
      } else {
        setFriendsMessage(null);
        // Optionally refresh to ensure sync, but UI is already updated
        fetchFriendsData().catch(() => {
          // Silent refresh failure - UI is already updated
        });
      }
    } finally {
      setRequestActions(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleDeclineRequest = async (requestId: number) => {
    if (!session?.user?.email || requestActions.has(requestId)) return;
    setRequestActions(prev => new Set(prev).add(requestId));

    // Optimistically remove from incoming requests
    const requestToDecline = incomingRequests.find(r => r.id === requestId);
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));

    try {
      const { error } = await declineFriendRequest(sessionEmail, requestId);
      if (error) {
        // Revert on error
        if (requestToDecline) {
          setIncomingRequests(prev => [...prev, requestToDecline]);
        }
        const errorMessage = normalizeErrorMessage(error);
        setFriendsMessage(errorMessage);
        return;
      }
      // Optionally refresh to ensure sync, but UI is already updated
      fetchFriendsData().catch(() => {
        // Silent refresh failure - UI is already updated
      });
    } finally {
      setRequestActions(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleAcceptRequest = async (requestId: number) => {
    if (!session?.user?.email || requestActions.has(requestId)) return;
    setRequestActions(prev => new Set(prev).add(requestId));

    // Optimistically remove from incoming requests
    const requestToAccept = incomingRequests.find(r => r.id === requestId);
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));

    try {
      const { error } = await acceptFriendRequest(sessionEmail, requestId);
      if (error) {
        // Revert on error
        if (requestToAccept) {
          setIncomingRequests(prev => [...prev, requestToAccept]);
        }
        // Ensure error is a string
        const errorMessage = normalizeErrorMessage(error);
        setFriendsMessage(errorMessage);
        return;
      }
      // Optionally refresh to ensure sync, but UI is already updated
      // Note: We could also optimistically add to friends, but it's safer to refresh
      fetchFriendsData().catch(() => {
        // Silent refresh failure - UI is already updated
      });
    } finally {
      setRequestActions(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;

    setSaving(true);
    setMessage(null);

    const { data, error } = await updateNickname(sessionEmail, nickname.trim());
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
    return null;
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
              {/* Pending Incoming Friend Requests - перед streak (входящие + исходящие, если есть входящие) */}
              <IncomingRequestsPanel
                incomingRequests={incomingRequests}
                outgoingRequests={outgoingRequests}
                handleAcceptRequest={handleAcceptRequest}
                requestActions={requestActions}
                handleDeclineRequest={handleDeclineRequest}
                handleCancelRequest={handleCancelRequest}
              />

              {/* Weekly streak bar (before statistics) */}
              <WeekActivityPanel
                streakAnimated={streakAnimated}
                userData={userData}
                weekDays={weekDays}
                streakDaysSet={streakDaysSet}
              />

              <AcceptInvitePanel
                inviteToken={inviteToken}
                inviteLoading={inviteLoading}
                inviteDetails={inviteDetails}
                formatInviteDate={formatInviteDate}
                userData={userData}
                showOwnInviteWarning={showOwnInviteWarning}
                handleAcceptInvite={handleAcceptInvite}
                inviteActionMessage={inviteActionMessage}
              />

              {/* Statistics Section */}
              <StatisticsPanel
                userData={userData}
              />

              {/* Achievements Section */}
              {userData?.achievements && userData.achievements.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">Жетістіктер</h3>
                    <Link
                      href={userData?.id ? `/achievements/${userData.id}` : "/achievements"}
                      className="text-purple-600 hover:text-pink-600 font-bold text-sm flex items-center gap-1 transition-colors px-3 py-1 rounded-lg hover:bg-white/50"
                    >
                      Барлық жетістіктер
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                  <div className="glass rounded-2xl shadow-xl p-6 border border-white/30">
                    <div className="grid grid-cols-3 gap-4">
                      {userData.achievements.slice(0, 3).map((achievement) => (
                        <div
                          key={achievement.id}
                          className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all transform hover:scale-110 ${achievement.unlocked
                              ? "bg-gradient-to-br from-yellow-100 via-orange-50 to-pink-50 border-yellow-300 hover:border-yellow-400 shadow-lg hover:shadow-glow"
                              : "bg-gray-100 border-gray-300 opacity-60 grayscale"
                            }`}
                          title={achievement.description}
                        >
                          <div className={`text-4xl mb-2 ${achievement.unlocked ? "" : "opacity-50"}`}>
                            {achievement.icon}
                          </div>
                          <div className={`text-xs font-bold text-center ${achievement.unlocked ? "text-gray-800" : "text-gray-500"
                            }`}>
                            {achievement.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Friends Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">{"\u0414\u043e\u0441\u0442\u0430\u0440"}</h3>
                  <div className="flex items-center gap-3">
                    {friendsLoading && <span className="text-sm text-gray-500">{"\u0416\u04af\u043a\u0442\u0435\u043b\u0443\u0434\u0435..."}</span>}
                    <button
                      onClick={handleCreateInvite}
                      disabled={inviteCreating}
                      className="px-3 py-1.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-glow transition-all disabled:opacity-50 text-sm"
                    >
                      {inviteCreating ? "\u0416\u0430\u0441\u0430\u043b\u0443\u0434\u0430..." : "\u0428\u0430\u049b\u044b\u0440\u0443"}
                    </button>
                  </div>
                </div>
                {inviteActionMessage && typeof inviteActionMessage === 'string' && (
                  <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${inviteActionMessage.includes("скопирована")
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : "bg-red-50 border border-red-200 text-red-700"
                    }`}>
                    {inviteActionMessage.includes("скопирована") ? (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span className="text-sm font-semibold">{inviteActionMessage}</span>
                  </div>
                )}
              </div>
              <div className="glass rounded-3xl shadow-xl p-6 border border-white/30">
                {friendsMessage && (
                  <div className="text-sm text-red-600 mb-3">
                    {friendsMessage || "\u049a\u0430\u0442\u0435 \u043e\u0440\u044b\u043d \u0430\u043b\u0434\u044b"}
                  </div>
                )}

                <div className="space-y-4">
                  {friends.length === 0 ? (
                    <div className="text-sm text-gray-500">{"\u04d8\u0437\u0456\u0440\u0433\u0435 \u0434\u043e\u0441\u0442\u0430\u0440 \u0436\u043e\u049b."}</div>
                  ) : (
                    friends.map((friend) => (
                      <div key={friend.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-100 rounded-lg p-3 bg-white/70">
                        <div
                          onClick={() => router.push(`/profile/${friend.id}`)}
                          className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <div className="text-sm font-semibold text-gray-800">
                            {friend.nickname || "\u041f\u0430\u0439\u0434\u0430\u043b\u0430\u043d\u0443\u0448\u044b"}
                          </div>
                          <div className="text-xs text-gray-500">{"\u04b0\u043f\u0430\u0439: "}{friend.total_points}</div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            disabled={removingFriends.has(friend.id)}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {removingFriends.has(friend.id) ? "..." : "\u04e8\u0448\u0456\u0440\u0443"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Outgoing Friend Requests - после "Друзья" (только если нет входящих) */}
              {(() => {
                const pendingIncoming = incomingRequests.filter(req =>
                  req.status?.toLowerCase() === "pending"
                );
                const pendingOutgoing = outgoingRequests.filter(req =>
                  req.status?.toLowerCase() === "pending"
                );

                // Показывать исходящие заявки только если нет входящих, но есть исходящие
                if (pendingIncoming.length > 0 || pendingOutgoing.length === 0) return null;

                return (
                  <div>
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">{"\u0414\u043e\u0441\u049b\u0430 \u04e9\u0442\u0456\u043d\u0456\u0448\u0442\u0435\u0440"}</h3>
                    <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-white/90 text-gray-900">
                      <div className="text-sm font-semibold text-gray-700 mb-2">{"\u0416\u0456\u0431\u0435\u0440\u0456\u043b\u0433\u0435\u043d"}</div>
                      <div className="space-y-2">
                        {pendingOutgoing.map((req) => (
                          <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">
                                {req.receiver_nickname || "\u041f\u0430\u0439\u0434\u0430\u043b\u0430\u043d\u0443\u0448\u044b"}
                              </div>
                            </div>
                            <button
                              onClick={() => handleCancelRequest(req.id)}
                              disabled={requestActions.has(req.id)}
                              className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {requestActions.has(req.id) ? "..." : "\u0411\u0430\u0441 \u0442\u0430\u0440\u0442\u0443"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Invite Modal */}
              <InviteDialog
                showInviteModal={showInviteModal}
                inviteLink={inviteLink}
                setShowInviteModal={setShowInviteModal}
                userData={userData}
                handleShareInvite={handleShareInvite}
                handleCopyInvite={handleCopyInvite}
                inviteActionMessage={inviteActionMessage}
              />

              {/* Logout Button */}
              <div className="glass rounded-2xl shadow-xl p-6 border border-white/30">
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-glow-pink transform hover:scale-[1.02] text-lg"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Аккаунттан шығу
                  </div>
                </button>
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

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-math" />}>
      <ProfilePageContent />
    </Suspense>
  );
}

