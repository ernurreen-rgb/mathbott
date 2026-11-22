"use client";

import { useEffect, useState } from "react";

import { checkAdminStatus } from "@/lib/api";
import { knownAdminFlag, loadAdminFlag, normalizeAdminEmail } from "@/lib/admin-flag";

/** Whether to show the menu's "Admin" link; asks the API at most once per tab (see admin-flag.ts). */
export function useIsAdmin(email: string | null | undefined): boolean {
  const key = normalizeAdminEmail(email);
  // Only the in-memory answer here: storage is not readable on the server, and a first render
  // that differs from the server's would break hydration.
  const [answer, setAnswer] = useState<{ email: string; isAdmin: boolean } | null>(() => {
    const known = knownAdminFlag(key);
    return known === null ? null : { email: key, isAdmin: known };
  });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void loadAdminFlag(key, checkAdminStatus).then((isAdmin) => {
      if (cancelled) return;
      setAnswer((current) => (current?.email === key && current.isAdmin === isAdmin ? current : { email: key, isAdmin }));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return Boolean(key && answer?.email === key && answer.isAdmin);
}
