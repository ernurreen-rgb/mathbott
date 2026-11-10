import { apiPath, fetchWithErrorHandling } from "./client";
import type { MistakeAnalyticsPeriod, MistakeAnalyticsResponse } from "@/types";

export async function getAdminMistakeAnalytics(
  email: string,
  params: { period: MistakeAnalyticsPeriod; moduleId?: number | null }
) {
  const query = new URLSearchParams({ email, period: params.period });
  if (params.moduleId) query.set("module_id", String(params.moduleId));
  return fetchWithErrorHandling<MistakeAnalyticsResponse>(
    `${apiPath("admin/mistake-analytics")}?${query.toString()}`,
    { cache: "no-store" }
  );
}
