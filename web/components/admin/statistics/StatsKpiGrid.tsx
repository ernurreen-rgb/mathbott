"use client";

import type { AdminStatistics } from "@/types";

interface StatsKpiGridProps {
  stats: AdminStatistics;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/70 rounded-lg p-4 border border-white/40">
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

export default function StatsKpiGrid({ stats }: StatsKpiGridProps) {
  return (
    <section className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Жалпы платформа статистикасы</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard label="Барлық пайдаланушылар" value={stats.total_users} />
        <StatCard label="Барлық есептер" value={stats.total_tasks} />
        <StatCard label="Жойылған есептер" value={stats.deleted_tasks} />
        <StatCard label="Барлық шешімдер" value={stats.total_solutions} />
        <StatCard label="Дұрыс шешімдер" value={stats.correct_solutions} />
        <StatCard label="Қате шешімдер" value={stats.incorrect_solutions} />
        <StatCard label="Сынақ тесттері" value={stats.total_trial_tests} />
        <StatCard label="Тест нәтижелері" value={stats.total_trial_test_results} />
        <StatCard label="Барлық хабарламалар" value={stats.total_reports} />
        <StatCard label="Күтуде" value={stats.pending_reports} />
        <StatCard label="Шешілген" value={stats.resolved_reports} />
        <StatCard label="Жалпы табыс %" value={`${stats.overall_success_rate}%`} />
      </div>
    </section>
  );
}
