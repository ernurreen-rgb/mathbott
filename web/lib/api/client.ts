import { API_URL } from "../constants";

const DEBUG_API = process.env.NEXT_PUBLIC_DEBUG_API === "true";
export const debugLog = (...args: any[]) => {
  if (DEBUG_API) console.log(...args);
};

export type FetchResult<T> = { data: T | null; error: string | null };
export type FileDownloadResult = { blob: Blob | null; filename: string | null; error: string | null };

// Deduplicate in-flight GETs and briefly cache successful GET responses.
// This significantly reduces duplicate calls like /user/web on route changes where multiple components request the same data.
const inflightGetRequests = new Map<string, Promise<FetchResult<any>>>();
const getCache = new Map<string, { expiresAt: number; value: FetchResult<any> }>();
const GET_CACHE_TTL_MS = 1500;

export const apiPath = (path: string): string => {
  // Use environment variable or default
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || API_URL;
  
  // Remove trailing slash if present
  const baseUrl = apiUrl.replace(/\/$/, '');
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // If baseUrl is a relative path like '/api/backend', just append the path
  // If baseUrl is an absolute URL like 'http://localhost:8000', append '/api/' + path
  if (baseUrl.startsWith('/')) {
    // Relative path - already contains /api/backend, just add the path
    return `${baseUrl}/${cleanPath}`;
  } else {
    // Absolute URL - add /api/ prefix
    return `${baseUrl}/api/${cleanPath}`;
  }
};


export async function fetchWithErrorHandling<T>(
  url: string,
  options?: RequestInit
): Promise<FetchResult<T>> {
  const method = (options?.method || "GET").toUpperCase();

  const doFetch = async (): Promise<FetchResult<T>> => {
    try {
      debugLog("Fetching:", url, options);

      // Add timeout to fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      debugLog("Response status:", response.status);

      // Check content type first
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      // Read response as text first (we can parse it later)
      let responseText: string;
      try {
        responseText = await response.text();
      } catch (textError: any) {
        // Handle ERR_CONTENT_LENGTH_MISMATCH and other read errors
        if (textError.message?.includes("CONTENT_LENGTH_MISMATCH") || 
            textError.message?.includes("Failed to fetch") ||
            textError.name === "TypeError") {
          return {
            data: null,
            error: `Ошибка чтения ответа от сервера. Возможно, соединение было прервано или данные неполные. Попробуйте обновить страницу.`,
          };
        }
        throw textError;
      }

      if (!response.ok) {
        let errorData: any = {};
        try {
          if (isJson && responseText) {
            errorData = JSON.parse(responseText);
          }
        } catch (e) {
          debugLog("Error parsing error response:", e, "Response text:", responseText.substring(0, 200));
        }

        // Check if it's HTML error page
        if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
          return {
            data: null,
            error: `Сервер вернул HTML страницу вместо JSON. Возможно, это ошибка прокси. Проверьте URL: ${url}`,
          };
        }

        // Extract error message from various possible fields
        // Ensure we always get a string, not an object
        let errorMessage: string;
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (typeof errorData?.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (typeof errorData?.message === 'string') {
          errorMessage = errorData.message;
        } else if (typeof errorData?.error === 'string') {
          errorMessage = errorData.error;
        } else if (errorData?.error && typeof errorData.error === 'object') {
          errorMessage =
            (errorData.error as any)?.detail ||
            (errorData.error as any)?.message ||
            JSON.stringify(errorData.error);
        } else if (errorData?.detail && typeof errorData.detail === 'object') {
          // If detail is an object, try to extract message from it
          errorMessage = (errorData.detail as any)?.message || JSON.stringify(errorData.detail);
        } else if (errorData && typeof errorData === 'object') {
          // If errorData is an object, convert to string
          errorMessage = JSON.stringify(errorData);
        } else {
          errorMessage = `Ошибка сервера: ${response.status} ${response.statusText}`;
        }
        
        debugLog("Error response:", { status: response.status, errorData, errorMessage });
        
        return {
          data: null,
          error: errorMessage,
        };
      }

      // Check if response is JSON
      if (!isJson) {
        debugLog("Non-JSON response:", responseText.substring(0, 500));
        // If it's HTML, provide helpful error
        if (responseText.trim().startsWith("<!DOCTYPE") || responseText.trim().startsWith("<html")) {
          return {
            data: null,
            error: `Сервер вернул HTML вместо JSON. Возможно, это ошибка прокси. Проверьте URL: ${url}`,
          };
        }
        return {
          data: null,
          error: `Сервер вернул не JSON ответ (${contentType}). Проверьте, что бэкенд запущен и доступен.`,
        };
      }

      // Parse JSON
      let data: T;
      try {
        data = JSON.parse(responseText) as T;
      } catch (jsonError: any) {
        debugLog("JSON parse error. Response text:", responseText.substring(0, 500));
        return {
          data: null,
          error: `Ошибка парсинга JSON ответа: ${jsonError.message}. Ответ начинается с: ${responseText.substring(0, 100)}`,
        };
      }
      debugLog("Response data:", data);
      return { data, error: null };
    } catch (error: any) {
      // Only log errors in development mode
      if (process.env.NODE_ENV === "development") {
        console.error("Fetch error:", error);
      }
      const errorMessage = error.message || "Ошибка подключения к серверу";

      if (error.name === "AbortError") {
        return {
          data: null,
          error: "Превышено время ожидания ответа от сервера (30 секунд)",
        };
      }

      // Handle ERR_CONTENT_LENGTH_MISMATCH
      if (
        errorMessage.includes("CONTENT_LENGTH_MISMATCH") ||
        errorMessage.includes("content-length")
      ) {
        return {
          data: null,
          error: "Ошибка получения данных от сервера. Данные могут быть неполными. Попробуйте обновить страницу.",
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
          error: `Не удалось подключиться к серверу. Проверьте, что бэкенд запущен на порту 8000 и доступен по адресу ${API_URL}`,
        };
      }
      return { data: null, error: errorMessage };
    }
  };

  // GET dedupe + short cache
  if (method === "GET") {
    const cached = getCache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as FetchResult<T>;
    }

    const inflight = inflightGetRequests.get(url);
    if (inflight) {
      return inflight as Promise<FetchResult<T>>;
    }

    const p: Promise<FetchResult<T>> = (async () => {
      try {
        return await doFetch();
      } finally {
        inflightGetRequests.delete(url);
      }
    })();

    inflightGetRequests.set(url, p as any);

    const result = await p;
    if (!result.error) {
      getCache.set(url, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value: result as any });
    }
    return result;
  }

  return doFetch();
}
