"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getConstructorSources, getConstructorTasks, getConstructorTaskTwins, getConstructorTopics } from "@/lib/api/constructor";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";
import { toggleIncludedTopic } from "@/lib/topic-filter";
import type { ConstructorQuestionType, ConstructorTask, ConstructorTopicNode } from "@/types/constructor";
import SourceFilterDropdown from "@/components/ui/SourceFilterDropdown";
import TaskPreview from "./TaskPreview";
import TopicCombobox from "./TopicCombobox";

const PAGE_SIZE = 100;
const LEVELS = ["A", "B", "C"] as const;
const TYPES: Array<{ value: ConstructorQuestionType; label: MessageKey }> = [
  { value: "mcq", label: "constructor.type.mcq" },
  { value: "mcq6", label: "constructor.type.mcq6" },
  { value: "context", label: "constructor.type.context" },
  { value: "input", label: "constructor.type.input" },
  { value: "tf", label: "constructor.type.tf" },
  { value: "select", label: "constructor.type.select" },
];

const selectClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200";

/** The bank: filters and a page of tasks, each with a button that adds it to the collection. */
export default function TaskBrowser({
  email,
  selectedIds,
  full,
  onToggle,
}: {
  email: string;
  selectedIds: Set<number>;
  full: boolean;
  onToggle: (task: ConstructorTask) => void;
}) {
  const { t } = useI18n();
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [excludedTopics, setExcludedTopics] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  // With several sources: tasks found in all of them (the default) or in any one of them.
  const [sourceMatch, setSourceMatch] = useState<"all" | "any">("all");
  const [difficulty, setDifficulty] = useState<"" | (typeof LEVELS)[number]>("");
  const [questionType, setQuestionType] = useState<"" | ConstructorQuestionType>("");
  const [topics, setTopics] = useState<string[]>([]);
  const [topicTree, setTopicTree] = useState<ConstructorTopicNode[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [items, setItems] = useState<ConstructorTask[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expandedTwinIds, setExpandedTwinIds] = useState<Set<number>>(() => new Set());
  const [twinsByTaskId, setTwinsByTaskId] = useState<Record<number, ConstructorTask[]>>({});
  const [loadingTwinsIds, setLoadingTwinsIds] = useState<Set<number>>(() => new Set());
  const [twinsErrorIds, setTwinsErrorIds] = useState<Set<number>>(() => new Set());
  const generation = useRef(0);
  const mountedRef = useRef(true);
  const inFlightTwinsRef = useRef<Set<number>>(new Set());
  const selectedTopicSet = useMemo(() => new Set(selectedTopics), [selectedTopics]);
  const selectedSourceSet = useMemo(() => new Set(selectedSources), [selectedSources]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchTwins = async (taskId: number) => {
    if (inFlightTwinsRef.current.has(taskId)) return;
    inFlightTwinsRef.current.add(taskId);
    setLoadingTwinsIds((prev) => new Set(prev).add(taskId));
    setTwinsErrorIds((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    try {
      const result = await getConstructorTaskTwins(taskId, email);
      if (!mountedRef.current) return;
      if (!result.data) {
        setTwinsErrorIds((prev) => new Set(prev).add(taskId));
        return;
      }
      setTwinsByTaskId((prev) => ({ ...prev, [taskId]: result.data!.items }));
    } finally {
      inFlightTwinsRef.current.delete(taskId);
      if (mountedRef.current) {
        setLoadingTwinsIds((prev) => {
          if (!prev.has(taskId)) return prev;
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    }
  };

  const toggleTwins = (taskId: number) => {
    const isOpen = expandedTwinIds.has(taskId);
    setExpandedTwinIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
    if (!isOpen && twinsByTaskId[taskId] === undefined) {
      void fetchTwins(taskId);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let active = true;
    void Promise.all([getConstructorTopics(email), getConstructorSources(email)]).then(([topicsRes, sourcesRes]) => {
      if (!active) return;
      if (topicsRes.data) {
        setTopics(topicsRes.data.items);
        setTopicTree(topicsRes.data.tree ?? []);
      }
      if (sourcesRes.data) setSources(sourcesRes.data.items);
    });
    return () => {
      active = false;
    };
  }, [email]);

  const query = useMemo(
    () => ({
      search: search || undefined,
      topics: selectedTopics.length > 0 ? selectedTopics : undefined,
      excludeTopics: excludedTopics.length > 0 ? excludedTopics : undefined,
      sources: selectedSources.length > 0 ? selectedSources : undefined,
      topicMatch: selectedTopics.length > 1 ? ("all" as const) : undefined,
      sourceMatch: selectedSources.length > 1 ? sourceMatch : undefined,
      difficulty: difficulty || undefined,
      questionType: questionType || undefined,
    }),
    [search, selectedTopics, excludedTopics, selectedSources, sourceMatch, difficulty, questionType],
  );

  const load = async (offset: number) => {
    const current = ++generation.current;
    setLoading(true);
    setError(false);
    const result = await getConstructorTasks({ ...query, limit: PAGE_SIZE, offset }, email);
    if (current !== generation.current) return;
    setLoading(false);
    if (!result.data) {
      setError(true);
      return;
    }
    const page = result.data;
    setTotal(page.total);
    setItems((previous) => (offset === 0 ? page.items : [...previous, ...page.items]));
  };

  useEffect(() => {
    setItems([]);
    setTotal(null);
    void load(0);
    // A new filter starts the list again; `load` reads the same query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, email]);

  return (
    <section aria-labelledby="bank-heading" className="min-w-0">
      <h2 id="bank-heading" className="text-lg font-bold text-slate-900">{t("constructor.bank")}</h2>
      <div className="mt-3 space-y-2">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchText}
            maxLength={200}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t("constructor.searchPlaceholder")}
            aria-label={t("constructor.searchAria")}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TopicCombobox
            topics={topics}
            topicTree={topicTree}
            included={selectedTopics}
            excluded={excludedTopics}
            onChange={({ included, excluded }) => {
              setSelectedTopics(included);
              setExcludedTopics(excluded);
            }}
          />
          <SourceFilterDropdown
            sources={sources}
            selectedSources={selectedSources}
            onChange={({ sources: nextSources }) => {
              setSelectedSources(nextSources);
            }}
            allLabel={t("constructor.allSources")}
            ariaLabel={t("constructor.source")}
            clearAriaLabel={t("constructor.clearSource")}
            clearLabel={t("constructor.clear")}
            doneLabel={t("constructor.done")}
            selectedCountLabel={(count) => t("constructor.selectedSourcesCount", { count })}
            searchPlaceholder={t("constructor.findSource")}
            notFoundLabel={t("constructor.sourceNotFound")}
          />
          <label className="block">
            <span className="sr-only">{t("constructor.type")}</span>
            <select
              value={questionType}
              onChange={(event) => setQuestionType(event.target.value as "" | ConstructorQuestionType)}
              className={selectClass}
            >
              <option value="">{t("constructor.allTypes")}</option>
              {TYPES.map((type) => <option key={type.value} value={type.value}>{t(type.label)}</option>)}
            </select>
          </label>
          <div role="group" aria-label={t("constructor.level")} className="flex rounded-xl bg-slate-200/70 p-1">
            {(["", ...LEVELS] as const).map((level) => (
              <button
                key={level || "all"}
                type="button"
                aria-pressed={difficulty === level}
                onClick={() => setDifficulty(level)}
                className={`flex-1 rounded-lg px-2 py-1 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  difficulty === level ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {level || t("constructor.allLevels")}
              </button>
            ))}
          </div>
        </div>
        {(selectedTopics.length > 0 || excludedTopics.length > 0 || selectedSources.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {selectedSources.length > 1 && (
              <div role="group" aria-label={t("constructor.sourceMatchAria")} className="inline-flex rounded-full bg-amber-50 p-0.5 ring-1 ring-amber-200">
                {(["all", "any"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={sourceMatch === mode}
                    onClick={() => setSourceMatch(mode)}
                    title={t(mode === "all" ? "constructor.sourceMatchAllHint" : "constructor.sourceMatchAnyHint")}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      sourceMatch === mode ? "bg-amber-500 text-white shadow-sm" : "text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    {t(mode === "all" ? "constructor.sourceMatchAll" : "constructor.sourceMatchAny")}
                  </button>
                ))}
              </div>
            )}
            {selectedSources.map((name) => (
              <span
                key={`src-chip-${name}`}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-amber-900"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedSources((prev) => prev.filter((item) => item !== name))}
                  aria-label={t("constructor.removeSourceAria", { source: name })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-amber-700 hover:bg-amber-200 hover:text-amber-950"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selectedTopics.map((name) => (
              <span
                key={`inc-${name}`}
                className="inline-flex items-center gap-1 rounded-full bg-purple-100 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-purple-800"
              >
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTopics((prev) => prev.filter((item) => item !== name))}
                  aria-label={t("constructor.removeTopicAria", { topic: name })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-purple-600 hover:bg-purple-200 hover:text-purple-900"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
            {excludedTopics.map((name) => (
              <span
                key={`exc-${name}`}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-red-700"
              >
                <span className="line-through">{name}</span>
                <button
                  type="button"
                  onClick={() => setExcludedTopics((prev) => prev.filter((item) => item !== name))}
                  aria-label={t("constructor.unexcludeTopicAria", { topic: name })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-red-500 hover:bg-red-100 hover:text-red-800"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <p role="status" className="mt-3 text-sm text-slate-500">
        {total === null ? (loading ? t("constructor.preparingShort") : "") : t("constructor.found", { count: total })}
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {t("constructor.loadError")}{" "}
          <button type="button" onClick={() => void load(items.length)} className="font-semibold underline">
            {t("constructor.retry")}
          </button>
        </p>
      )}

      <ul className="mt-2 space-y-3">
        {items.map((task) => {
          const added = selectedIds.has(task.id);
          const canToggle = added || !full;
          const twinCount = task.twin_count ?? 0;
          const twinsOpen = expandedTwinIds.has(task.id);
          const loadedTwins = twinsByTaskId[task.id];
          const twinsLoading = loadingTwinsIds.has(task.id);
          const twinsError = twinsErrorIds.has(task.id);
          const selectedTwinsCount = loadedTwins
            ? loadedTwins.reduce((count, twin) => count + (selectedIds.has(twin.id) ? 1 : 0), 0)
            : 0;
          return (
            <li
              key={task.id}
              onClick={(event) => {
                if (!canToggle) return;
                if ((event.target as HTMLElement | null)?.closest("button, a, input, select, textarea, [data-twins-panel]")) return;
                const selection = typeof window !== "undefined" ? window.getSelection() : null;
                if (selection && selection.toString().trim().length > 0) return;
                onToggle(task);
              }}
              className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                added
                  ? "cursor-pointer border-purple-300 bg-purple-50/30 ring-1 ring-purple-200 hover:border-purple-400"
                  : canToggle
                    ? "cursor-pointer border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/20"
                    : "border-slate-200 bg-white"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">#{task.id}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{task.difficulty}</span>
                {(task.sources || []).map((name) => {
                  const active = selectedSourceSet.has(name);
                  return (
                    <button
                      key={`src-${name}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSources((prev) =>
                          prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
                        );
                      }}
                      aria-pressed={active}
                      aria-label={t("constructor.filterBySourceAria", { source: name })}
                      className={`rounded-md border px-1.5 py-0.5 font-medium transition-colors ${
                        active
                          ? "border-amber-600 bg-amber-600 text-white hover:bg-amber-700"
                          : "border-amber-200/80 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
                {task.topics.map((name) => {
                  const active = selectedTopicSet.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        const next = toggleIncludedTopic(
                          { included: selectedTopics, excluded: excludedTopics },
                          name,
                        );
                        setSelectedTopics(next.included);
                        setExcludedTopics(next.excluded);
                      }}
                      aria-pressed={active}
                      className={`rounded-md px-1.5 py-0.5 transition-colors ${
                        active
                          ? "bg-purple-600 font-semibold text-white hover:bg-purple-700"
                          : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(task);
                  }}
                  disabled={!added && full}
                  aria-pressed={added}
                  aria-label={t(added ? "constructor.removeAddedAria" : "constructor.addAria", { id: task.id })}
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-40 ${
                    added ? "bg-purple-600 text-white hover:bg-purple-700" : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                  }`}
                >
                  <Icon name={added ? "check" : "plus"} className="h-4 w-4" />
                  {t(added ? "constructor.added" : "constructor.add")}
                </button>
              </div>
              <TaskPreview task={task} />
              {twinCount > 0 && (
                <div
                  data-twins-panel
                  onClick={(event) => event.stopPropagation()}
                  className="mt-3 cursor-default border-t border-slate-100 pt-2.5"
                >
                  <button
                    type="button"
                    aria-expanded={twinsOpen}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleTwins(task.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
                  >
                    <Icon
                      name="chevronDown"
                      className={`h-3.5 w-3.5 transition-transform ${twinsOpen ? "rotate-180" : ""}`}
                    />
                    <span>{t("constructor.twinsCount", { count: twinCount })}</span>
                    {selectedTwinsCount > 0 && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[11px] font-bold text-purple-700">
                        {t("constructor.twinsSelectedCount", { count: selectedTwinsCount })}
                      </span>
                    )}
                  </button>
                  {twinsOpen && (
                    <div className="mt-2 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5">
                      {twinsLoading && !loadedTwins ? (
                        <p className="flex items-center gap-2 px-1 py-1.5 text-xs text-slate-500">
                          <Icon name="loader" className="h-3.5 w-3.5 animate-spin" />
                          {t("constructor.twinsLoading")}
                        </p>
                      ) : twinsError ? (
                        <p role="alert" className="px-1 py-1 text-xs text-red-700">
                          {t("constructor.loadError")}{" "}
                          <button
                            type="button"
                            onClick={() => void fetchTwins(task.id)}
                            className="font-semibold underline"
                          >
                            {t("constructor.retry")}
                          </button>
                        </p>
                      ) : loadedTwins && loadedTwins.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-slate-500">{t("constructor.twinsEmpty")}</p>
                      ) : loadedTwins ? (
                        loadedTwins.map((twin, twinIndex) => {
                          const twinAdded = selectedIds.has(twin.id);
                          const twinCanToggle = twinAdded || !full;
                          return (
                            <div
                              key={twin.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!twinCanToggle) return;
                                if ((event.target as HTMLElement | null)?.closest("button, a, input, select, textarea")) return;
                                const selection = typeof window !== "undefined" ? window.getSelection() : null;
                                if (selection && selection.toString().trim().length > 0) return;
                                onToggle(twin);
                              }}
                              className={`rounded-xl border p-3 transition-colors ${
                                twinAdded
                                  ? "cursor-pointer border-purple-300 bg-purple-50/40 ring-1 ring-purple-200 hover:border-purple-400"
                                  : twinCanToggle
                                    ? "cursor-pointer border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/20"
                                    : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono">#{twin.id}</span>
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{twin.difficulty}</span>
                                {(twin.sources || []).map((name) => (
                                  <span
                                    key={`twin-src-${name}`}
                                    className="rounded-md border border-amber-200/80 bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800"
                                  >
                                    {name}
                                  </span>
                                ))}
                                <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">
                                  {t("constructor.twinLabel", { n: twinIndex + 1 })}
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onToggle(twin);
                                  }}
                                  disabled={!twinAdded && full}
                                  aria-pressed={twinAdded}
                                  aria-label={t(twinAdded ? "constructor.removeAddedAria" : "constructor.addAria", { id: twin.id })}
                                  className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${
                                    twinAdded ? "bg-purple-600 text-white hover:bg-purple-700" : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                                  }`}
                                >
                                  <Icon name={twinAdded ? "check" : "plus"} className="h-3.5 w-3.5" />
                                  {t(twinAdded ? "constructor.added" : "constructor.add")}
                                </button>
                              </div>
                              <TaskPreview task={twin} />
                            </div>
                          );
                        })
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {total === 0 && !loading && (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {t("constructor.noTasks")}
        </p>
      )}
      {total !== null && items.length < total && (
        <button
          type="button"
          onClick={() => void load(items.length)}
          disabled={loading}
          className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-purple-300 hover:text-purple-700 disabled:opacity-50"
        >
          {loading ? t("constructor.preparingShort") : t("constructor.loadMore")}
        </button>
      )}
    </section>
  );
}
