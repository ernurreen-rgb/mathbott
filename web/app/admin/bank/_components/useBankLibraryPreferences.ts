"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { emptyLibraryFilters, readLibraryFilters, type BankLibraryFilters, type BankSavedView } from "./library-model";

const key = (kind: string, email: string) => `qazmath.bank.${kind}.v1:${encodeURIComponent(email.toLowerCase())}`;

export function useBankLibraryPreferences(email: string | null) {
  const [state, setState] = useState<{ owner: string | null; filters: BankLibraryFilters; views: BankSavedView[] }>({ owner: null, filters: emptyLibraryFilters(), views: [] });
  const owner = useRef(email);
  owner.current = email;
  useEffect(() => {
    if (!email) return;
    let filters = emptyLibraryFilters();
    let views: BankSavedView[] = [];
    try { filters = readLibraryFilters(JSON.parse(sessionStorage.getItem(key("library", email)) || "null")); } catch { /* Storage is optional. */ }
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key("views", email)) || "[]");
      if (Array.isArray(stored)) views = stored.filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && v.name.trim())
        .slice(0, 20).map((v) => ({ id: v.id, name: v.name.slice(0, 64), filters: { ...readLibraryFilters(v.filters), offset: 0 } }));
    } catch { /* Storage is optional. */ }
    setState({ owner: email, filters, views });
  }, [email]);
  const ready = !!email && state.owner === email;
  useEffect(() => {
    if (!ready || !email) return;
    try { sessionStorage.setItem(key("library", email), JSON.stringify(state.filters)); } catch { /* Storage is optional. */ }
    try { localStorage.setItem(key("views", email), JSON.stringify(state.views)); } catch { /* Storage is optional. */ }
  }, [email, ready, state]);
  const setFilters = useCallback((update: BankLibraryFilters | ((previous: BankLibraryFilters) => BankLibraryFilters)) => {
    setState((previous) => {
      if (!email || owner.current !== email || previous.owner !== email) return previous;
      return { ...previous, filters: typeof update === "function" ? update(previous.filters) : update };
    });
  }, [email]);
  const saveView = (name: string) => {
    const trimmed = name.trim().slice(0, 64);
    if (!trimmed || !ready) return;
    setState((previous) => {
      if (previous.owner !== email || owner.current !== email) return previous;
      const existing = previous.views.find((v) => v.name.toLowerCase() === trimmed.toLowerCase());
      const view: BankSavedView = { id: existing?.id || crypto.randomUUID(), name: trimmed, filters: { ...previous.filters, offset: 0 } };
      return { ...previous, views: [...previous.views.filter((v) => v.id !== view.id), view].slice(-20) };
    });
  };
  const removeView = (id: string) => setState((previous) => previous.owner === email && owner.current === email
    ? { ...previous, views: previous.views.filter((view) => view.id !== id) } : previous);
  return { ready, filters: ready ? state.filters : emptyLibraryFilters(), views: ready ? state.views : [], setFilters, saveView, removeView };
}
