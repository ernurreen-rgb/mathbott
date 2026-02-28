"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { AdminLeagueAverageItem, AdminStatistics } from "@/types";
import NoDataPanel from "./NoDataPanel";
import {
  buildActivityTrendSeries,
  buildLeagueDistributionSeries,
  buildQuestionTypeSuccessSeries,
  buildRegistrationsTrendSeries,
  buildReportStatusSeries,
  buildSolutionsTrendSeries,
  type ActivityTrendPoint,
  type PieDistributionPoint,
  type QuestionTypeSuccessPoint,
  type RegistrationsTrendPoint,
  type SolutionsTrendPoint,
} from "./adapters";
import { shortenLabel } from "./format";

interface StatsChartsSectionProps {
  stats: AdminStatistics;
}

type ChartPeriodDays = 7 | 30 | 90;

type DrilldownMetric = {
  label: string;
  value: string;
};

type DrilldownRow = {
  id: number | string;
  primary: string;
  secondary?: string;
};

type DrilldownState = {
  title: string;
  subtitle?: string;
  metrics: DrilldownMetric[];
  rowsTitle?: string;
  rows?: DrilldownRow[];
  actionHref?: string;
  actionLabel?: string;
};

const PERIOD_OPTIONS: ChartPeriodDays[] = [7, 30, 90];

const COLORS = {
  primary: "#3b82f6",
  secondary: "#10b981",
  accent: "#f59e0b",
  danger: "#ef4444",
  violet: "#8b5cf6",
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

const NUMBER_FORMATTER = new Intl.NumberFormat("ru-RU");

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0%";
  }
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
}

function formatIsoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function getPayloadFromChartEvent<T>(eventState: unknown): T | null {
  const maybe = eventState as { activePayload?: Array<{ payload?: T }> };
  return maybe?.activePayload?.[0]?.payload ?? null;
}

