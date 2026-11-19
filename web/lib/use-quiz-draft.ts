"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function quizDraftKey(email: string, quizId?: number) {
  return `quiz_draft_v1:${encodeURIComponent(email.trim().toLowerCase())}:${quizId ?? "new"}`;
}

export function useQuizDraft<T>(
  key: string | null,
  value: T,
  restore: (draft: T) => void,
  validate: (value: unknown) => value is T,
  baseUpdatedAt?: string | null,
) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const initial = useRef(value);
  const baseUpdatedAtRef = useRef(baseUpdatedAt ?? null);
  baseUpdatedAtRef.current = baseUpdatedAt ?? null;
  const restoreRef = useRef(restore);
  const validateRef = useRef(validate);
  restoreRef.current = restore;
  validateRef.current = validate;
  const hydratedKey = useRef<string | null>(null);
  const lastSaved = useRef("");
  const skip = useRef(false);
  const pendingRestore = useRef<string | null>(null);
  const complete = useRef(false);
  const latest = useRef({ key, value });
  latest.current = { key, value };

  useEffect(() => {
    if (!key) return;
    const isInitialHydration = hydratedKey.current === null;
    complete.current = false;
    hydratedKey.current = key;
    const baseline = isInitialHydration ? latest.current.value : initial.current;
    lastSaved.current = JSON.stringify(baseline);
    skip.current = true;
    setRestored(false);
    setSavedAt(null);
    setStatus("idle");
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      const currentBase = baseUpdatedAtRef.current;
      const serverUpdatedMs = currentBase ? Date.parse(currentBase) : Number.NaN;
      const draftSavedMs = typeof saved?.savedAt === "number" && Number.isFinite(saved.savedAt) ? saved.savedAt : null;
      const isStaleAgainstServer = Boolean(
        currentBase &&
          ((saved?.baseUpdatedAt && saved.baseUpdatedAt !== currentBase) ||
            (Number.isFinite(serverUpdatedMs) && (draftSavedMs === null || serverUpdatedMs > draftSavedMs)))
      );

      if (saved?.version === 1 && !isStaleAgainstServer && validateRef.current(saved.value)) {
        lastSaved.current = JSON.stringify(saved.value);
        pendingRestore.current = JSON.stringify(latest.current.value) === lastSaved.current ? null : lastSaved.current;
        restoreRef.current(saved.value);
        setRestored(true);
        setSavedAt(draftSavedMs);
        setStatus("saved");
      } else {
        if (isStaleAgainstServer) {
          localStorage.removeItem(key);
        }
        pendingRestore.current = null;
        if (!isInitialHydration) {
          restoreRef.current(initial.current);
        }
      }
    } catch { setStatus("error"); }
  }, [key]);

  const flush = useCallback(() => {
    const snapshot = latest.current;
    if (!snapshot.key || hydratedKey.current !== snapshot.key || complete.current) return;
    const serialized = JSON.stringify(snapshot.value);
    if (pendingRestore.current && serialized !== pendingRestore.current) return;
    if (serialized === lastSaved.current) return;
    try {
      const now = Date.now();
      localStorage.setItem(
        snapshot.key,
        JSON.stringify({
          version: 1,
          value: snapshot.value,
          savedAt: now,
          baseUpdatedAt: baseUpdatedAtRef.current,
        })
      );
      lastSaved.current = serialized;
      setSavedAt(now);
      setStatus("saved");
    } catch { setStatus("error"); }
  }, []);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    if (pendingRestore.current) {
      if (JSON.stringify(value) !== pendingRestore.current) return;
      pendingRestore.current = null;
    }
    if (!key || complete.current || JSON.stringify(value) === lastSaved.current) return;
    setStatus("saving");
    const timer = setTimeout(flush, 500);
    return () => clearTimeout(timer);
  }, [key, value, flush]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  const clear = useCallback((expected?: T) => {
    // An edit typed while the server was saving still needs its local draft.
    if (expected && JSON.stringify(latest.current.value) !== JSON.stringify(expected)) { flush(); return; }
    complete.current = true;
    if (key) { try { localStorage.removeItem(key); } catch { /* The saved server copy is authoritative. */ } }
  }, [key, flush]);
  return { status, restored, savedAt, clear };
}
