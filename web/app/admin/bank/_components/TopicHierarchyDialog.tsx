"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getAdminBankCatalog, updateAdminBankTopicParent } from "@/lib/api";
import type { BankCatalogTopic } from "@/types";

type FilterMode = "all" | "roots" | "children";

type Props = {
  open: boolean;
  email: string;
  onClose: () => void;
  onUpdated: () => void;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function collectDescendantIds(topicId: number, childrenByParent: Map<number, BankCatalogTopic[]>): Set<number> {
  const result = new Set<number>();
  const stack = [...(childrenByParent.get(topicId) || [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current.id)) continue;
    result.add(current.id);
    const kids = childrenByParent.get(current.id);
    if (kids) stack.push(...kids);
  }
  return result;
}

export default function TopicHierarchyDialog({ open, email, onClose, onUpdated }: Props) {
  const [topics, setTopics] = useState<BankCatalogTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("all");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await getAdminBankCatalog(email, "");
    if (err || !data) {
      setError(err || "Тақырыптарды жүктеу мүмкін болмады.");
    } else {
      setTopics(data.topics || []);
    }
    setLoading(false);
  }, [email]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setMode("all");
    setSavedId(null);
    void loadTopics();
  }, [open, loadTopics]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const { byId, childrenByParent, orderedRows, rootTopics, otherTopics } = useMemo(() => {
    const map = new Map<number, BankCatalogTopic>();
    for (const item of topics) map.set(item.id, item);

    const children = new Map<number, BankCatalogTopic[]>();
    const roots: BankCatalogTopic[] = [];
    const nonRoots: BankCatalogTopic[] = [];
    for (const item of topics) {
      const pid = item.parent_id ?? null;
      if (pid !== null && pid !== item.id && map.has(pid)) {
        const list = children.get(pid);
        if (list) list.push(item);
        else children.set(pid, [item]);
        nonRoots.push(item);
      } else {
        roots.push(item);
      }
    }

    // Build pre-order flattened rows with depth and ancestor path.
    const rows: Array<{ topic: BankCatalogTopic; depth: number; path: string[]; childCount: number }> = [];
    const visited = new Set<number>();
    const visit = (item: BankCatalogTopic, depth: number, path: string[]) => {
      if (visited.has(item.id)) return;
      visited.add(item.id);
      const kids = children.get(item.id) || [];
      rows.push({ topic: item, depth, path, childCount: kids.length });
      const nextPath = [...path, item.name];
      for (const child of kids) visit(child, depth + 1, nextPath);
    };
    for (const root of roots) visit(root, 0, []);
    // Safety net for any cyclic rows left over.
    for (const item of topics) {
      if (!visited.has(item.id)) visit(item, 0, []);
    }

    return {
      byId: map,
      childrenByParent: children,
      orderedRows: rows,
      rootTopics: roots,
      otherTopics: nonRoots,
    };
  }, [topics]);

  const filteredRows = useMemo(() => {
    const q = normalize(query);
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    return orderedRows.filter(({ topic, path }) => {
      const isRoot = !topic.parent_id || !byId.has(topic.parent_id);
      if (mode === "roots" && !isRoot) return false;
      if (mode === "children" && isRoot) return false;
      if (tokens.length === 0) return true;
      const haystack = normalize(`${path.join(" ")} ${topic.name}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [orderedRows, query, mode, byId]);

  const handleParentChange = async (topic: BankCatalogTopic, rawValue: string) => {
    const nextParentId = rawValue === "" ? null : Number(rawValue);
    if ((topic.parent_id ?? null) === nextParentId) return;

    setSavingId(topic.id);
    setSavedId(null);
    setError(null);
    const { data, error: err } = await updateAdminBankTopicParent(topic.id, nextParentId, email);
    setSavingId(null);
    if (err || !data) {
      setError(err || "Ата-аналық бөлімді сақтау мүмкін болмады.");
      return;
    }
    setTopics((prev) =>
      prev.map((item) =>
        item.id === topic.id
          ? { ...item, parent_id: data.parent_id, parent_name: data.parent_name }
          : item,
      ),
    );
    setSavedId(topic.id);
    onUpdated();
  };

  if (!open) return null;

  const isFiltered = query.trim().length > 0 || mode !== "all";
  const rootsCount = rootTopics.length;
  const childrenCount = topics.length - rootsCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-hierarchy-title"
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 id="topic-hierarchy-title" className="text-lg font-bold text-slate-900">
              Тақырыптар ағашы
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Құрастырғышта негізгі бөлімдер бірінші көрсетіледі, ішкі тақырыптар солардың ішінде ашылады.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <Icon name="close" className="h-4 w-4" />
            Жабу
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Тақырып немесе бөлім атауы..."
              aria-label="Тақырыптарды іздеу"
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-800 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          <div role="group" aria-label="Көрсету режимі" className="inline-flex rounded-lg bg-slate-200/70 p-0.5 text-xs">
            {(
              [
                { id: "all", label: `Барлығы (${topics.length})` },
                { id: "roots", label: `Негізгі (${rootsCount})` },
                { id: "children", label: `Ішкі (${childrenCount})` },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                onClick={() => setMode(item.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                  mode === item.id ? "bg-white text-purple-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-500">Тақырыптар жүктелуде...</p>
          ) : filteredRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Сәйкес тақырып табылмады.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredRows.map(({ topic, depth, path, childCount }) => {
                const blockedIds = collectDescendantIds(topic.id, childrenByParent);
                blockedIds.add(topic.id);
                const isSaving = savingId === topic.id;
                const isSaved = savedId === topic.id;
                const indentPx = !isFiltered ? Math.min(depth, 3) * 20 : 0;

                return (
                  <li
                    key={topic.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1" style={{ paddingLeft: `${indentPx}px` }}>
                      <div className="flex flex-wrap items-center gap-2">
                        {!isFiltered && depth > 0 && (
                          <span aria-hidden="true" className="text-xs text-slate-300">
                            ↳
                          </span>
                        )}
                        <span
                          className={`truncate text-sm ${
                            depth === 0 ? "font-semibold text-slate-900" : "text-slate-800"
                          }`}
                        >
                          {topic.name}
                        </span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 tabular-nums">
                          {topic.task_count} есеп
                        </span>
                        {childCount > 0 && (
                          <span className="rounded-md bg-purple-50 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
                            {childCount} ішкі
                          </span>
                        )}
                      </div>
                      {isFiltered && path.length > 0 && (
                        <p className="mt-0.5 text-[11px] text-slate-400">{path.join(" › ")}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isSaving ? (
                        <span className="text-xs text-slate-400">Сақталуда…</span>
                      ) : isSaved ? (
                        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                          <Icon name="check" className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      <select
                        aria-label={`«${topic.name}» тақырыбының негізгі бөлімі`}
                        value={topic.parent_id ? String(topic.parent_id) : ""}
                        disabled={savingId !== null}
                        onChange={(event) => void handleParentChange(topic, event.target.value)}
                        className="w-56 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200 disabled:opacity-50"
                      >
                        <option value="">— Негізгі бөлім (жоғарғы деңгей) —</option>
                        <optgroup label="Негізгі бөлімдер">
                          {rootTopics
                            .filter((candidate) => !blockedIds.has(candidate.id))
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.name}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Ішкі бөлімдер (2-деңгей)">
                          {otherTopics
                            .filter((candidate) => !blockedIds.has(candidate.id))
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.parent_name ? `${candidate.parent_name} › ${candidate.name}` : candidate.name}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
