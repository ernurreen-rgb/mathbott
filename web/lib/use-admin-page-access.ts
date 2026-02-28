"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { checkAdminStatus } from "@/lib/api";
import { isAllowedForPage, type AdminPageKey } from "@/lib/admin-access";
import { showToast } from "@/lib/toast";
import type { AdminCheckResponse } from "@/types";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export function useAdminPageAccess(
  pageKey: AdminPageKey,
  status: SessionStatus,
  email: string | null | undefined
): {
  access: AdminCheckResponse | null;
  loading: boolean;
} {
  const router = useRouter();
  const [access, setAccess] = useState<AdminCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }
    if (status === "unauthenticated") {
      setLoading(false);
      router.push("/");
      return;
    }
    if (!email) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const { data, error } = await checkAdminStatus();
      if (cancelled) return;

      if (error || !data?.is_admin) {
        showToast.error("Қолжетім жоқ");
        router.push("/");
        setAccess(data ?? null);
        setLoading(false);
        return;
      }

      if (!isAllowedForPage(pageKey, data.role)) {
        showToast.error("Қолжетім жоқ");
        router.push("/admin");
      }

      setAccess(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pageKey, status, email, router]);

  return { access, loading };
}
