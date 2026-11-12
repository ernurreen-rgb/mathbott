"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon, { type IconName } from "@/components/ui/Icon";
import { getAdminStatistics } from "@/lib/api";
import { isAllowedForPage } from "@/lib/admin-access";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import type { StatisticsByTab, StatisticsPeriod, StatisticsPeriodKey, StatisticsTab } from "@/types";
import styles from "../Statistics.module.css";
import { describePeriod, formatClock, PERIODS } from "./format";
import ModulesTab from "./ModulesTab";
import OverviewTab from "./OverviewTab";
import QuizzesTab from "./QuizzesTab";
import StudentsTab, { type StudentSegment } from "./StudentsTab";
import TasksTab, { type TaskFilter } from "./TasksTab";
import TrialTestsTab from "./TrialTestsTab";

const TABS: Array<{ key: StatisticsTab; label: string; icon: IconName }> = [
  { key: "overview", label: "Шолу", icon: "chart" },
  { key: "students", label: "Оқушылар", icon: "users" },
  { key: "tasks", label: "Есептер", icon: "file" },
  { key: "modules", label: "Модульдер", icon: "book" },
  { key: "trial-tests", label: "Сынақ тесттері", icon: "test" },
  { key: "quizzes", label: "Квиздер", icon: "quiz" },
];
const isTab = (value: string | null): value is StatisticsTab => TABS.some((tab) => tab.key === value);
const isPeriod = (value: string | null): value is StatisticsPeriodKey => PERIODS.some((period) => period.key === value);

type Entry = { data: StatisticsByTab[StatisticsTab] | null; error: string | null; loading: boolean; loadedAt: number | null };
/** Where another tab should open, e.g. the hard tasks behind an overview warning. */
export type StatisticsIntent = { tab: "students"; segment: StudentSegment } | { tab: "tasks"; filter: TaskFilter } | { tab: StatisticsTab };

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "−" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg className={spinning ? styles.spin : undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15m0 5v-5h-5" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-busy="true" aria-label="Статистика жүктелуде">
      <div className={styles.skeletonTiles}>
        {Array.from({ length: 6 }, (_, index) => <div key={index} className={styles.skeletonBlock} style={{ height: 118 }} />)}
      </div>
      <div className={`${styles.row} ${styles.rowWide}`}>
        <div className={styles.skeletonBlock} style={{ height: 360 }} />
        <div className={styles.skeletonBlock} style={{ height: 360 }} />
      </div>
      <div className={styles.skeletonBlock} style={{ height: 220 }} />
    </div>
  );
}

