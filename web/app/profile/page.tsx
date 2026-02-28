"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback } from "react";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import MobileNav from "@/components/MobileNav";

const QRCode = nextDynamic(() => import("react-qr-code"), {
  ssr: false,
});
import DesktopNav from "@/components/DesktopNav";
import { BlockedUser, FriendInvite, FriendInviteDetails, FriendRequestItem, FriendUser, UserData } from "@/types";
import { API_URL } from "@/lib/constants";
import { acceptFriendInvite, acceptFriendRequest, blockUser, cancelFriendRequest, createFriendInvite, declineFriendRequest, getFriendInviteDetails, getUserData, listBlockedUsers, listFriendInvites, listFriendRequests, listFriends, removeFriend, revokeFriendInvite, unblockUser, updateNickname } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
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
      } catch {}
    }
    return fallback;
  };
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsMessage, setFriendsMessage] = useState<string | null>(null);
  const [blockingUsers, setBlockingUsers] = useState<Set<number>>(new Set());
  const [removingFriends, setRemovingFriends] = useState<Set<number>>(new Set());
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
  const todayWeekDay = new Date().getDay();

  // === Новый расчет streakDaysSet ===
  const streakDaysSet = new Set<number>();
  if (userData?.streak && userData.streak > 0 && userData?.last_streak_date) {
    // Найдём день недели для последнего streak-дня
    const lastStreakDate = new Date(userData.last_streak_date);
    const lastStreakWeekday = lastStreakDate.getDay();
    const daysToMark = Math.min(userData.streak, 7);
    for (let i = 0; i < daysToMark; i++) {
      // от последнего дня streak — назад
      const dayIndex = (lastStreakWeekday - i + 7) % 7;
      streakDaysSet.add(dayIndex);
    }
  }
  // Если last_streak_date пустой, fallback к старой логике (на случай legacy-данных)
  else if (userData?.streak && userData.streak > 0) {
    const daysToMark = Math.min(userData.streak, 7);
    for (let i = 0; i < daysToMark; i++) {
      const dayIndex = (todayWeekDay - i + 7) % 7;
      streakDaysSet.add(dayIndex);
    }
  }

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
          league: "Қола",
          total_solved: 0,
          week_solved: 0,
          week_points: 0,
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
        league: "Қола",
        total_solved: 0,
        week_solved: 0,
        week_points: 0,
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
      const [friendsRes, invitesRes, incomingRes, outgoingRes, blockedRes] = await Promise.all([
        listFriends(sessionEmail),
        listFriendInvites(sessionEmail),
        listFriendRequests(sessionEmail, "incoming"),
        listFriendRequests(sessionEmail, "outgoing"),
        listBlockedUsers(sessionEmail),
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
      if (!blockedRes.error && blockedRes.data) {
        setBlockedUsers(blockedRes.data.items || []);
      }
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error fetching friends data:", err);
      }
      setFriendsMessage("Не удалось загрузить данные друзей");
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

  const handleBlockUser = async (blockedUserId: number) => {
    if (!session?.user?.email || blockingUsers.has(blockedUserId)) return;
    
    setBlockingUsers(prev => new Set(prev).add(blockedUserId));
    // Optimistically update UI: remove from friends and add to blocked
    const friendToBlock = friends.find(f => f.id === blockedUserId);
    setFriends(prev => prev.filter(f => f.id !== blockedUserId));
    
    if (friendToBlock) {
      // Add to blocked users list immediately
      const blockedUser: BlockedUser = {
        id: friendToBlock.id,
        nickname: friendToBlock.nickname,
        league: friendToBlock.league,
        total_points: friendToBlock.total_points,
        total_solved: friendToBlock.total_solved,
      };
      setBlockedUsers(prev => [...prev, blockedUser]);
    }
    
    try {
      const { error } = await blockUser(sessionEmail, blockedUserId);
      if (error) {
        // Revert on error
        if (friendToBlock) {
          setFriends(prev => [...prev, friendToBlock]);
          setBlockedUsers(prev => prev.filter(b => b.id !== blockedUserId));
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
      setBlockingUsers(prev => {
        const next = new Set(prev);
        next.delete(blockedUserId);
        return next;
      });
    }
  };

  const handleUnblockUser = async (blockedUserId: number) => {
    if (!session?.user?.email || blockingUsers.has(blockedUserId)) return;
    
    setBlockingUsers(prev => new Set(prev).add(blockedUserId));
    // Optimistically remove from blocked users
    const blockedUserToUnblock = blockedUsers.find(b => b.id === blockedUserId);
    setBlockedUsers(prev => prev.filter(b => b.id !== blockedUserId));
    
    try {
      const { error } = await unblockUser(sessionEmail, blockedUserId);
      if (error) {
        // Revert on error
        if (blockedUserToUnblock) {
          setBlockedUsers(prev => [...prev, blockedUserToUnblock]);
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
      setBlockingUsers(prev => {
        const next = new Set(prev);
        next.delete(blockedUserId);
        return next;
      });
    }
  };

  const handleCancelRequest = async (requestId: number) => {
    if (!session?.user?.email) return;
    
    // Optimistically remove from outgoing requests
    const requestToCancel = outgoingRequests.find(r => r.id === requestId);
    setOutgoingRequests(prev => prev.filter(r => r.id !== requestId));
    
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
  };

  const handleDeclineRequest = async (requestId: number) => {
    if (!session?.user?.email) return;
    
    // Optimistically remove from incoming requests
    const requestToDecline = incomingRequests.find(r => r.id === requestId);
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
    
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
  };

  const handleAcceptRequest = async (requestId: number) => {
    if (!session?.user?.email) return;
    
    // Optimistically remove from incoming requests
    const requestToAccept = incomingRequests.find(r => r.id === requestId);
    setIncomingRequests(prev => prev.filter(r => r.id !== requestId));
    
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
        <div className="bg-gradient-to-br from-purple-600 via-pink-600 to-blue-600 rounded-3xl shadow-2xl p-8 mb-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl font-bold border-4 border-white/30">
                {userData?.nickname?.[0]?.toUpperCase() || userData?.email?.[0]?.toUpperCase() || "👤"}
              </div>
              <div className="flex-1">
                {isEditingNickname ? (
                  <form onSubmit={handleSaveNickname} className="space-y-3">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="Никнейміңізді енгізіңіз"
                      maxLength={50}
                      className="w-full px-4 py-2 bg-white/90 text-gray-800 rounded-lg border-2 border-white/50 focus:ring-2 focus:ring-white focus:border-white transition-all outline-none text-xl font-bold"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={saving || !nickname.trim() || nickname.trim() === (userData?.nickname || "")}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                      >
                        {saving ? "..." : "✓"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingNickname(false);
                          setNickname(userData?.nickname || "");
                          setMessage(null);
                        }}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all font-semibold"
                      >
                        ✕
                      </button>
                    </div>
                    {message && (
                      <div
                        className={`text-sm px-3 py-2 rounded-lg ${
                          message.type === "success"
                            ? "bg-green-500/30 text-green-100"
                            : "bg-red-500/30 text-red-100"
                        }`}
                      >
                        {message.text}
                      </div>
                    )}
                  </form>
                ) : (
                  <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-bold mb-1">
                      {userData?.nickname || userData?.email || "Пайдаланушы"}
                    </h2>
                    <button
                      onClick={() => {
                        setIsEditingNickname(true);
                        setNickname(userData?.nickname || "");
                        setMessage(null);
                      }}
                      className="inline-flex items-center justify-center w-9 h-9 bg-white/20 hover:bg-white/30 rounded-lg transition-all backdrop-blur-sm"
                      title="Никнеймді өзгерту"
                    >
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                )}
                <p className="text-blue-100 text-sm">{userData?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {userData ? (
          <div className="space-y-6">
            {/* Pending Incoming Friend Requests - перед streak (входящие + исходящие, если есть входящие) */}
            {(() => {
              // Проверяем статусы в любом регистре
              const pendingIncoming = incomingRequests.filter(req => 
                req.status?.toLowerCase() === "pending"
              );
              const pendingOutgoing = outgoingRequests.filter(req => 
                req.status?.toLowerCase() === "pending"
              );
              
              if (pendingIncoming.length === 0) return null;
              
              return (
                <>
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">Заявки в друзья</h3>
                  <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-white/90 text-gray-900">
                    {/* Входящие заявки */}
                    <div className="text-sm font-semibold text-gray-700 mb-2">Входящие</div>
                    <div className="space-y-2">
                      {pendingIncoming.map((req) => (
                        <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {req.sender_nickname || "Пайдаланушы"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAcceptRequest(req.id)}
                              className="px-3 py-1.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:shadow-glow transition-all text-xs"
                            >
                              Принять
                            </button>
                            <button
                              onClick={() => handleDeclineRequest(req.id)}
                              className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs"
                            >
                              Отклонить
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Исходящие заявки (показывать, если есть входящие) */}
                    {pendingOutgoing.length > 0 && (
                      <>
                        <div className="text-sm font-semibold text-gray-700 mb-2 mt-4">Исходящие</div>
                        <div className="space-y-2">
                          {pendingOutgoing.map((req) => (
                            <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {req.receiver_nickname || "Пайдаланушы"}
                                </div>
                              </div>
                              <button
                                onClick={() => handleCancelRequest(req.id)}
                                className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs"
                              >
                                Отменить
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              );
            })()}

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

            {inviteToken && (
              <div className="glass rounded-3xl shadow-xl p-6 border border-white/30">
                <h3 className="text-xl font-bold mb-2">Приглашение в друзья</h3>
                {inviteLoading && (
                  <p className="text-sm text-gray-600">Загружаю приглашение...</p>
                )}
                {!inviteLoading && inviteDetails && (
                  <div className="space-y-3">
                    {inviteDetails.status === "expired" ? (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div className="flex-1">
                            <h4 className="text-base font-semibold text-red-900 mb-1">Ссылка истекла</h4>
                            <p className="text-sm text-red-700 mb-2">
                              Эта ссылка для добавления в друзья больше не действительна. Срок действия приглашения истек.
                            </p>
                            <p className="text-sm text-red-600 font-medium">
                              Попросите пользователя <span className="font-semibold">{inviteDetails.inviter.nickname || "Пайдаланушы"}</span> отправить вам новую ссылку.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">От:</span>{" "}
                          {inviteDetails.inviter.nickname || "Пайдаланушы"}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">Статус:</span>{" "}
                          {inviteDetails.status === "active"
                            ? "Активно"
                            : inviteDetails.status === "accepted"
                            ? "Уже использовано"
                            : inviteDetails.status === "revoked"
                            ? "Отозвано"
                            : "Истекло"}
                        </div>
                        <div className="text-sm text-gray-700">
                          <span className="font-semibold">Действует до:</span>{" "}
                          {formatInviteDate(inviteDetails.expires_at)}
                        </div>
                        {inviteDetails.status === "active" && (
                          <>
                            {inviteDetails.inviter.id === userData?.id && showOwnInviteWarning ? (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <p className="text-sm text-yellow-800">
                                  Это ваше собственное приглашение. Вы не можете принять его сами. Поделитесь этой ссылкой с другом, чтобы добавить его в друзья.
                                </p>
                              </div>
                            ) : inviteDetails.inviter.id !== userData?.id ? (
                              <button
                                onClick={handleAcceptInvite}
                                disabled={!inviteDetails.can_accept || inviteLoading}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-glow transition-all disabled:opacity-50"
                              >
                                Подтвердить дружбу
                              </button>
                            ) : null}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
                {inviteActionMessage && (
                  <div className="mt-3 text-sm text-gray-700">{inviteActionMessage}</div>
                )}
              </div>
            )}

            {/* Statistics Section */}
            <div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">Статистика</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Ударный режим */}
                <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-orange-50 to-red-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-1">{userData?.streak || 0}</div>
                      <div className="text-sm font-semibold text-gray-700">Қатарынан күн</div>
                    </div>
                  </div>
                </div>

                {/* Очки опыта */}
                <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-yellow-50 to-orange-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent mb-1">{userData.total_points || 0}</div>
                      <div className="text-sm font-semibold text-gray-700">Тәжірибе ұпайлары</div>
                    </div>
                  </div>
                </div>

                {/* Текущая лига */}
                <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-blue-50 to-indigo-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center shadow-glow flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-1">{userData?.league || "Жоқ"}</div>
                      <div className="text-sm font-semibold text-gray-700">Ағымдағы лига</div>
                    </div>
                  </div>
                </div>

                {/* Решено задач */}
                <div className="glass rounded-2xl shadow-xl p-4 border border-white/30 bg-gradient-to-br from-green-50 to-emerald-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-glow-green flex-shrink-0">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-1">
                        {userData?.total_solved || 0}
                      </div>
                      <div className="text-sm font-semibold text-gray-700">Шешілген есептер</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

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
                        className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all transform hover:scale-110 ${
                          achievement.unlocked
                            ? "bg-gradient-to-br from-yellow-100 via-orange-50 to-pink-50 border-yellow-300 hover:border-yellow-400 shadow-lg hover:shadow-glow"
                            : "bg-gray-100 border-gray-300 opacity-60 grayscale"
                        }`}
                        title={achievement.description}
                      >
                        <div className={`text-4xl mb-2 ${achievement.unlocked ? "" : "opacity-50"}`}>
                          {achievement.icon}
                        </div>
                        <div className={`text-xs font-bold text-center ${
                          achievement.unlocked ? "text-gray-800" : "text-gray-500"
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
                <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">Друзья</h3>
                <div className="flex items-center gap-3">
                  {friendsLoading && <span className="text-sm text-gray-500">Загрузка...</span>}
                  <button
                    onClick={handleCreateInvite}
                    disabled={inviteCreating}
                    className="px-3 py-1.5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white font-semibold rounded-lg hover:shadow-glow transition-all disabled:opacity-50 text-sm"
                  >
                    {inviteCreating ? "Создаю..." : "Создать ссылку"}
                  </button>
                </div>
              </div>
              {inviteActionMessage && typeof inviteActionMessage === 'string' && (
                <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
                  inviteActionMessage.includes("скопирована") 
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
                  {friendsMessage || "Произошла ошибка"}
                </div>
              )}

              <div className="space-y-4">
                  {friends.length === 0 ? (
                    <div className="text-sm text-gray-500">Пока нет друзей.</div>
                  ) : (
                    friends.map((friend) => (
                      <div key={friend.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-100 rounded-lg p-3 bg-white/70">
                        <div 
                          onClick={() => router.push(`/profile/${friend.id}`)}
                          className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <div className="text-sm font-semibold text-gray-800">
                            {friend.nickname || "Пайдаланушы"}
                          </div>
                          <div className="text-xs text-gray-500">
                            Лига: {friend.league || "—"} · Очки: {friend.total_points}
                          </div>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            disabled={removingFriends.has(friend.id)}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {removingFriends.has(friend.id) ? "..." : "Удалить"}
                          </button>
                          <button
                            onClick={() => handleBlockUser(friend.id)}
                            disabled={blockingUsers.has(friend.id)}
                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {blockingUsers.has(friend.id) ? "..." : "Заблокировать"}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Заблокированные</div>
                    {blockedUsers.length === 0 ? (
                      <div className="text-sm text-gray-500">Нет заблокированных пользователей.</div>
                    ) : (
                      <div className="space-y-2">
                        {blockedUsers.map((blocked) => (
                          <div key={blocked.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3 bg-white/70">
                            <div 
                              onClick={() => router.push(`/profile/${blocked.id}`)}
                              className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <div className="text-sm font-semibold text-gray-800">
                                {blocked.nickname || "Пайдаланушы"}
                              </div>
                              <div className="text-xs text-gray-500">
                                Лига: {blocked.league || "—"} · Очки: {blocked.total_points}
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnblockUser(blocked.id);
                              }}
                              disabled={blockingUsers.has(blocked.id)}
                              className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {blockingUsers.has(blocked.id) ? "..." : "Разблокировать"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-4">Заявки в друзья</h3>
                  <div className="glass rounded-3xl shadow-xl p-4 border border-white/30 bg-white/90 text-gray-900">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Исходящие</div>
                    <div className="space-y-2">
                      {pendingOutgoing.map((req) => (
                        <div key={req.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {req.receiver_nickname || "Пайдаланушы"}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelRequest(req.id)}
                            className="px-3 py-1.5 bg-gray-200 border border-gray-300 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-all text-xs"
                          >
                            Отменить
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Invite Modal */}
            {showInviteModal && inviteLink && (
              <div 
                className="fixed top-0 left-0 md:left-64 right-0 bottom-0 bg-black/50 z-[9999] flex items-center justify-center p-4" 
                onClick={() => setShowInviteModal(false)}
              >
                <div 
                  className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{userData?.nickname || "Пайдаланушы"}</h3>
                    </div>
                    <button
                      onClick={() => setShowInviteModal(false)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="bg-gray-100 rounded-xl p-8 flex items-center justify-center mb-6">
                    <div className="bg-white p-4 rounded-lg">
                      <QRCode
                        value={inviteLink}
                        size={192}
                        level="H"
                        style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleShareInvite}
                      className="flex-1 flex flex-col items-center justify-center py-4 px-6 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      <svg className="w-6 h-6 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-700">Поделиться</span>
                    </button>
                    <button
                      onClick={handleCopyInvite}
                      className="flex-1 flex flex-col items-center justify-center py-4 px-6 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                    >
                      <svg className="w-6 h-6 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-700">Скопировать</span>
                    </button>
                  </div>
                  
                  {inviteActionMessage && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 animate-fade-in">
                      <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm font-semibold text-green-700">{inviteActionMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

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

