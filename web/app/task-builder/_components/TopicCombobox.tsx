"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/provider";
import { filterTopics } from "@/lib/topic-filter";

/** Searchable topic dropdown for fast selection across large topic lists. */
export default function TopicCombobox({
  topics,
  value,
  onChange,
}: {
  topics: string[];
  value: string;
  onChange: (topic: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const filteredTopics = useMemo(() => filterTopics(topics, query), [topics, query]);
  const hasQuery = query.trim().length > 0;

  // When search is empty, prepend the "All topics" option ("") at index 0.
  const options = useMemo<Array<{ value: string; label: string }>>(() => {
    const items = filteredTopics.map((name) => ({ value: name, label: name }));
    return hasQuery ? items : [{ value: "", label: t("constructor.allTopics") }, ...items];
  }, [filteredTopics, hasQuery, t]);

  // Keep activeIndex within bounds whenever filtered options change.
  useEffect(() => {
    if (!open) return;
    if (!hasQuery && value) {
      const selectedIdx = options.findIndex((opt) => opt.value === value);
      setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    } else {
      setActiveIndex(0);
    }
  }, [open, query, hasQuery, value, options]);

  // Focus the search box as soon as the dropdown opens.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Close when clicking/tapping outside the combobox.
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

  // Keep keyboard-highlighted option scrolled into view.
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

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    closeMenu(true);
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
        selectValue(picked.value);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  };

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
          aria-controls={listboxId}
          onClick={() => (open ? closeMenu(false) : setOpen(true))}
          onKeyDown={handleTriggerKeyDown}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left leading-5 focus:outline-none"
        >
          <span className={`truncate ${value ? "font-medium text-slate-900" : "text-slate-800"}`}>
            {value || t("constructor.allTopics")}
          </span>
          <Icon
            name="chevronDown"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-purple-600" : ""}`}
          />
        </button>

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
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
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:right-auto sm:min-w-[280px] sm:max-w-[360px]">
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
          </div>

          <ul
            id={listboxId}
            role="listbox"
            aria-label={t("constructor.topic")}
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-sm text-slate-400">
                {t("constructor.topicNotFound")}
              </li>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <li key={option.value || "__all__"} role="presentation">
                    <button
                      id={`${listboxId}-opt-${index}`}
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectValue(option.value)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? "bg-purple-50 text-purple-900"
                          : "text-slate-800 hover:bg-slate-50"
                      } ${isSelected ? "font-semibold" : ""}`}
                    >
                      <span className="truncate">{option.label}</span>
                      {isSelected && <Icon name="check" className="h-4 w-4 shrink-0 text-purple-600" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
