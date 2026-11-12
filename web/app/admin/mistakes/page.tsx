"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { getAdminMistakeAnalytics } from "@/lib/api";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import type { MistakeAnalyticsPeriod, MistakeAnalyticsResponse, MistakeReviewCounts } from "@/types";

const PERIODS: Array<{ value: MistakeAnalyticsPeriod; label: string }> = [
  { value: "7d", label: "7 күн" },
  { value: "30d", label: "30 күн" },
  { value: "all", label: "Барлық уақыт" },
];
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Resolved / weak / not yet reviewed share of a group's first-attempt mistakes. */
function ReviewBar({ counts }: { counts: MistakeReviewCounts }) {
  const total = counts.mistakes || 1;
  return <div className="min-w-[9rem]">
    <div className="flex h-2 overflow-hidden rounded-full bg-gray-200" role="img"
      aria-label={`Түзетілді ${counts.resolved}, әлсіз тұс ${counts.weak}, талданбаған ${counts.pending}`}>
      <div className="bg-green-500" style={{ width: `${(counts.resolved / total) * 100}%` }} />
      <div className="bg-amber-500" style={{ width: `${(counts.weak / total) * 100}%` }} />
    </div>
    <div className="mt-1 flex gap-2 text-xs text-gray-600">
      <span className="text-green-700">✓ {counts.resolved}</span>
      <span className="text-amber-700">! {counts.weak}</span>
      <span>… {counts.pending}</span>
    </div>
  </div>;
}

function Tile({ label, value, hint, tone = "text-gray-900" }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return <div className="glass rounded-2xl border border-white/30 p-4">
    <div className="text-sm text-gray-600">{label}</div>
    <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
  </div>;
}

