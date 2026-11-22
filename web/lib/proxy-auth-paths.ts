/**
 * Path classification for the Next.js -> FastAPI trusted proxy boundary.
 */

const SENSITIVE_PREFIXES = [
  "/api/admin/",
  "/api/export/admin/",
  "/api/export/user/",
  "/api/mini-lessons",
  "/api/presence",
  "/api/push/",
  "/api/reports",
  "/api/task/check",
  "/api/trial-test-reports",
  "/api/trial-tests",
  "/api/user/web",
] as const;

const OPTIONAL_IDENTITY_ROOTS = new Set([
  "client-timings",
  "quizzes",
  "quiz-sessions",
  "modules",
  "lessons",
  "tasks",
  "trial-tests",
]);

export function isPublicTrialTestCatalogPath(
  pathSegments: string[],
  method: string,
  searchParams?: URLSearchParams
): boolean {
  if (method.toUpperCase() !== "GET") return false;
  if (pathSegments[0] !== "trial-tests") return false;
  if (searchParams) {
    const attemptedOnly = (searchParams.get("attempted_only") || "").trim().toLowerCase();
    if (attemptedOnly === "true" || attemptedOnly === "1") {
      return false;
    }
  }
  if (pathSegments.length === 1) return true; // GET /api/trial-tests
  if (pathSegments.length === 2) {
    const second = pathSegments[1];
    return second === "folders" || second === "categories" || /^\d+$/.test(second);
  }
  return false;
}

export function pathRequiresProxyUserEmail(
  pathSegments: string[],
  method = "GET",
  searchParams?: URLSearchParams
): boolean {
  if (isPublicTrialTestCatalogPath(pathSegments, method, searchParams)) {
    return false;
  }
  const path = `/api/${pathSegments.join("/")}`;
  return (
    SENSITIVE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    (path.startsWith("/api/tasks/") && path.endsWith("/questions/check"))
  );
}

export function pathSupportsOptionalProxyIdentity(pathSegments: string[]): boolean {
  return OPTIONAL_IDENTITY_ROOTS.has(pathSegments[0] || "");
}
