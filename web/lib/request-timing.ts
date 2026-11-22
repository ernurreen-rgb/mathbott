// How long API requests take as a student's device sees them.
//
// The server only sees its own part of a request. When students' pages hang while the server
// answers in milliseconds, the delay is somewhere between the device and the server, and only the
// device can tell where. So every API request is timed here, and the device reports:
//   - "slow": SLOW_REQUEST_MS or longer to the response,
//   - "failed": no response (network error, or given up after SLOW_REQUEST_MS), or a 5xx,
//   - "sample": SAMPLE_RATE of all other requests, for what a normal request costs.
// Each report has the connection phases (Resource Timing), the proxy's and API's own time
// (Server-Timing), the network type and whether the page was hidden meanwhile (a locked phone).
// Reports never hold emails, query strings or answers: paths are templates like "lessons/:id".
// The API keeps them for 30 days (bot/routes/client_timings.py, table client_request_timings).

import { apiPath } from "./api/api-path";

export const SLOW_REQUEST_MS = 3000;
export const SAMPLE_RATE = 0.1;
export const MAX_REPORTS_PER_BATCH = 20;
export const MAX_REPORTS_PER_PAGE = 100;
const FLUSH_DELAY_MS = 3000;
const RETRY_DELAY_MS = 15_000;
const MAX_SEND_ATTEMPTS = 3;
const TAB_ID_KEY = "qazmath.tab-id";
// Background requests that are not worth a baseline sample (they still report when slow).
const NOT_SAMPLED = new Set(["presence/heartbeat"]);

export type TimingKind = "slow" | "failed" | "sample";

export type Observation = {
  url: string;
  method: string;
  /** performance.now() when the request started. */
  startedAt: number;
  /** Date.now() when the request started. */
  startedWall: number;
  /** Until the response headers arrived, or until the request failed. */
  durationMs: number;
  status: number | null;
  error: "network" | "aborted" | null;
  serverTiming: string | null;
  wasHidden: boolean;
  page: string;
};

export type TimingDetails = {
  total_ms?: number;
  queued_ms?: number;
  dns_ms?: number;
  connect_ms?: number;
  tls_ms?: number;
  download_ms?: number;
  reused_connection?: boolean;
  protocol?: string;
  proxy_cold?: boolean;
  api_cold?: boolean;
  rtt_ms?: number;
  downlink_mbps?: number;
  save_data?: boolean;
  online?: boolean;
  user_agent?: string;
};

export type TimingReport = {
  kind: TimingKind;
  method: string;
  path: string;
  page: string;
  status: number | null;
  error: "network" | "aborted" | null;
  duration_ms: number;
  ttfb_ms: number | null;
  proxy_ms: number | null;
  api_ms: number | null;
  app_ms: number | null;
  was_hidden: boolean;
  effective_type: string | null;
  started_at: string;
  details: TimingDetails;
};

export type TimingBatch = { tab_id: string; reports: TimingReport[] };

const ms = (value: number) => Math.max(0, Math.round(value));

function templateSegments(segments: string[]): string {
  return segments
    .filter(Boolean)
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return ":invalid";
      }
      if (decoded.includes("@")) return ":email";
      if (/^\d+$/.test(decoded)) return ":id";
      if (decoded.length >= 20 && /^[A-Za-z0-9_-]+$/.test(decoded)) return ":token";
      return decoded.slice(0, 40);
    })
    .join("/")
    .slice(0, 160);
}

/** "/api/backend/lessons/12?email=a@b.kz" -> "lessons/12" templated as "lessons/:id". */
export function templateApiPath(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url, "http://local.invalid").pathname;
  } catch {
    pathname = url.split("?")[0];
  }
  const segments = pathname.split("/");
  // Drop the site's proxy prefix (/api/backend/...) or a direct API's /api/.
  const start = segments[1] === "api" ? (segments[2] === "backend" ? 3 : 2) : 1;
  return templateSegments(segments.slice(start)) || "/";
}

/** "/lessons/12" -> "/lessons/:id". */
export function templatePage(pathname: string): string {
  return `/${templateSegments(pathname.split("/"))}`.slice(0, 160);
}

/** The proxy's and API's parts from "app;dur=12.3, api-cold, api;dur=40, proxy;dur=45, proxy-cold". */
export function parseServerTiming(header: string | null): {
  proxy_ms: number | null;
  api_ms: number | null;
  app_ms: number | null;
  proxy_cold: boolean;
  api_cold: boolean;
} {
  const result = { proxy_ms: null as number | null, api_ms: null as number | null, app_ms: null as number | null,
    proxy_cold: false, api_cold: false };
  for (const metric of (header || "").split(",")) {
    const [rawName, ...params] = metric.trim().split(";");
    const name = rawName.trim();
    const durParam = params.map((param) => param.trim()).find((param) => param.startsWith("dur="));
    const duration = durParam ? Number(durParam.slice(4)) : NaN;
    const value = Number.isFinite(duration) && duration >= 0 ? ms(duration) : null;
    if (name === "proxy") result.proxy_ms = value;
    else if (name === "api") result.api_ms = value;
    else if (name === "app") result.app_ms = value;
    else if (name === "proxy-cold") result.proxy_cold = true;
    else if (name === "api-cold") result.api_cold = true;
  }
  return result;
}

