"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { getAdminTrialTests } from "@/lib/api";
import type { BankPlacementTask, TrialTest } from "@/types";

const TASK_CACHE_AGE = 60_000;

function useTrialTestsData() {
  const { data: session } = useSession();
  const email = session?.user?.email || null;
  const [tests, setTests] = useState<TrialTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const tasks = useRef(new Map<number, { items: BankPlacementTask[]; savedAt: number }>());

  const refreshTests = useCallback(async () => {
    if (!email) return;
    const request = ++version.current;
    try {
      const response = await getAdminTrialTests(email);
      if (request !== version.current) return;
      if (response.error) setError(response.error);
      else { setTests(response.data || []); setError(null); }
    } catch { if (request === version.current) setError("Тесттерді жүктеу мүмкін болмады."); }
    finally { if (request === version.current) setLoading(false); }
  }, [email]);

  useEffect(() => {
    void refreshTests();
    return () => { version.current += 1; };
  }, [refreshTests]);

  const readTasks = useCallback((testId: number) => {
    const entry = tasks.current.get(testId);
    return entry && Date.now() - entry.savedAt < TASK_CACHE_AGE ? entry.items : undefined;
  }, []);

  const writeTasks = useCallback((testId: number, items: BankPlacementTask[]) => {
    tasks.current.delete(testId);
    tasks.current.set(testId, { items, savedAt: Date.now() });
    if (tasks.current.size > 50) tasks.current.delete(tasks.current.keys().next().value!);
    setTests((previous) => previous.map((test) => test.id === testId ? { ...test, task_count: items.length } : test));
  }, []);

  return { email, tests, loading, error, refreshTests, readTasks, writeTasks };
}

const TrialTestsContext = createContext<ReturnType<typeof useTrialTestsData> | null>(null);

export function TrialTestsProvider({ children }: { children: ReactNode }) {
  const value = useTrialTestsData();
  return <TrialTestsContext.Provider value={value}>{children}</TrialTestsContext.Provider>;
}

export function useTrialTests() {
  const value = useContext(TrialTestsContext);
  if (!value) throw new Error("TrialTestsProvider is required");
  return value;
}

export const normalizeCategory = (category?: string | null) => category?.trim() || "Жалпы";
export const trialFolderPath = (category: string) => `/admin/trial-tests/folders/${encodeURIComponent(normalizeCategory(category))}`;
