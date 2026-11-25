"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/provider";
import { filterTopics, toggleExcludedTopic, toggleIncludedTopic } from "@/lib/topic-filter";

/**
 * Searchable multi-select topic dropdown supporting both inclusion ("must have tag")
 * and exclusion ("must NOT have tag") inside one control.
 */
export default function TopicCombobox({
  topics,
  included,
  excluded,
  onChange,
  maxSelected = Number.POSITIVE_INFINITY,
}: {
  topics: string[];
  included: string[];
  excluded: string[];
  onChange: (next: { included: string[]; excluded: string[] }) => void;
  maxSelected?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxId = useId();

  const includedSet = useMemo(() => new Set(included), [included]);
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const filteredTopics = useMemo(() => filterTopics(topics, query), [topics, query]);
  const hasQuery = query.trim().length > 0;
  const hasAnySelection = included.length > 0 || excluded.length > 0;

  // When search is empty, prepend "All topics", then pinned included + excluded tags, then the rest.
  const options = useMemo<Array<{ value: string; label: string }>>(() => {
    if (hasQuery) {
      return filteredTopics.map((name) => ({ value: name, label: name }));
    }
    const pinnedIncluded = included.map((name) => ({ value: name, label: name }));
    const pinnedExcluded = excluded
      .filter((name) => !includedSet.has(name))
      .map((name) => ({ value: name, label: name }));
    const rest = filteredTopics
      .filter((name) => !includedSet.has(name) && !excludedSet.has(name))
      .map((name) => ({ value: name, label: name }));
    return [{ value: "", label: t("constructor.allTopics") }, ...pinnedIncluded, ...pinnedExcluded, ...rest];
  }, [filteredTopics, hasQuery, included, excluded, includedSet, excludedSet, t]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current.length = options.length;
    const el = optionRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex, options.length]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  };

  const handleToggleInclude = (optionValue: string) => {
    if (!optionValue) {
      onChange({ included: [], excluded: [] });
      closeMenu(true);
      return;
    }
    onChange(toggleIncludedTopic({ included, excluded }, optionValue, maxSelected));
    if (query) {
      setQuery("");
    }
    searchInputRef.current?.focus();
  };

  const handleToggleExclude = (optionValue: string) => {
    if (!optionValue) return;
    onChange(toggleExcludedTopic({ included, excluded }, optionValue, maxSelected));
    if (query) {
      setQuery("");
    }
    searchInputRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeMenu(true);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (options.length > 0) {
        setActiveIndex((prev) => (prev + 1) % options.length);
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length > 0) {
        setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = options[activeIndex];
      if (picked) {
        handleToggleInclude(picked.value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  };

  const triggerLabel = !hasAnySelection
    ? t("constructor.allTopics")
    : included.length > 0 && excluded.length > 0
      ? t("constructor.topicsFilterSummary", { included: included.length, excluded: excluded.length })
      : included.length === 1
        ? included[0]
        : included.length > 1
          ? t("constructor.selectedTopicsCount", { count: included.length })
          : excluded.length === 1
            ? excluded[0]
            : t("constructor.excludedTopicsCount", { count: excluded.length });

  const atIncludeLimit = included.length >= maxSelected;
  const atExcludeLimit = excluded.length >= maxSelected;
  const onlyExcluded = included.length === 0 && excluded.length > 0;
  const onlySingleExcluded = included.length === 0 && excluded.length === 1;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex w-full items-center rounded-xl border bg-white text-sm text-slate-800 transition-colors ${
          open
            ? "border-purple-400 ring-2 ring-purple-200"
            : "border-slate-200 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200"
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={t("constructor.topic")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          onClick={() => (open ? closeMenu(false) : setOpen(true))}
          onKeyDown={handleTriggerKeyDown}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left leading-5 focus:outline-none"
        >
          <span
            className={`truncate ${
              onlySingleExcluded
                ? "font-medium text-red-700 line-through"
                : onlyExcluded
                  ? "font-medium text-red-700"
                  : hasAnySelection
                    ? "font-medium text-slate-900"
                    : "text-slate-800"
            }`}
          >
            {triggerLabel}
          </span>
          <Icon
            name="chevronDown"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-purple-600" : ""}`}
          />
        </button>

        {hasAnySelection && (
          <button
            type="button"
            onClick={() => {
              onChange({ included: [], excluded: [] });
              setQuery("");
            }}
            aria-label={t("constructor.clearTopic")}
            className="mr-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:right-auto sm:min-w-[320px] sm:max-w-[400px]">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-activedescendant={options[activeIndex] ? `${listboxId}-opt-${activeIndex}` : undefined}
                aria-label={t("constructor.findTopic")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("constructor.findTopic")}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:bg-white focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t("catalog.clearSearch")}
                  className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-700"
                >
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-slate-400">{t("constructor.topicLegend")}</p>
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={t("constructor.topic")}
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-sm text-slate-400">
                {t("constructor.topicNotFound")}
              </li>
            ) : (
              options.map((option, index) => {
                const isAll = option.value === "";
                const isIncluded = isAll ? !hasAnySelection : includedSet.has(option.value);
                const isExcluded = !isAll && excludedSet.has(option.value);
                const isActive = index === activeIndex;
                const includeDisabled = !isAll && !isIncluded && atIncludeLimit;
                const excludeDisabled = !isAll && !isExcluded && atExcludeLimit;
                return (
                  <li key={option.value || "__all__"} role="presentation">
                    <div
                      id={`${listboxId}-opt-${index}`}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      role="option"
                      aria-selected={isIncluded || isExcluded}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex items-center gap-1 pr-2 transition-colors ${
                        isExcluded
                          ? "bg-red-50/70"
                          : isActive
                            ? "bg-purple-50"
                            : "hover:bg-slate-50"
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={includeDisabled}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleToggleInclude(option.value)}
                        className={`flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 pr-1 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                          isExcluded
                            ? "font-medium text-red-700 line-through"
                            : isIncluded
                              ? "font-semibold text-purple-800"
                              : "text-slate-800"
                        }`}
                      >
                        {!isAll && (
                          <span
                            aria-hidden="true"
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              isIncluded
                                ? "border-purple-600 bg-purple-600 text-white"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isIncluded && <Icon name="check" className="h-3 w-3" />}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {isAll && isIncluded && <Icon name="check" className="h-4 w-4 shrink-0 text-purple-600" />}
                      </button>

                      {!isAll && (
                        <button
                          type="button"
                          tabIndex={-1}
                          disabled={excludeDisabled}
                          aria-pressed={isExcluded}
                          onMouseDown={(event) => event.preventDefault()}
                          aria-label={t(
                            isExcluded ? "constructor.unexcludeTopicAria" : "constructor.excludeTopicAria",
                            { topic: option.label },
                          )}
                          title={t(
                            isExcluded ? "constructor.unexcludeTopicAria" : "constructor.excludeTopicAria",
                            { topic: option.label },
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleToggleExclude(option.value);
                          }}
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                            isExcluded
                              ? "bg-red-600 text-white hover:bg-red-700"
                              : "text-slate-400 hover:bg-red-100 hover:text-red-700"
                          }`}
                        >
                          −
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {hasAnySelection && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  onChange({ included: [], excluded: [] });
                  searchInputRef.current?.focus();
                }}
                className="font-semibold text-slate-500 hover:text-slate-800"
              >
                {t("constructor.clear")}
              </button>
              <button
                type="button"
                onClick={() => closeMenu(true)}
                className="rounded-lg bg-purple-600 px-3 py-1 font-semibold text-white hover:bg-purple-700"
              >
                {t("constructor.done")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