/** Which report a finished request makes, if any. */
export function classifyRequest(observation: Observation, random: () => number): TimingKind | null {
  const { error, status, durationMs } = observation;
  if (error === "network") return "failed";
  // A caller that cancels quickly (the student left the page) is not a problem; one that gave up waiting is.
  if (error === "aborted") return durationMs >= SLOW_REQUEST_MS ? "failed" : null;
  if (status !== null && status >= 500) return "failed";
  if (durationMs >= SLOW_REQUEST_MS) return "slow";
  if (NOT_SAMPLED.has(templateApiPath(observation.url))) return null;
  return random() < SAMPLE_RATE ? "sample" : null;
}

type ResourceEntry = Pick<
  PerformanceResourceTiming,
  | "startTime" | "fetchStart" | "domainLookupStart" | "domainLookupEnd" | "connectStart" | "connectEnd"
  | "secureConnectionStart" | "requestStart" | "responseStart" | "responseEnd" | "nextHopProtocol"
>;

/** Connection phases of one request, from its Resource Timing entry. */
export function connectionPhases(entry: ResourceEntry | null): Partial<TimingDetails> & { ttfb_ms?: number } {
  if (!entry || !(entry.responseEnd > 0)) return {};
  const phases: Partial<TimingDetails> & { ttfb_ms?: number } = { total_ms: ms(entry.responseEnd - entry.startTime) };
  if (entry.nextHopProtocol) phases.protocol = entry.nextHopProtocol.slice(0, 16);
  // Zero when the browser hides the details (it does not for this site's own requests).
  if (!(entry.requestStart > 0)) return phases;
  const dns = entry.domainLookupEnd - entry.domainLookupStart;
  const connect = entry.connectEnd - entry.connectStart;
  phases.dns_ms = ms(dns);
  phases.connect_ms = ms(connect);
  if (entry.secureConnectionStart > 0) phases.tls_ms = ms(entry.connectEnd - entry.secureConnectionStart);
  phases.reused_connection = dns <= 0 && connect <= 0;
  phases.queued_ms = ms(entry.requestStart - entry.startTime - Math.max(0, dns) - Math.max(0, connect));
  phases.ttfb_ms = ms(entry.responseStart - entry.requestStart);
  phases.download_ms = ms(entry.responseEnd - entry.responseStart);
  return phases;
}

type NetworkInfo = { effectiveType?: string; rtt?: number; downlink?: number; saveData?: boolean };

export function describeRequest(
  observation: Observation,
  kind: TimingKind,
  entry: ResourceEntry | null,
  device: { network?: NetworkInfo | null; online?: boolean; userAgent?: string },
): TimingReport {
  const server = parseServerTiming(observation.serverTiming);
  const { ttfb_ms, ...phases } = connectionPhases(entry);
  const network = device.network || {};
  const details: TimingDetails = { ...phases };
  if (server.proxy_cold) details.proxy_cold = true;
  if (server.api_cold) details.api_cold = true;
  if (typeof network.rtt === "number") details.rtt_ms = ms(network.rtt);
  if (typeof network.downlink === "number") details.downlink_mbps = network.downlink;
  if (typeof network.saveData === "boolean") details.save_data = network.saveData;
  if (typeof device.online === "boolean") details.online = device.online;
  if (device.userAgent) details.user_agent = device.userAgent.slice(0, 300);
  return {
    kind,
    method: observation.method.toUpperCase().slice(0, 8),
    path: templateApiPath(observation.url),
    page: templatePage(observation.page),
    status: observation.status,
    error: observation.error,
    duration_ms: ms(observation.durationMs),
    ttfb_ms: ttfb_ms ?? null,
    proxy_ms: server.proxy_ms,
    api_ms: server.api_ms,
    app_ms: server.app_ms,
    was_hidden: observation.wasHidden,
    effective_type: network.effectiveType ? network.effectiveType.slice(0, 16) : null,
    started_at: new Date(observation.startedWall).toISOString(),
    details,
  };
}

type ReporterDeps = {
  send: (batch: TimingBatch) => Promise<boolean>;
  describe: (observation: Observation, kind: TimingKind) => TimingReport;
  random: () => number;
  tabId: () => string;
  schedule: (run: () => void, delayMs: number) => void;
};

/** Collects reports and sends them in batches, a few seconds after the first one. */
export class TimingReporter {
  private queue: { observation: Observation; kind: TimingKind; attempts: number }[] = [];
  private accepted = 0;
  private scheduled = false;
  private sending = false;

  constructor(private deps: ReporterDeps) {}

