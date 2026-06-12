
export type OpsTimeseriesRange = "1h" | "24h" | "7d";


export type OpsTimeseriesStep = "1m" | "5m" | "1h";


export interface OpsHealthSummary {
  service_status: "healthy" | "degraded" | "down";
  database_status: "ok" | "error";
  window: "5m";
  requests_5m: number;
  errors_5m: number;
  error_rate_5m: number;
  p95_ms_5m: number;
  avg_ms_5m: number;
  open_incidents: number;
  updated_at: string;
}


export interface OpsHealthTimeseriesPoint {
  ts: string;
  requests: number;
  errors: number;
  error_rate: number;
  p95_ms: number;
  avg_ms: number;
  db_ok: number;
}


export interface OpsHealthTimeseriesResponse {
  range: OpsTimeseriesRange;
  step: OpsTimeseriesStep;
  items: OpsHealthTimeseriesPoint[];
}


export interface OpsIncident {
  id: number;
  kind: string;
  severity: "critical" | "high" | "medium";
  title: string;
  message: string;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  metadata: Record<string, any>;
  telegram_last_sent_at?: string | null;
  resolved_at?: string | null;
}


export interface OpsIncidentListResponse {
  items: OpsIncident[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
