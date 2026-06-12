import { apiPath, fetchWithErrorHandling } from "./client";
import { OpsHealthSummary, OpsHealthTimeseriesResponse, OpsIncidentListResponse, OpsTimeseriesRange, OpsTimeseriesStep } from "@/types";


export async function getAdminOpsHealthSummary(
  email: string
): Promise<{ data: OpsHealthSummary | null; error: string | null }> {
  return fetchWithErrorHandling<OpsHealthSummary>(
    `${apiPath("admin/ops/health/summary")}?email=${encodeURIComponent(email)}`
  );
}


export async function getAdminOpsHealthTimeseries(
  email: string,
  params?: {
    range?: OpsTimeseriesRange;
    step?: OpsTimeseriesStep;
  }
): Promise<{ data: OpsHealthTimeseriesResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("range", params?.range || "24h");
  if (params?.step) query.set("step", params.step);
  return fetchWithErrorHandling<OpsHealthTimeseriesResponse>(
    `${apiPath("admin/ops/health/timeseries")}?${query.toString()}`
  );
}


export async function getAdminOpsIncidents(
  email: string,
  params?: {
    status?: "open" | "resolved" | "all";
    severity?: "critical" | "high" | "medium" | "all";
    limit?: number;
    offset?: number;
  }
): Promise<{ data: OpsIncidentListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("status", params?.status || "open");
  query.set("severity", params?.severity || "all");
  query.set("limit", String(params?.limit ?? 20));
  query.set("offset", String(params?.offset ?? 0));
  return fetchWithErrorHandling<OpsIncidentListResponse>(
    `${apiPath("admin/ops/incidents")}?${query.toString()}`
  );
}
