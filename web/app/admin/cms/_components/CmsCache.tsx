"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import type { AdminRole } from "@/types";

const MAX_ENTRIES = 100;
const MAX_AGE_MS = 60_000;

function createCmsCache() {
  const entries = new Map<string, { data: unknown[]; savedAt: number }>();
  return {
    read<T>(path: string): T[] | undefined {
      const entry = entries.get(path);
      return entry && Date.now() - entry.savedAt < MAX_AGE_MS ? entry.data as T[] : undefined;
    },
    write<T>(path: string, data: T[]) {
      entries.delete(path);
      entries.set(path, { data, savedAt: Date.now() });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    },
  };
}

const CmsCacheContext = createContext<ReturnType<typeof createCmsCache> | null>(null);
const CmsRoleContext = createContext<AdminRole | null>(null);

export function CmsCacheProvider({
  children,
  adminRole = null,
}: {
  children: ReactNode;
  adminRole?: AdminRole | null;
}) {
  const cache = useRef<ReturnType<typeof createCmsCache> | null>(null);
  if (!cache.current) cache.current = createCmsCache();
  return (
    <CmsRoleContext.Provider value={adminRole}>
      <CmsCacheContext.Provider value={cache.current}>{children}</CmsCacheContext.Provider>
    </CmsRoleContext.Provider>
  );
}

export function useCmsAdminRole(): AdminRole | null {
  return useContext(CmsRoleContext);
}

export function useCmsCache(email: string | null) {
  const shared = useContext(CmsCacheContext);
  const local = useRef({ email, cache: createCmsCache() });
  if (local.current.email !== email) local.current = { email, cache: createCmsCache() };
  return shared ?? local.current.cache;
}
