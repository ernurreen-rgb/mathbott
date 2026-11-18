"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Return a safe in-app callback path, rejecting protocol-relative or external URLs. */
export function resolveSafeCallbackPath(
  raw: string | null | undefined,
  fallback = "/trial-test",
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  if (trimmed === "/" || trimmed.startsWith("/?") || trimmed.startsWith("/api/")) {
    return fallback;
  }
  return trimmed;
}

export function buildLoginRedirectHref(targetPath?: string | null): string {
  const safe = resolveSafeCallbackPath(targetPath, "");
  return safe ? `/?callbackUrl=${encodeURIComponent(safe)}` : "/";
}

/** Redirect unauthenticated visitors to the sign-in page while preserving their intended route. */
export function useRequireAuth() {
  const sessionState = useSession();
  const router = useRouter();
  const { status } = sessionState;

  useEffect(() => {
    if (status !== "unauthenticated") return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/";
    router.replace(buildLoginRedirectHref(currentPath));
  }, [status, router]);

  return sessionState;
}
