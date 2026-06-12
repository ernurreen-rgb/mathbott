import { apiPath, fetchWithErrorHandling } from "./client";
import { AdminStatistics, OnboardingStatistics } from "@/types";


// Admin Statistics API
export async function getAdminStatistics(email?: string): Promise<{ data: AdminStatistics | null; error: string | null }> {
  const url = email
    ? `${apiPath("admin/statistics")}?email=${encodeURIComponent(email)}`
    : apiPath("admin/statistics");
  return fetchWithErrorHandling<AdminStatistics>(url);
}


export async function getOnboardingStatistics(email?: string): Promise<{ data: OnboardingStatistics | null; error: string | null }> {
  const url = email
    ? `${apiPath("admin/onboarding-statistics")}?email=${encodeURIComponent(email)}`
    : apiPath("admin/onboarding-statistics");
  return fetchWithErrorHandling<OnboardingStatistics>(url);
}
