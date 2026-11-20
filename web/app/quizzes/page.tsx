"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import Icon from "@/components/ui/Icon";
import { deleteQuiz, forkQuiz, getQuizCatalog, setQuizCatalogFields, updateQuiz } from "@/lib/api/quizzes";
import { Quiz, QuizCatalog, QuizCatalogSort } from "@/types/quiz";
import QuizBulkBar from "./_components/QuizBulkBar";
import QuizRow from "./_components/QuizRow";
import { useI18n } from "@/lib/i18n/provider";
import { tr, type MessageKey } from "@/lib/i18n/translate";

const PAGE_SIZE = 24;
const MAX_SELECTED = 200; // the API's limit for one bulk change
const SORTS: Array<{ value: QuizCatalogSort; label: MessageKey }> = [
  { value: "newest", label: "catalog.sort.newest" },
  { value: "popular", label: "catalog.sort.popular" },
];
const number = new Intl.NumberFormat("ru-RU");
const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

interface Filters {
  scope: "all" | "mine";
  visibility?: "public" | "private";
  q: string;
  grade?: number;
  topic: string;
  untagged: boolean;
  sort: QuizCatalogSort;
  page: number;
}

/** The catalog state lives in the URL, so Back from a quiz returns to the same search, filters and page. */
function readFilters(params: URLSearchParams | null): Filters {
  const get = (key: string) => params?.get(key) || "";
  const grade = Number(get("grade"));
  const page = Number(get("page"));
  const visibility = get("visibility");
  const scope = get("scope") === "mine" ? "mine" : "all";
  return {
    scope,
    visibility: scope === "mine" && (visibility === "public" || visibility === "private") ? visibility : undefined,
    q: get("q").trim().slice(0, 100),
    grade: Number.isInteger(grade) && grade >= 1 && grade <= 11 ? grade : undefined,
    topic: get("untagged") === "1" ? "" : get("topic").slice(0, 80),
    untagged: get("untagged") === "1",
    sort: SORTS.some((s) => s.value === get("sort")) ? (get("sort") as QuizCatalogSort) : "newest",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function writeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.scope === "mine") params.set("scope", "mine");
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.q) params.set("q", filters.q);
  if (filters.grade) params.set("grade", String(filters.grade));
  if (filters.untagged) params.set("untagged", "1");
  else if (filters.topic) params.set("topic", filters.topic);
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
        active
          ? "border-purple-600 bg-purple-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-purple-300 hover:text-purple-700"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-xl bg-slate-200/70 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
            value === option.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Page numbers around the current one: 1 … 4 5 6 … 42. */
function pageWindow(current: number, last: number): Array<number | "gap"> {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = Array.from(pages).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : [page]));
}

