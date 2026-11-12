import { apiPath, fetchWithErrorHandling, type FetchResult } from "./client";
import type { StatisticsByTab, StatisticsPeriodKey, StatisticsTab } from "@/types";

export type AdminStatisticsQuery = {
  period: StatisticsPeriodKey;
  excludeAdmins: boolean;
  /** Skips the short client-side GET cache, for an explicit refresh. */
  fresh?: boolean;
};

/** One tab of the statistics workspace, for the viewer's own time zone. */
export async function getAdminStatistics<Tab extends StatisticsTab>(
  tab: Tab,
  email: string,
  { period, excludeAdmins, fresh = false }: AdminStatisticsQuery,
): Promise<FetchResult<StatisticsByTab[Tab]>> {
  const params = new URLSearchParams({
    email,
    period,
    tz_offset: String(-new Date().getTimezoneOffset()),
  });
  // Quiz hosts are teachers, so the quizzes tab has no admin filter.
  if (excludeAdmins && tab !== "quizzes") params.set("exclude_admins", "true");
  return fetchWithErrorHandling<StatisticsByTab[Tab]>(
    `${apiPath(`admin/statistics/${tab}`)}?${params.toString()}`,
    fresh ? { cache: "no-store" } : undefined,
  );
}
