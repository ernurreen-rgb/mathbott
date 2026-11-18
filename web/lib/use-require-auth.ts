"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import {
  buildLoginRedirectHref,
  DEFAULT_AUTHENTICATED_PATH,
  resolveSafeCallbackPath,
} from "./auth-redirect";

export { buildLoginRedirectHref, DEFAULT_AUTHENTICATED_PATH, resolveSafeCallbackPath };

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
