"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getConstructorTasks, getConstructorTopics } from "@/lib/api/constructor";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";
import { toggleTopicSelection } from "@/lib/topic-filter";
import type { ConstructorQuestionType, ConstructorTask } from "@/types/constructor";
import TaskPreview from "./TaskPreview";
import TopicCombobox from "./TopicCombobox";

const PAGE_SIZE = 20;
const LEVELS = ["A", "B", "C"] as const;
const TYPES: Array<{ value: ConstructorQuestionType; label: MessageKey }> = [
  { value: "mcq", label: "constructor.type.mcq" },
  { value: "mcq6", label: "constructor.type.mcq6" },
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
  const [difficulty, setDifficulty] = useState<"" | (typeof LEVELS)[number]>("");
  const [questionType, setQuestionType] = useState<"" | ConstructorQuestionType>("");
  const [topics, setTopics] = useState<string[]>([]);
  const [items, setItems] = useState<ConstructorTask[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const selectedTopicSet = useMemo(() => new Set(selectedTopics), [selectedTopics]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let active = true;
    void getConstructorTopics(email).then((result) => {
      if (active && result.data) setTopics(result.data.items);
    });
    return () => {
      active = false;
    };
  }, [email]);

  const query = useMemo(
    () => ({
      search: search || undefined,
      topics: selectedTopics.length > 0 ? selectedTopics : undefined,
      topicMatch: selectedTopics.length > 1 ? ("all" as const) : undefined,
      difficulty: difficulty || undefined,
      questionType: questionType || undefined,
    }),
    [search, selectedTopics, difficulty, questionType],
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <TopicCombobox topics={topics} values={selectedTopics} onChange={setSelectedTopics} />
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
        {selectedTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {selectedTopics.map((name) => (
              <span
                key={name}
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
          return (
            <li key={task.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${added ? "border-purple-300 ring-1 ring-purple-200" : "border-slate-200"}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono">#{task.id}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{task.difficulty}</span>
                {task.topics.map((name) => {
                  const active = selectedTopicSet.has(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedTopics((prev) => toggleTopicSelection(prev, name))}
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
                  onClick={() => onToggle(task)}
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