function QuizzesCatalog() {
  const router = useRouter();
  const pathname = usePathname() || "/quizzes";
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { t } = useI18n();
  const email = session?.user?.email || undefined;

  const urlFilters = useMemo(() => readFilters(searchParams), [searchParams]);
  // "My quizzes" needs an account; a shared ?scope=mine link falls back to the public catalog.
  const filters = useMemo<Filters>(
    () => (urlFilters.scope === "mine" && status === "unauthenticated" ? { ...urlFilters, scope: "all", visibility: undefined } : urlFilters),
    [urlFilters, status]
  );

  const [catalog, setCatalog] = useState<QuizCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [topicFilter, setTopicFilter] = useState("");
  const [showRail, setShowRail] = useState(false);
  // Selection mode: null when off, otherwise the picked quiz ids (kept across pages and searches).
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [applying, setApplying] = useState(false);
  const [knownTopics, setKnownTopics] = useState<string[]>([]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    // Any change except paging starts again from the first page.
    const next = { ...filters, page: 1, ...patch };
    if (next.scope !== "mine") next.visibility = undefined;
    const query = writeFilters(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [filters, pathname, router]);

  // --- Search box: typed text is local, the URL follows after a pause ---
  const [searchText, setSearchText] = useState(urlFilters.q);
  const pushedQuery = useRef(urlFilters.q);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = searchText.trim();
    if (q === pushedQuery.current) return;
    const timer = setTimeout(() => {
      pushedQuery.current = q;
      setFilters({ q });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, setFilters]);
  useEffect(() => {
    // The URL changed from outside the box (reset, Back): show that query.
    if (filters.q !== pushedQuery.current) {
      pushedQuery.current = filters.q;
      setSearchText(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  // --- Loading ---
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const { data, error: loadError } = await getQuizCatalog({
      scope: filters.scope, visibility: filters.visibility, q: filters.q, grade: filters.grade,
      topic: filters.topic, untagged: filters.untagged, sort: filters.sort,
      limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE,
    }, email);
    if (id !== request.current) return; // a newer search already replaced this one
    if (loadError || !data) {
      setError(loadError || tr("catalog.loadError"));
    } else {
      setError(null);
      setCatalog(data);
      if (data.facets.topics.length > 0) setShowRail(true);
      // Filters hide topics from the counts; the bulk bar should still suggest every topic seen.
      setKnownTopics((known) => {
        const names = new Set([...known, ...data.facets.topics.map((t) => t.topic)]);
        return names.size === known.length ? known : Array.from(names).sort((a, b) => a.localeCompare(b, "kk"));
      });
    }
    setLoading(false);
  }, [filters, email]);
  useEffect(() => {
    if (status !== "loading") void load();
  }, [load, status]);

  const total = catalog?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    // A page past the end (a deleted quiz, a stale link) snaps back to the last one.
    if (catalog && !loading && filters.page > lastPage) setFilters({ page: lastPage });
  }, [catalog, loading, filters.page, lastPage, setFilters]);

  const goToPage = (page: number) => {
    setFilters({ page });
    window.scrollTo({ top: 0 });
  };

  // --- Row actions ---
  useEffect(() => {
    if (openMenuId === null) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target as Element).closest?.("[data-quiz-menu]")) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [openMenuId]);

  const handleDelete = async (quiz: Quiz) => {
    setOpenMenuId(null);
    if (!confirm(t("catalog.confirmDelete", { title: quiz.title }))) return;
    setBusyId(quiz.id);
    const result = await deleteQuiz(quiz.id, email);
    setBusyId(null);
    if (result.error) return void toast.error(result.error);
    toast.success(t("catalog.deleted"));
    void load();
  };

  const handleTogglePrivacy = async (quiz: Quiz) => {
    setOpenMenuId(null);
    setBusyId(quiz.id);
    const result = await updateQuiz(quiz.id, { is_public: !quiz.is_public }, email);
    setBusyId(null);
    if (result.error || !result.data) return void toast.error(result.error || t("catalog.privacyFailed"));
    toast.success(quiz.is_public ? t("catalog.nowPrivate") : t("catalog.nowPublic"));
    // Flip the switch at once; the reload then settles counts and drops the row if a filter excludes it now.
    setCatalog((current) => current && {
      ...current, items: current.items.map((item) => (item.id === quiz.id ? { ...item, is_public: !quiz.is_public } : item)),
    });
    void load();
  };

  const handleFork = async (quiz: Quiz) => {
    setOpenMenuId(null);
    setBusyId(quiz.id);
    const { data: forked, error: forkError } = await forkQuiz(quiz.id, email);
    if (forkError || !forked) {
      setBusyId(null);
      return void toast.error(forkError || t("catalog.forkFailed"));
    }
    toast.success(t("catalog.forked"));
    router.push(`/quizzes/${forked.id}/edit`);
  };

  // --- Selection mode ---
  const pageIds = (catalog?.items || []).filter((quiz) => quiz.can_manage).map((quiz) => quiz.id);
  const pageSelected = selected !== null && pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleSelected = (ids: number[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (!on) next.delete(id);
      else if (next.size < MAX_SELECTED || next.has(id)) next.add(id);
      else {
        toast.error(t("catalog.maxSelected", { count: MAX_SELECTED }));
        break;
      }
    }
    setSelected(next);
  };
  const applyToSelected = async (change: { grade?: number | null; topic?: string }) => {
    if (!selected?.size) return;
    setApplying(true);
    const { data, error: applyError } = await setQuizCatalogFields(Array.from(selected), change, email);
    setApplying(false);
    if (applyError || !data) return void toast.error(applyError || t("catalog.bulkFailed"));
    toast.success(t("catalog.bulkDone", { count: data.updated }));
    setSelected(null);
    void load();
  };

  // --- Filter lists: keep the selected value visible even when nothing matches it ---
  const grades = useMemo(() => {
    const list = catalog?.facets.grades || [];
    return filters.grade && !list.some((g) => g.grade === filters.grade)
      ? [...list, { grade: filters.grade, count: 0 }].sort((a, b) => a.grade - b.grade)
      : list;
  }, [catalog, filters.grade]);
  const topics = useMemo(() => {
    // Kazakh alphabetical order; the database only knows code points.
    const list = [...(catalog?.facets.topics || [])].sort((a, b) => a.topic.localeCompare(b.topic, "kk"));
    return filters.topic && !list.some((t) => t.topic === filters.topic) ? [{ topic: filters.topic, count: 0 }, ...list] : list;
  }, [catalog, filters.topic]);
  const untaggedCount = catalog?.facets.untagged ?? 0;
  const visibleTopics = useMemo(() => {
    const needle = topicFilter.trim().toLocaleLowerCase("kk");
    return needle ? topics.filter((t) => t.topic.toLocaleLowerCase("kk").includes(needle)) : topics;
  }, [topics, topicFilter]);
  const topicTotal = topics.reduce((sum, t) => sum + t.count, 0) + untaggedCount;

  const hasFilters = Boolean(filters.q || filters.grade || filters.topic || filters.untagged || filters.visibility);
  const resetFilters = () => setFilters({ q: "", grade: undefined, topic: "", untagged: false, visibility: undefined });
  const rail = showRail || Boolean(filters.topic) || filters.untagged;
  const items = catalog?.items || [];
  const firstLoad = loading && !catalog;

  const topicButton = (label: string, count: number, active: boolean, onClick: () => void, key?: string) => (
    <li key={key ?? label}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
          active ? "bg-purple-100 font-semibold text-purple-800" : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <span className="min-w-0 break-words">{label}</span>
        <span className={`shrink-0 text-xs tabular-nums ${active ? "text-purple-700" : "text-slate-400"}`}>{number.format(count)}</span>
      </button>
    </li>
  );

  return (
    <div className={`min-h-screen bg-slate-50 md:pl-64 ${selected ? "pb-56 md:pb-28" : "pb-24 md:pb-10"}`}>
      <DesktopNav currentPage="quizzes" />
      <MobileNav currentPage="quizzes" />

      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <h1 className="mr-auto bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text py-1 text-3xl font-bold leading-normal text-transparent sm:text-4xl">
            {t("nav.quizzes")}
          </h1>
          <Link href="/quiz/history" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900">
            <Icon name="clock" className="h-4 w-4" />
            {t("history.title")}
          </Link>
          {/* On a phone the two main actions share one full-width line under the title. */}
          <div className="order-last flex w-full gap-2 sm:order-none sm:w-auto">
            <Link href="/join" className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:border-purple-300 hover:text-purple-700">
              <Icon name="logIn" className="h-4 w-4 text-purple-600" />
              {t("history.joinByPin")}
            </Link>
            <Link href="/quizzes/create" className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-purple-700">
              <Icon name="plus" className="h-4 w-4" />
              {t("catalog.new")}
            </Link>
          </div>
        </header>

        {/* Search stays in reach while the list scrolls */}
        <div className="sticky top-0 z-20 -mx-4 mt-4 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={searchText}
                maxLength={100}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("catalog.searchPlaceholder")}
                aria-label={t("catalog.searchAria")}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-11 text-base text-slate-900 shadow-sm transition-shadow placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-4 focus:ring-purple-100 [&::-webkit-search-cancel-button]:hidden"
              />
              {searchText ? (
                <button
                  type="button"
                  onClick={() => { setSearchText(""); searchRef.current?.focus(); }}
                  aria-label={t("catalog.clearSearch")}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 px-1.5 text-xs font-semibold text-slate-400 md:block">/</kbd>
              )}
            </div>
        </div>

        {/* Scope and grade */}
        <div className={`-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 ${HIDE_SCROLLBAR}`}>
          {session && (
            <Segmented
              label={t("catalog.scopeLabel")}
              value={filters.scope}
              onChange={(scope) => setFilters({ scope })}
              options={[{ value: "all", label: t("catalog.scopeAll") }, { value: "mine", label: t("catalog.scopeMine") }]}
            />
          )}
          {filters.scope === "mine" && (
            <Segmented
              label={t("catalog.visibilityLabel")}
              value={filters.visibility || "any"}
              onChange={(visibility) => setFilters({ visibility: visibility === "any" ? undefined : visibility })}
              options={[{ value: "any", label: t("catalog.all") }, { value: "public", label: t("catalog.public") }, { value: "private", label: t("catalog.private") }]}
            />
          )}
          {grades.length > 0 && (
            <>
              {session && <span className="mx-1 hidden h-6 w-px shrink-0 bg-slate-200 sm:block" />}
              <span className="shrink-0 text-sm font-semibold text-slate-500">{t("catalog.grade")}</span>
              <Chip active={!filters.grade} onClick={() => setFilters({ grade: undefined })}>{t("catalog.all")}</Chip>
              {grades.map((g) => (
                <Chip key={g.grade} active={filters.grade === g.grade} onClick={() => setFilters({ grade: filters.grade === g.grade ? undefined : g.grade })}>
                  {g.grade}
                </Chip>
              ))}
            </>
          )}
        </div>

        {/* Topics on small screens: one scrollable line */}
        {rail && (
          <div className={`-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 lg:hidden ${HIDE_SCROLLBAR}`}>
            <Chip active={!filters.topic && !filters.untagged} onClick={() => setFilters({ topic: "", untagged: false })}>{t("catalog.allTopics")}</Chip>
            {/* The picked topic leads the line, or it would sit somewhere off screen. */}
            {[...topics].sort((a, b) => Number(b.topic === filters.topic) - Number(a.topic === filters.topic)).map((t) => (
              <Chip key={t.topic} active={filters.topic === t.topic} onClick={() => setFilters({ topic: filters.topic === t.topic ? "" : t.topic, untagged: false })}>
                {t.topic} <span className="ml-1 font-normal opacity-70">{number.format(t.count)}</span>
              </Chip>
            ))}
            {untaggedCount > 0 && (
              <Chip active={filters.untagged} onClick={() => setFilters({ topic: "", untagged: !filters.untagged })}>
                {t("catalog.noTopic")} <span className="ml-1 font-normal opacity-70">{number.format(untaggedCount)}</span>
              </Chip>
            )}
          </div>
        )}

        <div className="mt-4 flex items-start gap-6">
          {rail && (
            <aside aria-label={t("catalog.topicsAria")} className="sticky top-[84px] hidden max-h-[calc(100vh-108px)] w-60 shrink-0 flex-col rounded-2xl border border-slate-200 bg-white p-2 lg:flex">
              <h2 className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("catalog.topics")}</h2>
              {topics.length > 10 && (
                <input
                  type="search"
                  value={topicFilter}
                  onChange={(event) => setTopicFilter(event.target.value)}
                  placeholder={t("catalog.findTopic")}
                  aria-label={t("catalog.findTopic")}
                  className="mx-1 mb-1 mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm focus:border-purple-500 focus:bg-white focus:outline-none"
                />
              )}
              <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {!topicFilter.trim() && topicButton(t("catalog.allTopics"), topicTotal, !filters.topic && !filters.untagged, () => setFilters({ topic: "", untagged: false }), "__all")}
                {visibleTopics.map((t) => topicButton(t.topic, t.count, filters.topic === t.topic, () => setFilters({ topic: t.topic, untagged: false })))}
                {!topicFilter.trim() && untaggedCount > 0 && topicButton(t("catalog.noTopic"), untaggedCount, filters.untagged, () => setFilters({ topic: "", untagged: true }), "__untagged")}
                {visibleTopics.length === 0 && topicFilter.trim() && <li className="px-3 py-2 text-sm text-slate-400">{t("catalog.topicNotFound")}</li>}
              </ul>
            </aside>
          )}

          <section className="min-w-0 flex-1" aria-busy={loading}>
            <div className="mb-2 flex min-h-[32px] flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-slate-500">
              <span role="status">
                {firstLoad ? t("common.loading") : total === 0 ? "" : hasFilters
                  ? t("catalog.foundCount", { count: total, n: number.format(total) })
                  : t("catalog.totalCount", { count: total, n: number.format(total) })}
              </span>
              {hasFilters && (
                <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:underline">
                  <Icon name="close" className="h-3.5 w-3.5" />
                  {t("catalog.clearFilters")}
                </button>
              )}
              {pageIds.length > 0 && selected === null && (
                <button type="button" onClick={() => { setOpenMenuId(null); setSelected(new Set()); }}
                  className="inline-flex items-center gap-1 font-semibold text-purple-700 hover:underline">
                  <Icon name="checkCircle" className="h-3.5 w-3.5" />
                  {t("catalog.selectSeveral")}
                </button>
              )}
              <div role="group" aria-label={t("catalog.sortAria")} className="ml-auto flex items-center gap-1">
                {SORTS.map((sort) => (
                  <button key={sort.value} type="button" aria-pressed={filters.sort === sort.value} onClick={() => setFilters({ sort: sort.value })}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${filters.sort === sort.value ? "bg-slate-200/80 text-slate-900" : "hover:text-slate-900"}`}>
                    {t(sort.label)}
                  </button>
                ))}
              </div>
            </div>

            {firstLoad ? (
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white" aria-hidden>
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i} className="flex animate-pulse items-center gap-4 px-4 py-3.5">
                    <span className="h-11 w-11 shrink-0 rounded-xl bg-slate-100" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-4 w-2/5 rounded bg-slate-100" />
                      <span className="block h-3 w-1/4 rounded bg-slate-100" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="rounded-2xl border border-red-200 bg-white p-8 text-center">
                <p className="font-medium text-red-600">{error}</p>
                <button type="button" onClick={() => void load()} className="mt-3 rounded-lg bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-200">
                  {t("common.retry")}
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                  <Icon name={hasFilters ? "search" : "layers"} className="h-7 w-7" />
                </div>
                {hasFilters ? (
                  <>
                    <h2 className="text-lg font-bold text-slate-800">{t("catalog.nothingFound")}</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("catalog.nothingFoundHint")}</p>
                    <button type="button" onClick={resetFilters} className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700">
                      {t("catalog.clearFilters")}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold text-slate-800">{filters.scope === "mine" ? t("catalog.noneMine") : t("catalog.none")}</h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t("catalog.createHint")}</p>
                    <Link href="/quizzes/create" className="mt-5 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700">
                      {t("catalog.create")}
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <ul className={`divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white transition-opacity ${loading ? "opacity-60" : ""}`}>
                {items.map((quiz) => (
                  <QuizRow
                    key={quiz.id}
                    quiz={quiz}
                    busy={busyId === quiz.id}
                    signedIn={Boolean(session)}
                    menuOpen={openMenuId === quiz.id}
                    onToggleMenu={() => setOpenMenuId(openMenuId === quiz.id ? null : quiz.id)}
                    onPickTopic={(topic) => setFilters({ topic, untagged: false })}
                    onTogglePrivacy={() => void handleTogglePrivacy(quiz)}
                    onDelete={() => void handleDelete(quiz)}
                    onFork={() => void handleFork(quiz)}
                    selection={selected ? { selected: selected.has(quiz.id), onToggle: () => toggleSelected([quiz.id], !selected.has(quiz.id)) } : undefined}
                  />
                ))}
              </ul>
            )}

            {!error && lastPage > 1 && items.length > 0 && (
              <nav aria-label={t("catalog.pagesAria")} className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-slate-500">
                  {number.format((filters.page - 1) * PAGE_SIZE + 1)}–{number.format(Math.min(filters.page * PAGE_SIZE, total))} / {number.format(total)}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={filters.page <= 1} onClick={() => goToPage(filters.page - 1)} aria-label={t("catalog.prevPage")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-purple-300 disabled:opacity-40 disabled:hover:border-slate-200">
                    <Icon name="chevronLeft" className="h-4 w-4" />
                  </button>
                  {pageWindow(filters.page, lastPage).map((page, index) => page === "gap" ? (
                    <span key={`gap-${index}`} className="px-1 text-slate-400">…</span>
                  ) : (
                    <button key={page} type="button" onClick={() => goToPage(page)} aria-current={page === filters.page ? "page" : undefined}
                      className={`h-10 min-w-10 rounded-xl px-2 text-sm font-semibold tabular-nums ${
                        page === filters.page ? "bg-purple-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:border-purple-300"
                      }`}>
                      {page}
                    </button>
                  ))}
                  <button type="button" disabled={filters.page >= lastPage} onClick={() => goToPage(filters.page + 1)} aria-label={t("catalog.nextPage")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-purple-300 disabled:opacity-40 disabled:hover:border-slate-200">
                    <Icon name="chevronRight" className="h-4 w-4" />
                  </button>
                </div>
              </nav>
            )}
          </section>
        </div>
      </main>

      {selected && (
        <QuizBulkBar
          count={selected.size}
          pageCount={pageIds.length}
          pageSelected={pageSelected}
          topics={knownTopics}
          busy={applying}
          onTogglePage={() => toggleSelected(pageIds, !pageSelected)}
          onApply={(change) => void applyToSelected(change)}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

export default function QuizzesCatalogPage() {
  // useSearchParams needs a Suspense boundary to prerender.
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <QuizzesCatalog />
    </Suspense>
  );
}
