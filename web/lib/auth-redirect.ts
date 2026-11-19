export const DEFAULT_AUTHENTICATED_PATH = "/modules";

/** Return a safe in-app callback path, rejecting protocol-relative, backslash, control-char, or /api/ targets. */
export function resolveSafeCallbackPath(
  raw: string | null | undefined,
  fallback = DEFAULT_AUTHENTICATED_PATH,
): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return fallback;
  }
  try {
    const sentinelOrigin = "https://qazmath.invalid";
    const parsed = new URL(trimmed, sentinelOrigin);
    if (parsed.origin !== sentinelOrigin) {
      return fallback;
    }
    const normalizedPath = parsed.pathname;
    if (
      normalizedPath === "/" ||
      normalizedPath === "/api" ||
      normalizedPath.startsWith("/api/")
    ) {
      return fallback;
    }
    return `${normalizedPath}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildLoginRedirectHref(targetPath?: string | null): string {
  const safe = resolveSafeCallbackPath(targetPath, "");
  return safe ? `/?callbackUrl=${encodeURIComponent(safe)}` : "/";
}
