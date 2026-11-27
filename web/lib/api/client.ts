import { API_URL } from "../constants";
import { tr } from "../i18n/translate";
import { abortAfterTimeout, timedFetch } from "../request-timing";

const DEBUG_API = process.env.NEXT_PUBLIC_DEBUG_API === "true";
export const debugLog = (...args: any[]) => {
  if (DEBUG_API) console.log(...args);
};

export type FetchResult<T> = { data: T | null; error: string | null; status?: number };
export type FileDownloadResult = { blob: Blob | null; filename: string | null; error: string | null };

// Deduplicate in-flight GETs and briefly cache successful GET responses.
// This significantly reduces duplicate calls like /user/web on route changes where multiple components request the same data.
const inflightGetRequests = new Map<string, Promise<FetchResult<any>>>();
const getCache = new Map<string, { expiresAt: number; value: FetchResult<any> }>();
const GET_CACHE_TTL_MS = 1500;
let cacheEpoch = 0;

export function clearApiGetCache(): void {
  cacheEpoch += 1;
  getCache.clear();
  inflightGetRequests.clear();
}

function hasCustomAuthHeaders(headers?: HeadersInit): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.has("authorization") || headers.has("x-quiz-participant-token");
  }
  const entries = Array.isArray(headers) ? headers : Object.entries(headers);
  return entries.some(([key]) => {
    const lower = key.toLowerCase();
    return lower === "authorization" || lower === "x-quiz-participant-token";
  });
}

export { apiPath } from "./api-path";

export async function fetchWithErrorHandling<T>(
  url: string,
  requestOptions?: RequestInit & { timeoutMs?: number }
): Promise<FetchResult<T>> {
  // Slow endpoints (AI drafts) raise the timeout; everything else keeps 30 seconds.
  const { timeoutMs = 30000, ...options } = requestOptions || {};
  const method = (options.method || "GET").toUpperCase();
  const isMutating = method !== "GET" && method !== "HEAD";

  // Invalidate short-lived GET cache and bump epoch on any write so in-flight GETs cannot write stale data (H-32).
  if (isMutating) {
    clearApiGetCache();
  }

  const doFetch = async (): Promise<FetchResult<T>> => {
    const controller = new AbortController();
    const externalSignal = options.signal;
    let timedOut = false;

    const onExternalAbort = () => {
      controller.abort(externalSignal?.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    const timeoutId = setTimeout(() => {
      timedOut = true;
      abortAfterTimeout(controller);
    }, timeoutMs);

    try {
      debugLog("Fetching:", url, options);

      const response = await timedFetch(url, {
        ...options,
        signal: controller.signal,
      });

      debugLog("Response status:", response.status);

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      let responseText: string;
      try {
        responseText = await response.text();
      } catch (textError: any) {
        if (
          textError?.message?.includes("CONTENT_LENGTH_MISMATCH") ||
          textError?.message?.includes("Failed to fetch") ||
          textError?.name === "TypeError"
        ) {
          return {
            data: null,
            error:
              tr("api.readError"),
            status: response.status,
          };
        }
        throw textError;
      }

      if (!response.ok) {
        let errorData: any = null;
        try {
          if (isJson && responseText.trim()) {
            errorData = JSON.parse(responseText);
          }
        } catch (e) {
          debugLog("Error parsing error response:", e, "Response text:", responseText.substring(0, 200));
        }

        if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
          return {
            data: null,
            error: tr("api.htmlInsteadOfJson", { url }),
            status: response.status,
          };
        }

        let errorMessage: string;
        if (typeof errorData === "string" && errorData.trim()) {
          errorMessage = errorData;
        } else if (typeof errorData?.detail === "string" && errorData.detail.trim()) {
          errorMessage = errorData.detail;
        } else if (typeof errorData?.message === "string" && errorData.message.trim()) {
          errorMessage = errorData.message;
        } else if (typeof errorData?.error === "string" && errorData.error.trim()) {
          errorMessage = errorData.error;
        } else if (errorData?.error && typeof errorData.error === "object") {
          errorMessage =
            (errorData.error as any)?.detail ||
            (errorData.error as any)?.message ||
            JSON.stringify(errorData.error);
        } else if (errorData?.detail && typeof errorData.detail === "object") {
          errorMessage = (errorData.detail as any)?.message || JSON.stringify(errorData.detail);
        } else if (errorData && typeof errorData === "object" && Object.keys(errorData).length > 0) {
          errorMessage = JSON.stringify(errorData);
        } else {
          errorMessage = tr("api.serverError", { status: response.status, statusText: response.statusText }).trim();
        }

        debugLog("Error response:", { status: response.status, errorData, errorMessage });

        return {
          data: null,
          error: errorMessage,
          status: response.status,
        };
      }

      if (!isJson) {
        debugLog("Non-JSON response:", responseText.substring(0, 500));
        if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
          return {
            data: null,
            error: tr("api.htmlInsteadOfJson", { url }),
            status: response.status,
          };
        }
        return {
          data: null,
          error: tr("api.notJson", { contentType: String(contentType) }),
          status: response.status,
        };
      }

      let data: T;
      try {
        data = JSON.parse(responseText) as T;
      } catch (jsonError: any) {
        debugLog("JSON parse error. Response text:", responseText.substring(0, 500));
        return {
          data: null,
          error: tr("api.jsonParse", { message: jsonError.message, head: responseText.substring(0, 100) }),
          status: response.status,
        };
      }
      debugLog("Response data:", data);
      return { data, error: null, status: response.status };
    } catch (error: any) {
      if (process.env.NODE_ENV === "development") {
        console.error("Fetch error:", error);
      }
      const errorMessage = error?.message || tr("api.connectError");

      if (error?.name === "AbortError") {
        return {
          data: null,
          error: timedOut
            ? tr("api.timeout", { count: Math.round(timeoutMs / 1000) })
            : tr("api.aborted"),
        };
      }

      if (
        errorMessage.includes("CONTENT_LENGTH_MISMATCH") ||
        errorMessage.includes("content-length")
      ) {
        return {
          data: null,
          error:
            tr("api.fetchError"),
        };
      }

      if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("ERR_")
      ) {
        return {
          data: null,
          error: tr("api.unreachable", { url: API_URL }),
        };
      }
      return { data: null, error: errorMessage };
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
      if (isMutating) {
        clearApiGetCache();
      }
    }
  };

  // GET dedupe + short cache (skipped when caller supplies AbortSignal or custom auth headers)
  const cacheableGet =
    method === "GET" &&
    options.cache !== "no-store" &&
    !options.signal &&
    !hasCustomAuthHeaders(options.headers);

  if (cacheableGet) {
    const cached = getCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as FetchResult<T>;
    }

    const inflight = inflightGetRequests.get(url);
    if (inflight) {
      return inflight as Promise<FetchResult<T>>;
    }

    const requestEpoch = cacheEpoch;
    const p: Promise<FetchResult<T>> = doFetch();
    inflightGetRequests.set(url, p as any);

    try {
      const result = await p;
      if (!result.error && requestEpoch === cacheEpoch) {
        getCache.set(url, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: result as any });
      }
      return result;
    } finally {
      if (inflightGetRequests.get(url) === p) {
        inflightGetRequests.delete(url);
      }
    }
  }

  return doFetch();
}
