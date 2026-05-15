"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { getAdminLeagueParticipants, getAdminLeagues } from "@/lib/api";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import type { AdminLeagueGroup, AdminLeagueParticipant } from "@/types";

const PARTICIPANTS_LIMIT = 100;

export default function AdminLeaguesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionEmail = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("review", status, sessionEmail);

  const [groups, setGroups] = useState<AdminLeagueGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AdminLeagueGroup | null>(null);
  const [participants, setParticipants] = useState<AdminLeagueParticipant[]>([]);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    return groups.reduce(
      (acc, group) => {
        acc.users += group.total_users;
        acc.named += group.named_users;
        acc.weekPoints += group.week_points;
        acc.totalPoints += group.total_points;
        return acc;
      },
      { users: 0, named: 0, weekPoints: 0, totalPoints: 0 }
    );
  }, [groups]);

  const fetchGroups = useCallback(async () => {
    if (!sessionEmail) return;

    setLoadingGroups(true);
    setError(null);
    const { data, error } = await getAdminLeagues(sessionEmail);
    if (error || !data) {
      setError(error || "Лигаларды жүктеу мүмкін болмады");
      setGroups([]);
      setSelectedGroup(null);
    } else {
      setGroups(data.items);
      setSelectedGroup((current) => {
        if (current && data.items.some((item) => isSameGroup(item, current))) {
          return current;
        }
        return data.items[0] ?? null;
      });
    }
    setLoadingGroups(false);
  }, [sessionEmail]);

  const fetchParticipants = useCallback(async () => {
    if (!sessionEmail || !selectedGroup) return;

    setLoadingParticipants(true);
    setError(null);
    const { data, error } = await getAdminLeagueParticipants(
      sessionEmail,
      selectedGroup.league,
      selectedGroup.league_group,
      { limit: PARTICIPANTS_LIMIT }
    );

    if (error || !data) {
      setError(error || "Қатысушыларды жүктеу мүмкін болмады");
      setParticipants([]);
      setParticipantsTotal(0);
    } else {
      setParticipants(data.items);
      setParticipantsTotal(data.total);
    }
    setLoadingParticipants(false);
  }, [selectedGroup, sessionEmail]);

  useEffect(() => {
    if (accessLoading) return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (sessionEmail) {
      void fetchGroups();
    }
  }, [accessLoading, fetchGroups, router, sessionEmail, status]);

  useEffect(() => {
    if (accessLoading || loadingGroups || !selectedGroup) return;
    void fetchParticipants();
  }, [accessLoading, fetchParticipants, loadingGroups, selectedGroup]);

  if (status === "loading" || accessLoading || loadingGroups) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="admin" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <SkeletonLoader variant="card" className="mb-4" />
          <SkeletonLoader variant="card" className="mb-4" />
          <SkeletonLoader variant="card" className="mb-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <MobileNav currentPage="admin" />

      <main className="md:ml-64 px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Лигалар
            </h1>
            <p className="text-gray-700">
              Лига топтары мен қатысушыларын қарау
            </p>
          </div>

          {error && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatTile label="Топтар" value={groups.length} />
            <StatTile label="Қатысушылар" value={totals.users} />
            <StatTile label="Никнеймі бар" value={totals.named} />
            <StatTile label="Апталық ұпай" value={totals.weekPoints} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
            <section className="glass rounded-3xl shadow-2xl p-5 border border-white/30">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-bold text-gray-900">Топтар</h2>
                <button
                  type="button"
                  onClick={() => void fetchGroups()}
                  className="px-3 py-2 rounded-lg bg-white/70 border border-white/70 text-sm font-semibold text-gray-700 hover:bg-white transition-colors"
                >
                  Жаңарту
                </button>
              </div>

              <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                {groups.map((group) => {
                  const active = selectedGroup ? isSameGroup(group, selectedGroup) : false;
                  return (
                    <button
                      key={`${group.league}-${group.league_group}`}
                      type="button"
                      onClick={() => setSelectedGroup(group)}
                      className={`w-full text-left rounded-2xl border p-4 transition-all ${
                        active
                          ? "bg-purple-100 border-purple-400 shadow-glow"
                          : "bg-white/70 border-white/70 hover:bg-white hover:border-purple-300"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-gray-900">{group.league}</div>
                          <div className="text-sm text-gray-600">Топ {group.league_group + 1}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-900">{group.total_users}</div>
                          <div className="text-xs text-gray-500">адам</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="rounded-full bg-white/80 px-2 py-1">
                          Никнейм: {group.named_users}
                        </span>
                        <span className="rounded-full bg-white/80 px-2 py-1">
                          Апта: {group.week_points}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {groups.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    Лига топтары жоқ
                  </div>
                )}
              </div>
            </section>

            <section className="glass rounded-3xl shadow-2xl p-5 border border-white/30">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedGroup
                      ? `${selectedGroup.league} · Топ ${selectedGroup.league_group + 1}`
                      : "Қатысушылар"}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {participantsTotal} қатысушы
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchParticipants()}
                  disabled={!selectedGroup || loadingParticipants}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:bg-gray-300 hover:bg-blue-700 transition-colors"
                >
                  {loadingParticipants ? "Жүктелуде..." : "Қатысушыларды жаңарту"}
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-white/50 bg-white/70">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-white/80 text-gray-600">
                    <tr>
                      <th className="text-left p-3">#</th>
                      <th className="text-left p-3">Қатысушы</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-right p-3">Апта</th>
                      <th className="text-right p-3">Барлық ұпай</th>
                      <th className="text-right p-3">Шешілген</th>
                      <th className="text-right p-3">Серия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((participant, index) => (
                      <tr
                        key={participant.id}
                        className="border-t border-gray-200 hover:bg-purple-50 cursor-pointer"
                        onClick={() => router.push(`/profile/${participant.id}`)}
                      >
                        <td className="p-3 font-semibold text-gray-700">{index + 1}</td>
                        <td className="p-3">
                          <div className="font-semibold text-gray-900">
                            {participant.nickname || "Никнейм жоқ"}
                          </div>
                          <div className="text-xs text-gray-500">ID: {participant.id}</div>
                        </td>
                        <td className="p-3 text-gray-700">{participant.email || "-"}</td>
                        <td className="p-3 text-right font-semibold text-blue-700">
                          {participant.week_points}
                        </td>
                        <td className="p-3 text-right font-semibold text-gray-900">
                          {participant.total_points}
                        </td>
                        <td className="p-3 text-right text-gray-700">
                          {participant.total_solved}
                        </td>
                        <td className="p-3 text-right text-gray-700">
                          {participant.streak ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {loadingParticipants && (
                  <div className="text-center text-gray-500 py-8">Жүктелуде...</div>
                )}
                {!loadingParticipants && participants.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    Бұл топта қатысушылар жоқ
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function isSameGroup(left: AdminLeagueGroup, right: AdminLeagueGroup): boolean {
  return left.league === right.league && left.league_group === right.league_group;
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl shadow-lg p-4 border border-white/30">
      <div className="text-sm font-semibold text-gray-600">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
    </div>
  );
}