export default function MistakeAnalyticsPage() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { access, loading: accessLoading } = useAdminPageAccess("any", status, email);
  const [period, setPeriod] = useState<MistakeAnalyticsPeriod>("30d");
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [data, setData] = useState<MistakeAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!email || !access?.is_admin) return;
    setLoading(true);
    const { data: result, error: err } = await getAdminMistakeAnalytics(email, { period, moduleId });
    setData(result); setError(err); setLoading(false);
  }, [email, access?.is_admin, period, moduleId]);
  useEffect(() => { void load(); }, [load]);

  if (status === "loading" || accessLoading || (loading && !data && !error)) {
    return <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0">
      <DesktopNav /><MobileNav currentPage="admin" />
      <div className="container mx-auto px-4 pt-20 md:pt-8 md:ml-64">
        <SkeletonLoader variant="card" className="mb-4" /><SkeletonLoader variant="card" className="mb-4" />
      </div>
    </div>;
  }

  const summary = data?.summary;
  return <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
    <div className="absolute inset-0 bg-black/5" />
    <DesktopNav />
    <MobileNav currentPage="admin" />
    <main className="md:ml-64 px-4 sm:px-6 lg:px-8 py-8 relative z-10">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Қателер талдауы</h1>
            <p className="text-gray-600">Мини-сабақтардағы бірінші әрекет қателері және оларды егіздермен талдау нәтижесі</p>
          </div>
          <Link href="/admin" className="self-start rounded-lg border border-white/40 bg-white/70 px-3 py-2 text-sm text-gray-700 hover:bg-white">Артқа</Link>
        </div>

        <div className="glass rounded-2xl border border-white/30 p-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white/80 p-1" role="group" aria-label="Кезең">
            {PERIODS.map((item) => <button key={item.value} type="button" aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${period === item.value ? "bg-purple-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
              {item.label}
            </button>)}
          </div>
          <select aria-label="Модуль" value={moduleId ?? ""} onChange={(event) => setModuleId(event.target.value ? Number(event.target.value) : null)}
            className="max-w-full rounded-lg border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-700">
            <option value="">Барлық модульдер</option>
            {data?.modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
          </select>
          {loading && <span className="text-sm text-gray-500" role="status">Жаңартылуда...</span>}
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

        {summary && <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Бірінші әрекеттер" value={summary.first_attempts} />
            <Tile label="Қате" value={summary.mistakes} hint={`${percent(summary.mistake_rate)} бірінші әрекеттен`} tone="text-red-700" />
            <Tile label="Түзетілді" value={summary.resolved} hint="Егізді дұрыс шығарды" tone="text-green-700" />
            <Tile label="Әлсіз тұс" value={summary.weak} hint="Барлық егізде қате" tone="text-amber-700" />
            <Tile label="Талданбаған" value={summary.pending} hint="Талдау әлі өтпеген" />
            <Tile label="Егізі жоқ есептер" value={`${summary.tasks_without_twins} / ${summary.tasks_with_mistakes}`} hint="Қатесі бар есептер ішінде" />
          </div>

          <section className="glass rounded-2xl border border-white/30 p-4" aria-labelledby="mistake-tasks">
            <h2 id="mistake-tasks" className="text-lg font-semibold text-gray-900">Ең көп қате кететін есептер</h2>
            <p className="mb-3 text-sm text-gray-600">Егізі жоқ есептер талдауда сол есепті қайталайды — алдымен оларға егіз қосыңыз.</p>
            {!data.tasks.length ? <p className="py-6 text-center text-gray-600">Бұл кезеңде бірінші әрекет қатесі жоқ.</p>
              : <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-sm">
                <thead><tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="py-2 pr-3 font-medium">Есеп</th><th className="py-2 pr-3 font-medium">Қате</th>
                  <th className="py-2 pr-3 font-medium">Талдау</th><th className="py-2 font-medium">Егіздер</th>
                </tr></thead>
                <tbody>{data.tasks.map((task) => <tr key={task.task_id} className="border-b border-gray-100 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium text-gray-900 break-words"><MathRender latex={task.text_preview} /></div>
                    <div className="mt-1 text-xs text-gray-500">
                      {task.location.module_name} · <Link className="hover:text-purple-700 hover:underline" href={`/lessons/${task.location.lesson_id}`}>
                        {task.location.lesson_title || `${task.location.lesson_number ?? ""}-сабақ`}</Link> · {task.location.mini_index}-кіші сабақ
                      {task.topics.length > 0 && ` · ${task.topics.join(", ")}`}
                    </div>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap"><span className="font-semibold text-red-700">{task.mistakes}</span> / {task.attempted}
                    <div className="text-xs text-gray-500">{percent(task.mistake_rate)}</div></td>
                  <td className="py-3 pr-3"><ReviewBar counts={task} /></td>
                  <td className="py-3 whitespace-nowrap">
                    <div className={task.twin_count ? "text-gray-800" : "font-semibold text-amber-700"}>
                      {task.twin_count ? `${task.twin_count} егіз` : "Егіз жоқ"}{task.twin_draft_count ? ` + ${task.twin_draft_count} жоба` : ""}
                    </div>
                    <Link href={`/admin/bank?task=${task.bank_task_id}&mode=twins`} className="text-xs text-purple-700 hover:underline">
                      Банктегі егіздер <Icon name="arrowRight" />
                    </Link>
                  </td>
                </tr>)}</tbody>
              </table></div>}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="glass rounded-2xl border border-white/30 p-4" aria-labelledby="mistake-topics">
              <h2 id="mistake-topics" className="mb-3 text-lg font-semibold text-gray-900">Тақырыптар</h2>
              {!data.topics.length ? <p className="py-6 text-center text-gray-600">Дерек жоқ.</p>
                : <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
                  <thead><tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="py-2 pr-3 font-medium">Тақырып</th><th className="py-2 pr-3 font-medium">Қате</th>
                    <th className="py-2 pr-3 font-medium">Оқушылар</th><th className="py-2 font-medium">Талдау</th>
                  </tr></thead>
                  <tbody>{data.topics.map((topic) => <tr key={topic.topic} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-900">{topic.topic}</td>
                    <td className="py-2 pr-3 font-semibold text-red-700">{topic.mistakes}</td>
                    <td className="py-2 pr-3">{topic.students}</td>
                    <td className="py-2"><ReviewBar counts={topic} /></td>
                  </tr>)}</tbody>
                </table></div>}
            </section>

            <section className="glass rounded-2xl border border-white/30 p-4" aria-labelledby="mistake-students">
              <h2 id="mistake-students" className="text-lg font-semibold text-gray-900">Оқушылардың әлсіз тұстары</h2>
              <p className="mb-3 text-sm text-gray-600">Әлсіз тұсы көп оқушылар жоғарыда. Әлсіз тұс — барлық егізде қате кеткен есеп.</p>
              {!data.students.length ? <p className="py-6 text-center text-gray-600">Дерек жоқ.</p>
                : <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-left text-sm">
                  <thead><tr className="border-b border-gray-200 text-xs text-gray-500">
                    <th className="py-2 pr-3 font-medium">Оқушы</th><th className="py-2 pr-3 font-medium">Қате</th>
                    <th className="py-2 pr-3 font-medium">Әлсіз тұс</th><th className="py-2 font-medium">Әлсіз тақырыптар</th>
                  </tr></thead>
                  <tbody>{data.students.map((student) => <tr key={student.user_id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3">
                      <Link href={`/profile/${student.user_id}`} className="text-gray-900 hover:text-purple-700 hover:underline">{student.nickname || `Оқушы #${student.user_id}`}</Link>
                      {student.email && <div className="text-xs text-gray-500 break-all">{student.email}</div>}
                    </td>
                    <td className="py-2 pr-3">{student.mistakes}<div className="text-xs text-green-700">✓ {student.resolved}</div></td>
                    <td className={`py-2 pr-3 font-semibold ${student.weak ? "text-amber-700" : "text-gray-400"}`}>{student.weak}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">{student.weak_topics.map((topic) => <span key={topic} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{topic}</span>)}</div>
                    </td>
                  </tr>)}</tbody>
                </table></div>}
            </section>
          </div>
        </>}
      </div>
    </main>
  </div>;
}
