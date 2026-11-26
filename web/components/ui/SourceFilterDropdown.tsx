"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

type Props = {
  sources: string[];
  selectedSources: string[];
  includeSourceless?: boolean;
  onChange: (next: { sources: string[]; includeSourceless: boolean }) => void;
  allLabel: string;
  noneLabel?: string;
  ariaLabel: string;
  clearAriaLabel: string;
  clearLabel: string;
  doneLabel: string;
  selectedCountLabel: (count: number) => string;
  searchPlaceholder?: string;
  notFoundLabel?: string;
  variant?: "builder" | "admin";
};

/** Multi-select dropdown for task sources with an optional "no source" toggle. */
export default function SourceFilterDropdown({
  sources,
  selectedSources,
  includeSourceless = false,
  onChange,
  allLabel,
  noneLabel,
  ariaLabel,
  clearAriaLabel,
  clearLabel,
  doneLabel,
  selectedCountLabel,
  searchPlaceholder = "",
  notFoundLabel = "",
  variant = "builder",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const showSourceless = Boolean(noneLabel);
  const effectiveSourceless = showSourceless && includeSourceless;
  const selectedSet = useMemo(() => new Set(selectedSources), [selectedSources]);
  const selectedTotal = selectedSources.length + (effectiveSourceless ? 1 : 0);
  const hasSelection = selectedTotal > 0;
  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sources.filter((name) => name.toLowerCase().includes(q)) : sources;
  }, [sources, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleSource = (name: string) => {
    const exists = selectedSet.has(name);
    onChange({
      sources: exists ? selectedSources.filter((item) => item !== name) : [...selectedSources, name],
      includeSourceless: effectiveSourceless,
    });
  };

  const singleLabel =
    selectedSources.length === 1 && !effectiveSourceless
      ? selectedSources[0]
      : selectedSources.length === 0 && effectiveSourceless && noneLabel
        ? noneLabel
        : "";
  const triggerLabel = !hasSelection ? allLabel : singleLabel || selectedCountLabel(selectedTotal);

  const isAdmin = variant === "admin";
  const shellClass = isAdmin
    ? `relative flex min-h-[36px] items-center rounded-[7px] border bg-white text-[12px] text-[#596375] dark:text-fg-muted ${
        open ? "border-[#8453dc] ring-2 ring-[#ede6fb] dark:ring-brand-soft" : "border-[#dfe3eb] dark:border-line"
      }`
    : `relative flex w-full items-center rounded-xl border bg-white text-sm text-slate-800 transition-colors ${
        open
          ? "border-purple-400 ring-2 ring-purple-200"
          : "border-slate-200 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200"
      }`;

  const triggerClass = isAdmin
    ? "flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-[6px] text-left focus:outline-none"
    : "flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left leading-5 focus:outline-none";

  return (
    <div ref={containerRef} className={shellClass}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={triggerClass}
      >
        <span className={`truncate ${hasSelection ? "font-medium text-slate-900" : ""}`}>{triggerLabel}</span>
        <Icon
          name="chevronDown"
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180 text-purple-600" : ""}`}
        />
      </button>

      {hasSelection && (
        <button
          type="button"
          onClick={() => {
            onChange({ sources: [], includeSourceless: false });
            setQuery("");
          }}
          aria-label={clearAriaLabel}
          className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 min-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:min-w-[240px]">
          {sources.length > 6 && searchPlaceholder && (
            <div className="border-b border-slate-100 p-2">
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-purple-400 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={ariaLabel}
            className="max-h-64 overflow-y-auto py-1 text-sm"
          >
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={!hasSelection}
                onClick={() => {
                  onChange({ sources: [], includeSourceless: false });
                  setOpen(false);
                  setQuery("");
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50 ${
                  !hasSelection ? "font-semibold text-purple-800" : "text-slate-800"
                }`}
              >
                <span>{allLabel}</span>
                {!hasSelection && <Icon name="check" className="h-4 w-4 shrink-0 text-purple-600" />}
              </button>
            </li>

            {filteredSources.length === 0 && query.trim() ? (
              <li className="px-3 py-2 text-center text-xs text-slate-400">{notFoundLabel}</li>
            ) : (
              filteredSources.map((name) => {
                const checked = selectedSet.has(name);
                return (
                  <li key={name} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggleSource(name)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${
                        checked ? "font-semibold text-purple-800" : "text-slate-800"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          checked ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {checked && <Icon name="check" className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                    </button>
                  </li>
                );
              })
            )}

            {showSourceless && (
              <li role="presentation" className="mt-1 border-t border-slate-100 pt-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={effectiveSourceless}
                  onClick={() => onChange({ sources: selectedSources, includeSourceless: !effectiveSourceless })}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 ${
                    effectiveSourceless ? "font-semibold text-purple-800" : "text-slate-800"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      effectiveSourceless ? "border-purple-600 bg-purple-600 text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    {effectiveSourceless && <Icon name="check" className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                </button>
              </li>
            )}
          </ul>

          {hasSelection && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  onChange({ sources: [], includeSourceless: false });
                  setQuery("");
                }}
                className="font-semibold text-slate-500 hover:text-slate-800"
              >
                {clearLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  triggerRef.current?.focus();
                }}
                className="rounded-lg bg-purple-600 px-3 py-1 font-semibold text-white hover:bg-purple-700"
              >
                {doneLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
