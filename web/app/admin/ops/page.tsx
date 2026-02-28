"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import {
  getAdminOpsHealthSummary,
  getAdminOpsHealthTimeseries,
  getAdminOpsIncidents,
} from "@/lib/api";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import type {
  OpsHealthSummary,
  OpsHealthTimeseriesPoint,
  OpsIncident,
  OpsTimeseriesRange,
} from "@/types";

const RANGE_TO_STEP: Record<OpsTimeseriesRange, "1m" | "5m" | "1h"> = {
  "1h": "1m",
  "24h": "5m",
  "7d": "1h",
};

function fmtPercent(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}

function fmtMs(value: number): string {
  return `${Number(value || 0).toFixed(0)} мс`;
}

function fmtTsShort(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function AdminOpsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const email = session?.user?.email || "";
  const { loading: accessLoading } = useAdminPageAccess("review", status, email || null);

  const [range, setRange] = useState<OpsTimeseriesRange>("24h");
  const [incidentStatus, setIncidentStatus] = useState<"open" | "resolved" | "all">("open");
  const [incidentSeverity, setIncidentSeverity] = useState<"critical" | "high" | "medium" | "all">("all");

  const [summary, setSummary] = useState<OpsHealthSummary | null>(null);
  const [timeseries, setTimeseries] = useState<OpsHealthTimeseriesPoint[]>([]);
  const [incidents, setIncidents] = useState<OpsIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent: boolean = false) => {
      if (!email) return;
      if (!silent) setLoading(true);
      if (silent) setRefreshing(true);
      setError(null);

      const step = RANGE_TO_STEP[range];
      const [summaryRes, timeseriesRes, incidentsRes] = await Promise.all([
        getAdminOpsHealthSummary(email),
        getAdminOpsHealthTimeseries(email, { range, step }),
        getAdminOpsIncidents(email, {
          status: incidentStatus,
          severity: incidentSeverity,
          limit: 20,
          offset: 0,
        }),
      ]);

      const firstError = summaryRes.error || timeseriesRes.error || incidentsRes.error;
      if (firstError) {
        setError(firstError);
        toast.error(`Ops жүктеу қатесі: ${firstError}`);
      } else {
        setSummary(summaryRes.data);
        setTimeseries(timeseriesRes.data?.items || []);
        setIncidents(incidentsRes.data?.items || []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [email, range, incidentStatus, incidentSeverity]
  );

  useEffect(() => {
    if (accessLoading) return;
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated" && email) {
      void load(false);
    }
  }, [status, email, load, router, accessLoading]);

  useEffect(() => {
    if (!email) return;
    const id = setInterval(() => {
      void load(true);
    }, 30_000);
    return () => clearInterval(id);
  }, [email, load]);

  const statusBadgeClass = useMemo(() => {
    switch (summary?.service_status) {
      case "healthy":
        return "bg-green-100 text-green-700 border-green-200";
      case "degraded":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "down":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  }, [summary?.service_status]);

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

  return (
    <div className="min-h-screen bg-gradient-math animate-gradient pb-20 md:pb-0 relative">
      <div className="absolute inset-0 bg-black/5" />
      <DesktopNav />
      <MobileNav currentPage="admin" />
      <main className="md:ml-64 px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Өндіріс денсаулығы</h1>
              <p className="text-gray-600">Қате, кешігу және инцидент мониторингі</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin"
                className="rounded-lg border border-white/40 bg-white/70 px-3 py-2 text-sm text-gray-700 hover:bg-white"
              >
                Артқа
              </Link>
              <button
                onClick={() => void load(true)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {refreshing ? "Жаңартылуда..." : "Жаңарту"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <KpiCard
              label="Service"
              value={summary?.service_status || "-"}
              extra={summary?.updated_at ? `Жаңарту: ${summary.updated_at}` : ""}
              valueClass={`inline-flex px-2 py-1 rounded border ${statusBadgeClass}`}
            />
            <KpiCard
              label="DB"
              value={summary?.database_status || "-"}
              valueClass={
                summary?.database_status === "ok"
                  ? "text-green-700 font-semibold"
                  : "text-red-700 font-semibold"
              }
            />
            <KpiCard label="5m Error Rate" value={fmtPercent(summary?.error_rate_5m || 0)} />
            <KpiCard label="5m P95" value={fmtMs(summary?.p95_ms_5m || 0)} />
            <KpiCard label="Open Incidents" value={String(summary?.open_incidents || 0)} />
          </div>

          <div className="glass rounded-2xl border border-white/30 p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm text-gray-700">
                Кезең
                <select
                  className="ml-2 rounded border border-gray-300 bg-white px-2 py-1"
                  value={range}
                  onChange={(e) => setRange(e.target.value as OpsTimeseriesRange)}
                >
                  <option value="1h">1 сағат</option>
                  <option value="24h">24 сағат</option>
                  <option value="7d">7 күн</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard title="Requests vs Errors">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ts" tickFormatter={fmtTsShort} minTickGap={30} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="requests" stroke="#2563eb" dot={false} />
                    <Line type="monotone" dataKey="errors" stroke="#dc2626" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Error Rate %">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ts" tickFormatter={fmtTsShort} minTickGap={30} />
                    <YAxis />
                    <Tooltip formatter={(val: any) => `${Number(val || 0).toFixed(2)}%`} />
                    <Legend />
                    <Area type="monotone" dataKey="error_rate" stroke="#f59e0b" fill="#fef3c7" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="P95 Latency">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="ts" tickFormatter={fmtTsShort} minTickGap={30} />
                    <YAxis />
                    <Tooltip formatter={(val: any) => `${Number(val || 0).toFixed(0)} ms`} />
                    <Legend />
                    <Line type="monotone" dataKey="p95_ms" stroke="#7c3aed" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </div>

          <div className="glass rounded-2xl border border-white/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Инциденттер</h2>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                  value={incidentStatus}
                  onChange={(e) => setIncidentStatus(e.target.value as "open" | "resolved" | "all")}
                >
                  <option value="open">Ашық</option>
                  <option value="resolved">Жабық</option>
                  <option value="all">Барлығы</option>
                </select>
                <select
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                  value={incidentSeverity}
                  onChange={(e) =>
                    setIncidentSeverity(e.target.value as "critical" | "high" | "medium" | "all")
                  }
                >
                  <option value="all">Severity: барлығы</option>
                  <option value="critical">critical</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                </select>
              </div>
            </div>

            {incidents.length === 0 ? (
              <div className="rounded border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-600">
                Инциденттер табылмады
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b border-gray-200">
                      <th className="py-2 pr-3">Уақыты</th>
                      <th className="py-2 pr-3">Түрі</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Occurrences</th>
                      <th className="py-2 pr-3">Тақырып</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((incident) => (
                      <tr key={incident.id} className="border-b border-gray-100 align-top">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <div>{incident.first_seen_at}</div>
                          <div className="text-gray-500">Соңғы: {incident.last_seen_at}</div>
                        </td>
                        <td className="py-2 pr-3">{incident.kind}</td>
                        <td className="py-2 pr-3">
                          <SeverityBadge severity={incident.severity} />
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                              incident.status === "open"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {incident.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{incident.occurrences}</td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-gray-900">{incident.title}</div>
                          <div className="text-gray-600">{incident.message}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  extra,
  valueClass,
}: {
  label: string;
  value: string;
  extra?: string;
  valueClass?: string;
}) {
  return (
    <div className="glass rounded-xl border border-white/30 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold text-gray-900 ${valueClass || ""}`}>{value}</div>
      {extra ? <div className="mt-2 text-xs text-gray-500">{extra}</div> : null}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/30 bg-white/70 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: OpsIncident["severity"] }) {
  const cls =
    severity === "critical"
      ? "bg-red-100 text-red-700"
      : severity === "high"
      ? "bg-orange-100 text-orange-700"
      : "bg-yellow-100 text-yellow-700";
  return <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{severity}</span>;
}
