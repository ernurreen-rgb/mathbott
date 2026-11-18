export const DEFAULT_AUTHENTICATED_PATH = "/modules";

/** Return a safe in-app callback path, rejecting protocol-relative or external URLs. */
export function resolveSafeCallbackPath(
  raw: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  if (
    trimmed === "/" ||
    trimmed.startsWith("/?") ||
    trimmed.startsWith("/#") ||
    trimmed.startsWith("/api/")
  ) {
    return fallback;
  }
  return trimmed;
}

export function buildLoginRedirectHref(targetPath?: string | null): string {
  const safe = resolveSafeCallbackPath(targetPath, "");
  return safe ? `/?callbackUrl=${encodeURIComponent(safe)}` : "/";
}
