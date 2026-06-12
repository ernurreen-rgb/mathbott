import { apiPath, fetchWithErrorHandling } from "./client";
import { AdminCheckResponse, AdminRole, AdminRoleListResponse, AdminRoleUpdateRequest, AdminRoleUpdateResponse, AdminRoleRestoreRequest, AdminRoleRestoreResponse } from "@/types";


export async function checkAdminStatus(email?: string): Promise<{ data: AdminCheckResponse | null; error: string | null }> {
  const url = email
    ? `${apiPath("admin/check")}?email=${encodeURIComponent(email)}`
    : apiPath("admin/check");
  return fetchWithErrorHandling<AdminCheckResponse>(
    url
  );
}


export async function getAdminRoles(
  email: string,
  params?: { search?: string; role?: AdminRole | ""; limit?: number; offset?: number }
): Promise<{ data: AdminRoleListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  if (params?.search && params.search.trim()) query.set("search", params.search.trim());
  if (params?.role && params.role.trim()) query.set("role", params.role.trim());
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));
  return fetchWithErrorHandling<AdminRoleListResponse>(
    `${apiPath("admin/roles")}?${query.toString()}`
  );
}


export async function setAdminRoleBySuper(
  email: string,
  payload: AdminRoleUpdateRequest
): Promise<{ data: AdminRoleUpdateResponse | null; error: string | null }> {
  return fetchWithErrorHandling<AdminRoleUpdateResponse>(
    `${apiPath("admin/roles")}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}


export async function restoreAdminRoleFromAudit(
  email: string,
  payload: AdminRoleRestoreRequest
): Promise<{ data: AdminRoleRestoreResponse | null; error: string | null }> {
  try {
    const response = await fetch(`${apiPath("admin/roles/restore")}?email=${encodeURIComponent(email)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();
    let parsed: any = null;
    if (contentType.includes("application/json") && responseText) {
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const detail = parsed?.detail ?? parsed?.error?.detail;
      if (detail && typeof detail === "object") {
        return { data: null, error: JSON.stringify(detail) };
      }
      if (typeof detail === "string") {
        return { data: null, error: detail };
      }
      if (typeof parsed?.message === "string") {
        return { data: null, error: parsed.message };
      }
      return { data: null, error: `Server error: ${response.status} ${response.statusText}` };
    }

    if (!parsed || typeof parsed !== "object") {
      return { data: null, error: "Invalid server response" };
    }
    return { data: parsed as AdminRoleRestoreResponse, error: null };
  } catch (error: any) {
    return { data: null, error: error?.message || "Network error" };
  }
}