export default function StatisticsWorkspace() {
  const { data: session, status } = useSession();
  const email = session?.user?.email || null;
  const { access, loading: accessLoading } = useAdminPageAccess("review", status, email);
  const authorized = !accessLoading && !!access?.is_admin && isAllowedForPage("review", access.role);

  const [tab, setTab] = useState<StatisticsTab>("overview");
  const [period, setPeriod] = useState<StatisticsPeriodKey>("30d");
  const [excludeAdmins, setExcludeAdmins] = useState(false);
  const [ready, setReady] = useState(false);
  const [intent, setIntent] = useState<{ value: StatisticsIntent; token: number } | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const requests = useRef<Record<string, number>>({});
  // The last data shown per tab stays on screen, dimmed, while another period loads.
  const [lastShown, setLastShown] = useState<Partial<Record<StatisticsTab, StatisticsByTab[StatisticsTab]>>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get("tab");
    const initialPeriod = params.get("period");
    if (isTab(initialTab)) setTab(initialTab);
    if (isPeriod(initialPeriod)) setPeriod(initialPeriod);
    setExcludeAdmins(params.get("admins") === "0");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const set = (name: string, value: string | null) => (value ? url.searchParams.set(name, value) : url.searchParams.delete(name));
    set("tab", tab === "overview" ? null : tab);
    set("period", period === "30d" ? null : period);
    set("admins", excludeAdmins ? "0" : null);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [ready, tab, period, excludeAdmins]);

  // Quiz hosts are teachers, so that tab ignores the admin filter and shares one cache entry.
  const filtered = tab !== "quizzes" && excludeAdmins;
  const cacheKey = `${tab}|${period}|${filtered}`;
  const entry = entries[cacheKey];

  const load = useCallback(async (fresh: boolean) => {
    if (!email || !authorized) return;
    const request = (requests.current[cacheKey] || 0) + 1;
    requests.current[cacheKey] = request;
    setEntries((current) => ({
      ...current,
      [cacheKey]: { data: current[cacheKey]?.data ?? null, error: null, loading: true, loadedAt: current[cacheKey]?.loadedAt ?? null },
    }));
    const result = await getAdminStatistics(tab, email, { period, excludeAdmins: filtered, fresh });
    if (requests.current[cacheKey] !== request) return;
    setEntries((current) => ({
      ...current,
      [cacheKey]: {
        data: result.data ?? current[cacheKey]?.data ?? null,
        error: result.error,
        loading: false,
        loadedAt: result.data ? Date.now() : current[cacheKey]?.loadedAt ?? null,
      },
    }));
  }, [email, authorized, cacheKey, tab, period, filtered]);

  useEffect(() => {
    if (ready && authorized && !entry) void load(false);
  }, [ready, authorized, entry, load]);

  const loaded = entry?.data ?? null;
  useEffect(() => {
    if (loaded) setLastShown((current) => (current[tab] === loaded ? current : { ...current, [tab]: loaded }));
  }, [loaded, tab]);

  const navigate = useCallback((next: StatisticsIntent) => {
    setIntent({ value: next, token: Date.now() });
    setTab(next.tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (status === "loading" || accessLoading || !ready) {
    return <div className={styles.page}><DesktopNav /><main className={`${styles.main} md:ml-64`}><div className={styles.shell}><Skeleton /></div></main><MobileNav currentPage="admin" /></div>;
  }
  if (!session || !authorized) {
    return <div className={styles.page}><DesktopNav /><main className={`${styles.main} md:ml-64`}><div className={styles.shell}><p className={styles.empty}>Қолжетім жоқ.</p></div></main><MobileNav currentPage="admin" /></div>;
  }

  const data = loaded ?? lastShown[tab] ?? null;
  const stale = !loaded || !!entry?.loading;
  const shownPeriod: StatisticsPeriod | null = data?.period ?? null;
  const tabIntent = intent && intent.value.tab === tab ? intent : null;
  const studentSegment = tabIntent && "segment" in tabIntent.value ? tabIntent.value.segment : undefined;
  const taskFilter = tabIntent && "filter" in tabIntent.value ? tabIntent.value.filter : undefined;

  return (
    <div className={styles.page}>
      <DesktopNav />
      <main className={`${styles.main} md:ml-64`}>
        <div className={styles.shell}>
          <nav className={styles.breadcrumbs} aria-label="Навигация">
            <Link href="/admin">Әкімші панелі</Link><span aria-hidden="true">/</span><span aria-current="page">Статистика</span>
          </nav>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Статистика</h1>
              <p className={styles.subtitle}>
                {shownPeriod ? <>
                  <strong>{describePeriod(shownPeriod)}</strong>
                  {shownPeriod.days ? ` · алдыңғы ${shownPeriod.days} күнмен салыстырылады` : ""}
                  {` · уақыт белдеуі ${formatOffset(shownPeriod.tz_offset_minutes)}`}
                </> : "Оқушылардың белсенділігі, есептер, модульдер мен тесттер бойынша көрсеткіштер"}
              </p>
            </div>
            <div className={styles.controls}>
              <div className={styles.segmented} role="group" aria-label="Кезең">
                {PERIODS.map((item) => (
                  <button key={item.key} type="button" className={styles.segment} aria-pressed={period === item.key}
                    onClick={() => setPeriod(item.key)}>{item.label}</button>
                ))}
              </div>
              <label className={styles.switch}
                title={tab === "quizzes" ? "Квиздерге қолданылмайды: оларды мұғалімдер жүргізеді" : "Әкімші аккаунттарының жауаптары мен тіркелуі есепке алынбайды"}>
                <input type="checkbox" checked={excludeAdmins} disabled={tab === "quizzes"}
                  onChange={(event) => setExcludeAdmins(event.target.checked)} />
                Әкімшілерсіз
              </label>
              <button type="button" className={styles.button} disabled={entry?.loading} onClick={() => void load(true)}
                title={entry?.loadedAt ? `Жаңартылған уақыты: ${formatClock(new Date(entry.loadedAt))}` : undefined}>
                <RefreshIcon spinning={!!entry?.loading} /> Жаңарту
              </button>
            </div>
          </header>

          <div className={styles.tabs} role="tablist" aria-label="Статистика бөлімдері">
            {TABS.map((item) => (
              <button key={item.key} type="button" role="tab" id={`statistics-tab-${item.key}`} className={styles.tab}
                aria-selected={tab === item.key} aria-controls="statistics-panel" onClick={() => { setIntent(null); setTab(item.key); }}>
                <Icon name={item.icon} size={16} /> {item.label}
              </button>
            ))}
          </div>

          <div id="statistics-panel" role="tabpanel" aria-labelledby={`statistics-tab-${tab}`}>
            {entry?.error && (
              <div role="alert" className={styles.alert} style={{ marginBottom: 16 }}>
                <span>Статистиканы жүктеу мүмкін болмады: {entry.error}</span>
                <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={() => void load(true)}>Қайталау</button>
              </div>
            )}
            {!data ? (entry?.error ? null : <Skeleton />) : (
              <div className={styles.panel} data-stale={stale} aria-busy={stale}>
                {tab === "overview" && <OverviewTab data={data as StatisticsByTab["overview"]} onNavigate={navigate} />}
                {tab === "students" && <StudentsTab key={tabIntent?.token ?? "students"} data={data as StatisticsByTab["students"]} initialSegment={studentSegment} />}
                {tab === "tasks" && <TasksTab key={tabIntent?.token ?? "tasks"} data={data as StatisticsByTab["tasks"]} initialFilter={taskFilter} />}
                {tab === "modules" && <ModulesTab data={data as StatisticsByTab["modules"]} />}
                {tab === "trial-tests" && <TrialTestsTab data={data as StatisticsByTab["trial-tests"]} />}
                {tab === "quizzes" && <QuizzesTab data={data as StatisticsByTab["quizzes"]} />}
              </div>
            )}
          </div>
        </div>
      </main>
      <MobileNav currentPage="admin" />
    </div>
  );
}