  get pending(): number {
    return this.queue.length;
  }

  note(observation: Observation): void {
    const kind = classifyRequest(observation, this.deps.random);
    if (!kind || this.accepted >= MAX_REPORTS_PER_PAGE) return;
    this.accepted += 1;
    this.queue.push({ observation, kind, attempts: 0 });
    if (this.queue.length >= MAX_REPORTS_PER_BATCH) void this.flush();
    else this.scheduleFlush(FLUSH_DELAY_MS);
  }

  /** Send what is queued. The request starts before this returns, so a closing page can call it. */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    const batch = this.queue.splice(0, MAX_REPORTS_PER_BATCH);
    this.sending = true;
    let sent = false;
    try {
      const reports = batch.map((item) => this.deps.describe(item.observation, item.kind));
      sent = await this.deps.send({ tab_id: this.deps.tabId(), reports });
    } catch {
      sent = false;
    } finally {
      this.sending = false;
    }
    if (!sent) {
      // The network that made a request fail often fails the report too: try again a little later.
      const retry = batch.filter((item) => ++item.attempts < MAX_SEND_ATTEMPTS);
      this.queue = [...retry, ...this.queue].slice(0, MAX_REPORTS_PER_BATCH);
      if (this.queue.length) this.scheduleFlush(RETRY_DELAY_MS);
    } else if (this.queue.length) {
      this.scheduleFlush(FLUSH_DELAY_MS);
    }
  }

  private scheduleFlush(delayMs: number): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.deps.schedule(() => {
      this.scheduled = false;
      void this.flush();
    }, delayMs);
  }
}

// --- The browser's reporter -------------------------------------------------------------------

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
const recentEntries: PerformanceResourceTiming[] = [];
let lastHiddenAt = -Infinity;
let reporter: TimingReporter | null = null;

function storedTabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing;
  } catch {
    // Storage blocked: a fresh id per page load still groups one page's reports.
  }
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    sessionStorage.setItem(TAB_ID_KEY, id);
  } catch {
    // See above.
  }
  return id;
}

function findEntry(url: string, startedAt: number): PerformanceResourceTiming | null {
  let best: PerformanceResourceTiming | null = null;
  for (const entry of recentEntries) {
    if (entry.name !== url) continue;
    const gap = Math.abs(entry.startTime - startedAt);
    if (gap < 100 && (!best || gap < Math.abs(best.startTime - startedAt))) best = entry;
  }
  return best;
}

function browserReporter(): TimingReporter | null {
  if (!isBrowser) return null;
  if (reporter) return reporter;
  try {
    // Kept here rather than read from the page's buffer, which stops filling after 250 entries.
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        if (!entry.name.includes("/api/")) continue;
        recentEntries.push(entry);
        if (recentEntries.length > 80) recentEntries.shift();
      }
    }).observe({ type: "resource" });
  } catch {
    // No Resource Timing: reports go without connection phases.
  }
  let tabId: string | null = null;
  reporter = new TimingReporter({
    random: Math.random,
    tabId: () => (tabId ??= storedTabId()),
    schedule: (run, delayMs) => void window.setTimeout(run, delayMs),
    describe: (observation, kind) =>
      describeRequest(observation, kind, findEntry(observation.url, observation.startedAt), {
        network: (navigator as Navigator & { connection?: NetworkInfo }).connection ?? null,
        online: navigator.onLine,
        userAgent: navigator.userAgent,
      }),
    send: async (batch) => {
      try {
        const response = await fetch(apiPath("client-timings"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
          credentials: "same-origin",
          // Lets the report finish when the student closes or leaves the page.
          keepalive: true,
        });
        // A rejected batch (4xx) would be rejected again.
        return response.ok || (response.status >= 400 && response.status < 500);
      } catch {
        return false;
      }
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    lastHiddenAt = performance.now();
    void reporter?.flush();
  });
  return reporter;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError";
}

/** fetch() that times the request for the reports above; the site's API calls go through it. */
export async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const timing = browserReporter();
  if (!timing) return fetch(url, init);
  const startedAt = performance.now();
  const startedWall = Date.now();
  const hiddenAtStart = document.visibilityState === "hidden";
  const observe = (status: number | null, error: Observation["error"], serverTiming: string | null) => {
    try {
      timing.note({
        url: new URL(url, window.location.href).href,
        method: (init?.method || "GET").toUpperCase(),
        startedAt,
        startedWall,
        durationMs: performance.now() - startedAt,
        status,
        error,
        serverTiming,
        wasHidden: hiddenAtStart || lastHiddenAt >= startedAt || document.visibilityState === "hidden",
        page: window.location.pathname,
      });
    } catch {
      // Timing must never break a request.
    }
  };
  try {
    const response = await fetch(url, init);
    observe(response.status, null, response.headers.get("server-timing"));
    return response;
  } catch (error) {
    observe(null, isAbort(error) ? "aborted" : "network", null);
    throw error;
  }
}
