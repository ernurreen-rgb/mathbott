import { apiPath, fetchWithErrorHandling } from "./client";
import { AdminStatistics } from "@/types";


// Admin Statistics API
export async function getAdminStatistics(email?: string): Promise<{ data: AdminStatistics | null; error: string | null }> {
  const url = email
    ? `${apiPath("admin/statistics")}?email=${encodeURIComponent(email)}`
    : apiPath("admin/statistics");
  return fetchWithErrorHandling<AdminStatistics>(url);
}
