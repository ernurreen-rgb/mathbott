"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { getAdminStatistics, getOnboardingStatistics } from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import StatsKpiGrid from "@/components/admin/statistics/StatsKpiGrid";
import StatsChartsSection from "@/components/admin/statistics/StatsChartsSection";
import StatsLegacySections from "@/components/admin/statistics/StatsLegacySections";
import type { AdminStatistics, OnboardingStatistics } from "@/types";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

export default function StatisticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const sessionEmail = session?.user?.email || null;
  const { loading: accessLoading } = useAdminPageAccess("review", status, sessionEmail);
  const [stats, setStats] = useState<AdminStatistics | null>(null);
  const [onboardingStats, setOnboardingStats] = useState<OnboardingStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatistics = useCallback(async () => {
    if (!sessionEmail) return;
    
    setLoading(true);
    setError(null);
    try {
      const [statsResult, onboardingResult] = await Promise.all([
        getAdminStatistics(sessionEmail),
        getOnboardingStatistics(sessionEmail)
      ]);
      
      if (statsResult.error) {
        setError(statsResult.error);
      } else if (statsResult.data) {
        setStats(statsResult.data);
      }
      
      if (onboardingResult.data) {
        setOnboardingStats(onboardingResult.data);
      }
    } catch (e: any) {
      setError(e?.message || "Статистиканы жүктеу қатесі");
    } finally {
      setLoading(false);
    }
  }, [sessionEmail]);

  useEffect(() => {
    if (accessLoading) return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (sessionEmail) {
      void fetchStatistics();
    }
  }, [sessionEmail, status, router, fetchStatistics, accessLoading]);

  if (status === "loading" || accessLoading || loading) {
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

  if (error || !stats) {
    return (
      <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
        <DesktopNav />
        <MobileNav currentPage="admin" />
        <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error || "Статистиканы жүктеу мүмкін болмады"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5"></div>
      <DesktopNav />
      <MobileNav currentPage="admin" />
      <main className="md:ml-64 flex justify-center px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="w-full max-w-7xl">
          <div className="mb-6">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent mb-2">
              Админ статистикасы
            </h1>
            <p className="text-gray-700">Платформаның жалпы статистикасы</p>
          </div>
          <StatsKpiGrid stats={stats} />

          <StatsChartsSection stats={stats} />

          <StatsLegacySections>
          {/* 2. User Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Пайдаланушылар статистикасы</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <StatCard label="Тіркелген (бүгін)" value={stats.users_registered_today} />
              <StatCard label="Тіркелген (апта)" value={stats.users_registered_week} />
              <StatCard label="Тіркелген (ай)" value={stats.users_registered_month} />
              <StatCard label="Белсенді (бүгін)" value={stats.active_users_today} />
              <StatCard label="Белсенді (апта)" value={stats.active_users_week} />
              <StatCard label="Белсенді (ай)" value={stats.active_users_month} />
            </div>
            
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">Орташа көрсеткіштер</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Орташа шешілген" value={stats.avg_user_stats.avg_solved.toFixed(1)} />
                <StatCard label="Орташа ұпай" value={stats.avg_user_stats.avg_points.toFixed(1)} />
                <StatCard label="Орташа серия" value={stats.avg_user_stats.avg_streak.toFixed(1)} />
                <StatCard label="Орташа апталық ұпай" value={stats.avg_user_stats.avg_week_points.toFixed(1)} />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <TopUsersTable title="Топ-10 ұпай бойынша" users={stats.top_users_by_points} />
              <TopUsersTable title="Топ-10 шешілген бойынша" users={stats.top_users_by_solved} />
              <TopUsersTable title="Топ-10 серия бойынша" users={stats.top_users_by_streak} />
            </div>
          </div>

          {/* 3. Task Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Есептер статистикасы</h2>
            
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3">Сұрақ түрлері бойынша</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {stats.question_type_stats.map((q) => (
                  <div key={q.question_type} className="bg-white/70 rounded-lg p-4">
                    <div className="font-semibold">{q.question_type.toUpperCase()}</div>
                    <div className="text-sm text-gray-600">Барлығы: {q.total}</div>
                    <div className="text-sm text-gray-600">Дұрыс: {q.correct}</div>
                    <div className="text-sm font-bold text-purple-600">Табыс: {q.success_rate}%</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <TaskTable title="Ең танымал есептер" tasks={stats.popular_tasks} />
              <TaskTable title="Ең қиын есептер" tasks={stats.difficult_tasks} />
              <TaskTable title="Ең оңай есептер" tasks={stats.easy_tasks} />
            </div>
          </div>

          {/* 4. Activity Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Белсенділік статистикасы</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">Апта күндері бойынша</h3>
                <div className="space-y-2">
                  {stats.activity_by_day.map((day) => (
                    <div key={day.day_name} className="flex justify-between items-center bg-white/70 rounded p-2">
                      <span>{day.day_name}</span>
                      <span className="font-bold">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">Сағаттар бойынша</h3>
                <div className="grid grid-cols-4 gap-2">
                  {stats.activity_by_hour.map((hour) => (
                    <div key={hour.hour} className="bg-white/70 rounded p-2 text-center">
                      <div className="text-xs text-gray-600">{hour.hour}:00</div>
                      <div className="font-bold">{hour.count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3">Тренд (соңғы 30 күн)</h3>
              <div className="bg-white/70 rounded-lg p-4 max-h-64 overflow-y-auto">
                <div className="space-y-1">
                  {stats.activity_trends.slice(-10).map((trend) => (
                    <div key={trend.date} className="flex justify-between text-sm">
                      <span>{trend.date}</span>
                      <span>{trend.count} шешім ({trend.unique_users} пайдаланушы)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 5. Achievement Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Жетістіктер статистикасы</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.achievement_distribution.slice(0, 8).map((ach) => (
                <div key={ach.achievement_id} className="bg-white/70 rounded-lg p-4">
                  <div className="font-semibold text-sm">{ach.achievement_id}</div>
                  <div className="text-2xl font-bold text-purple-600">{ach.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Trial Test Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Сынақ тесттері статистикасы</h2>
            <div className="space-y-4">
              {stats.trial_test_stats.map((test) => (
                <div key={test.id} className="bg-white/70 rounded-lg p-4">
                  <div className="font-semibold">{test.title}</div>
                  <div className="grid grid-cols-3 gap-4 mt-2 text-sm">
                    <div>Аяқталған: {test.completions}</div>
                    <div>Орташа балл: {test.avg_percentage?.toFixed(1) || 0}%</div>
                    <div>Пайдаланушылар: {test.unique_users}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3">Нәтижелердің таралуы</h3>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {stats.trial_test_results_distribution.map((dist) => (
                  <div key={dist.range} className="bg-white/70 rounded p-2 text-center">
                    <div className="text-xs text-gray-600">{dist.range}</div>
                    <div className="font-bold">{dist.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 7. Report Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Хабарламалар статистикасы</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {stats.report_status_distribution.map((status) => (
                <div key={status.status} className="bg-white/70 rounded-lg p-4 text-center">
                  <div className="text-sm text-gray-600">{status.status}</div>
                  <div className="text-2xl font-bold">{status.count}</div>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <div className="bg-white/70 rounded-lg p-4">
                <div className="text-sm text-gray-600">Орташа шешу уақыты</div>
                <div className="text-2xl font-bold">{stats.avg_report_resolution_time} сағат</div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-3">Ең проблемалы есептер</h3>
              <div className="space-y-2">
                {stats.problematic_tasks.slice(0, 5).map((task) => (
                  <div key={task.task_id} className="bg-white/70 rounded p-3">
                    <div className="font-semibold text-sm">{task.text}</div>
                    <div className="text-xs text-red-600">Хабарламалар: {task.report_count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 8. League Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Лигалар статистикасы</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">Таралу</h3>
                <div className="space-y-2">
                  {stats.league_distribution.map((league) => (
                    <div key={league.league} className="flex justify-between items-center bg-white/70 rounded p-2">
                      <span>{league.league}</span>
                      <span className="font-bold">{league.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">Орташа көрсеткіштер</h3>
                <div className="space-y-2">
                  {stats.league_averages.map((avg) => (
                    <div key={avg.league} className="bg-white/70 rounded p-3">
                      <div className="font-semibold">{avg.league}</div>
                      <div className="text-sm text-gray-600">
                        Шешілген: {avg.avg_solved?.toFixed(1) || 0} | 
                        Ұпай: {avg.avg_points?.toFixed(1) || 0} | 
                        Серия: {avg.avg_streak?.toFixed(1) || 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 9. Time-based Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Уақыт бойынша статистика</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-3">Тіркелулер (соңғы 90 күн)</h3>
                <div className="bg-white/70 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-1">
                    {stats.registrations_over_time.slice(-15).map((reg) => (
                      <div key={reg.date} className="flex justify-between text-sm">
                        <span>{reg.date}</span>
                        <span className="font-bold">{reg.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">Шешімдер (соңғы 90 күн)</h3>
                <div className="bg-white/70 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-1">
                    {stats.solutions_over_time.slice(-15).map((sol) => (
                      <div key={sol.date} className="flex justify-between text-sm">
                        <span>{sol.date}</span>
                        <span>{sol.count} (дұрыс: {sol.correct})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 10. Module Statistics */}
          <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Модульдер статистикасы</h2>
            <div className="space-y-3">
              {stats.module_progress.map((module) => (
                <div key={module.id} className="bg-white/70 rounded-lg p-4">
                  <div className="font-semibold text-lg">{module.name}</div>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <div className="text-sm text-gray-600">Прогрессі бар пайдаланушылар</div>
                      <div className="text-xl font-bold text-purple-600">{module.users_with_progress || 0}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Аяқталған есептер</div>
                      <div className="text-xl font-bold text-green-600">{module.tasks_completed || 0}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 11. Onboarding Statistics */}
          {onboardingStats && (
            <div className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Онбординг опросы статистикасы</h2>
              
              <div className="mb-6">
                <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg p-4 text-white">
                  <div className="text-sm mb-1">Барлығы опрос өткен</div>
                  <div className="text-3xl font-bold">{onboardingStats.total_completed || 0}</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xl font-semibold mb-3">Бізді қалай білдіңіз?</h3>
                  <div className="space-y-2">
                    {Object.entries(onboardingStats.how_did_you_hear || {}).map(([key, value]: [string, any]) => (
                      <div key={key} className="flex justify-between items-center bg-white/70 rounded p-3">
                        <span className="font-medium">{key}</span>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-gray-600">
                            {onboardingStats.total_completed > 0 
                              ? `${((value / onboardingStats.total_completed) * 100).toFixed(1)}%`
                              : '0%'}
                          </div>
                          <span className="font-bold text-purple-600">{value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-3">Математика деңгейі</h3>
                  <div className="space-y-2">
                    {Object.entries(onboardingStats.math_level || {}).map(([key, value]: [string, any]) => (
                      <div key={key} className="flex justify-between items-center bg-white/70 rounded p-3">
                        <span className="font-medium">{key}</span>
                        <div className="flex items-center gap-3">
                          <div className="text-sm text-gray-600">
                            {onboardingStats.total_completed > 0 
                              ? `${((value / onboardingStats.total_completed) * 100).toFixed(1)}%`
                              : '0%'}
                          </div>
                          <span className="font-bold text-blue-600">{value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          </StatsLegacySections>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/70 rounded-lg p-4 border border-white/40">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function TopUsersTable({ title, users }: { title: string; users: any[] }) {
  return (
    <div className="bg-white/70 rounded-lg p-4">
      <h4 className="font-semibold mb-3">{title}</h4>
      <div className="space-y-2">
        {users.slice(0, 5).map((user, idx) => (
          <div key={user.id} className="flex justify-between items-center text-sm">
            <span className="font-semibold">{idx + 1}. {user.nickname || user.email?.split("@")[0] || "Пайдаланушы"}</span>
            <span className="text-purple-600 font-bold">
              {title.includes("ұпай") ? user.total_points : 
               title.includes("шешілген") ? user.total_solved : 
               user.streak}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskTable({ title, tasks }: { title: string; tasks: any[] }) {
  return (
    <div className="bg-white/70 rounded-lg p-4">
      <h4 className="font-semibold mb-3">{title}</h4>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tasks.slice(0, 5).map((task) => (
          <div key={task.task_id} className="text-sm border-b border-gray-200 pb-2">
            <div className="font-semibold text-xs mb-1">{task.text}</div>
            <div className="text-xs text-gray-600">
              Әрекеттер: {task.attempts} | Табыс: {task.success_rate}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

