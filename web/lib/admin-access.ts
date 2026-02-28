import type { AdminRole } from "@/types";

export type AdminPageKey = "content" | "review" | "super";

export function hasContentAccess(role: AdminRole | null | undefined): boolean {
  return role === "content_editor" || role === "super_admin";
}

export function hasReviewAccess(role: AdminRole | null | undefined): boolean {
  return role === "reviewer" || role === "super_admin";
}

export function hasSuperAccess(role: AdminRole | null | undefined): boolean {
  return role === "super_admin";
}

export function isAllowedForPage(
  pageKey: AdminPageKey,
  role: AdminRole | null | undefined
): boolean {
  if (pageKey === "content") return hasContentAccess(role);
  if (pageKey === "review") return hasReviewAccess(role);
  return hasSuperAccess(role);
}