function getPayloadFromSeriesEvent<T>(eventState: unknown): T | null {
  const maybe = eventState as { payload?: T };
  return maybe?.payload ?? null;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white/70 rounded-2xl border border-white/40 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DrilldownPanel({ data, onClose }: { data: DrilldownState; onClose: () => void }) {
  return (
    <div className="mt-5 bg-white/80 rounded-2xl border border-white/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{data.title}</h3>
          {data.subtitle ? <p className="text-sm text-gray-600 mt-1">{data.subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 hover:text-gray-900 bg-white/80 border border-white/50 rounded-lg px-3 py-1"
        >
          Жабу
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {data.metrics.map((metric) => (
          <div key={metric.label} className="bg-white/85 rounded-lg border border-white/50 p-3">
            <div className="text-xs text-gray-600">{metric.label}</div>
            <div className="text-lg font-semibold text-gray-900">{metric.value}</div>
          </div>
        ))}
      </div>

      {data.rows && data.rows.length > 0 ? (
        <div className="mt-4">
          {data.rowsTitle ? <h4 className="text-sm font-semibold text-gray-800 mb-2">{data.rowsTitle}</h4> : null}
          <div className="space-y-2 max-h-56 overflow-auto pr-1">
            {data.rows.map((row) => (
              <div key={row.id} className="bg-white/85 rounded-lg border border-white/50 p-3">
                <div className="text-sm font-medium text-gray-900">{row.primary}</div>
                {row.secondary ? <div className="text-xs text-gray-600 mt-1">{row.secondary}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.actionHref && data.actionLabel ? (
        <div className="mt-4">
          <Link
            href={data.actionHref}
            className="inline-flex items-center rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
          >
            {data.actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default function StatsChartsSection({ stats }: StatsChartsSectionProps) {
  const [periodDays, setPeriodDays] = useState<ChartPeriodDays>(30);
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);

  const activitySeries = useMemo(() => buildActivityTrendSeries(stats, periodDays), [stats, periodDays]);
  const solutionsSeries = useMemo(() => buildSolutionsTrendSeries(stats, periodDays), [stats, periodDays]);
  const registrationsSeries = useMemo(() => buildRegistrationsTrendSeries(stats, periodDays), [stats, periodDays]);
  const questionTypeSeries = useMemo(() => buildQuestionTypeSuccessSeries(stats), [stats]);
  const leagueSeries = useMemo(() => buildLeagueDistributionSeries(stats), [stats]);
  const reportStatusSeries = useMemo(() => buildReportStatusSeries(stats), [stats]);

  const handleActivityClick = (eventState: unknown) => {
    const point = getPayloadFromChartEvent<ActivityTrendPoint>(eventState);
    if (!point) {
      return;
    }

    const avgPerUser = point.unique_users > 0 ? point.count / point.unique_users : 0;
    setDrilldown({
      title: `Белсенділік: ${point.label}`,
      subtitle: `Күні: ${formatIsoDate(point.date)}`,
      metrics: [
        { label: "Шешімдер", value: formatNumber(point.count) },
        { label: "Бірегей қолданушы", value: formatNumber(point.unique_users) },
        { label: "1 қолданушыға", value: avgPerUser.toFixed(2) },
        { label: "Период", value: `${periodDays} күн` },
      ],
    });
  };

  const handleSolutionsClick = (eventState: unknown) => {
    const point = getPayloadFromSeriesEvent<SolutionsTrendPoint>(eventState) ?? getPayloadFromChartEvent<SolutionsTrendPoint>(eventState);
    if (!point) {
      return;
    }

    const accuracy = point.count > 0 ? (point.correct / point.count) * 100 : 0;
    setDrilldown({
      title: `Шешімдер: ${point.label}`,
      subtitle: `Күні: ${formatIsoDate(point.date)}`,
      metrics: [
        { label: "Барлығы", value: formatNumber(point.count) },
        { label: "Дұрыс", value: formatNumber(point.correct) },
        { label: "Қате", value: formatNumber(point.incorrect) },
        { label: "Дәлдік", value: formatPercent(accuracy) },
      ],
    });
  };

  const handleRegistrationsClick = (eventState: unknown) => {
    const point = getPayloadFromChartEvent<RegistrationsTrendPoint>(eventState);
    if (!point) {
      return;
    }

    setDrilldown({
      title: `Тіркеулер: ${point.label}`,
      subtitle: `Күні: ${formatIsoDate(point.date)}`,
      metrics: [
        { label: "Жаңа тіркелу", value: formatNumber(point.count) },
        { label: "Период", value: `${periodDays} күн` },
      ],
    });
  };

  const handleQuestionTypeClick = (eventState: unknown) => {
    const point = getPayloadFromSeriesEvent<QuestionTypeSuccessPoint>(eventState);
    if (!point) {
      return;
    }

    const typeCode = String(point.question_type || "").toUpperCase();
    const source = stats.question_type_stats.find(
      (item) => String(item.question_type || "").toUpperCase() === typeCode
    );

    setDrilldown({
      title: `Сұрақ түрі: ${typeCode}`,
      metrics: [
        { label: "Барлық әрекет", value: formatNumber(point.total) },
        { label: "Дұрыс", value: formatNumber(Number(source?.correct ?? 0)) },
        { label: "Табыс", value: formatPercent(point.success_rate) },
      ],
      actionHref: "/admin/bank",
      actionLabel: "Банкке өту",
    });
  };

  const handleLeagueClick = (eventState: unknown) => {
    const point = getPayloadFromSeriesEvent<PieDistributionPoint>(eventState);
    if (!point) {
      return;
    }

    const avg = stats.league_averages.find(
      (item: AdminLeagueAverageItem) => String(item.league) === String(point.label)
    );

    setDrilldown({
      title: `Лига: ${point.label}`,
      metrics: [
        { label: "Пайдаланушы саны", value: formatNumber(point.value) },
        { label: "Орташа solved", value: Number(avg?.avg_solved ?? 0).toFixed(1) },
        { label: "Орташа points", value: Number(avg?.avg_points ?? 0).toFixed(1) },
        { label: "Орташа streak", value: Number(avg?.avg_streak ?? 0).toFixed(1) },
      ],
    });
  };

  const handleReportStatusClick = (eventState: unknown) => {
    const point = getPayloadFromSeriesEvent<PieDistributionPoint>(eventState);
    if (!point) {
      return;
    }

    const share = stats.total_reports > 0 ? (point.value / stats.total_reports) * 100 : 0;
    const topProblems = stats.problematic_tasks.slice(0, 5).map((task) => ({
      id: task.task_id,
      primary: task.text,
      secondary: `Хабарлама саны: ${formatNumber(task.report_count)}`,
    }));

    setDrilldown({
      title: `Репорт статусы: ${point.label}`,
      metrics: [
        { label: "Саны", value: formatNumber(point.value) },
        { label: "Үлесі", value: formatPercent(share) },
        { label: "Жалпы репорт", value: formatNumber(stats.total_reports) },
        { label: "Орташа шешу уақыты", value: `${Number(stats.avg_report_resolution_time || 0).toFixed(1)} сағ` },
      ],
      rowsTitle: "Ең проблемалы есептер",
      rows: topProblems,
      actionHref: "/admin/reports",
      actionLabel: "Репорттарды ашу",
    });
  };

  return (
    <section className="glass rounded-3xl shadow-2xl p-6 border border-white/30 mb-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Графиктер</h2>
        <div className="inline-flex items-center gap-1 bg-white/70 rounded-xl border border-white/40 p-1">
          {PERIOD_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setPeriodDays(days)}
              aria-pressed={periodDays === days}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodDays === days ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white/80"
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title={`Белсенділік (соңғы ${periodDays} күн)`}>
          {activitySeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={activitySeries} onClick={handleActivityClick} style={{ cursor: "pointer" }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" name="Шешімдер" stroke={COLORS.primary} strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="unique_users"
                  name="Бірегей пайдаланушылар"
                  stroke={COLORS.secondary}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Шешімдер динамикасы (соңғы ${periodDays} күн)`}>
          {solutionsSeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={solutionsSeries} onClick={handleSolutionsClick} style={{ cursor: "pointer" }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="correct" stackId="answers" name="Дұрыс" fill={COLORS.secondary} onClick={handleSolutionsClick} />
                <Bar dataKey="incorrect" stackId="answers" name="Қате" fill={COLORS.danger} onClick={handleSolutionsClick} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Тіркеулер (соңғы ${periodDays} күн)`}>
          {registrationsSeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={registrationsSeries} onClick={handleRegistrationsClick} style={{ cursor: "pointer" }}>
                <defs>
                  <linearGradient id="registrationsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.violet} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={COLORS.violet} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Тіркелу" stroke={COLORS.violet} fill="url(#registrationsFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Сұрақ түрлері бойынша табыс (%)">
          {questionTypeSeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={questionTypeSeries} style={{ cursor: "pointer" }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="question_type" tickFormatter={(v) => shortenLabel(String(v), 8)} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="success_rate" name="Табыс %" fill={COLORS.accent} onClick={handleQuestionTypeClick} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Лигалар бойынша таралу">
          {leagueSeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={leagueSeries}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={90}
                  onClick={handleLeagueClick}
                  style={{ cursor: "pointer" }}
                >
                  {leagueSeries.map((_, idx) => (
                    <Cell key={`league-cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Репорт статустары">
          {reportStatusSeries.length === 0 ? (
            <NoDataPanel />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={reportStatusSeries}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={90}
                  onClick={handleReportStatusClick}
                  style={{ cursor: "pointer" }}
                >
                  {reportStatusSeries.map((_, idx) => (
                    <Cell key={`report-cell-${idx}`} fill={PIE_COLORS[(idx + 2) % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {drilldown ? (
        <DrilldownPanel data={drilldown} onClose={() => setDrilldown(null)} />
      ) : (
        <div className="mt-5 bg-white/70 rounded-2xl border border-dashed border-white/60 p-4 text-sm text-gray-700">
          Деталь көру үшін графиктің нүктесін, бағанын немесе секторын басыңыз.
        </div>
      )}
    </section>
  );
}
