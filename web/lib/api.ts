import { API_URL } from "./constants";
import { RatingUser, UserData, Module, ModuleDetails, LessonDetails, TrialTest, TrialTestDetails, TrialTestResult, TrialTestSubmitRequest, TrialTestSubmitResponse, TrialTestCoopCreateResponse, TrialTestCoopFinishResponse, TrialTestCoopResultsResponse, TrialTestCoopSession, FriendInvite, FriendInviteDetails, FriendRequestItem, FriendUser, BlockedUser, FriendStatus, BankDifficulty, BankTask, BankTaskListResponse, TrialTestAddFromBankResponse, BankPlacementTask, BankTaskVersionListResponse, BankTaskVersionDetail, BankTaskUsageResponse, BankTaskSimilarCandidate, SimilarConflictPayload, BankImportValidationErrorPayload, BankImportResponse, BankImportMode, BankImportPreviewResponse, BankQualitySummaryResponse, BankQualityListParams, BankDuplicateListParams, BankDuplicateListResponse, BankAuditListParams, BankAuditListResponse, AdminStatistics, OnboardingStatistics, OpsHealthSummary, OpsHealthTimeseriesResponse, OpsIncidentListResponse, OpsTimeseriesRange, OpsTimeseriesStep, AdminCheckResponse, AdminRole, AdminRoleListResponse, AdminRoleUpdateRequest, AdminRoleUpdateResponse, AdminRoleRestoreRequest, AdminRoleRestoreResponse } from "@/types";

const DEBUG_API = process.env.NEXT_PUBLIC_DEBUG_API === "true";
const debugLog = (...args: any[]) => {
  if (DEBUG_API) console.log(...args);
};

type FetchResult<T> = { data: T | null; error: string | null };
type FileDownloadResult = { blob: Blob | null; filename: string | null; error: string | null };

// Deduplicate in-flight GETs and briefly cache successful GET responses.
// This significantly reduces duplicate calls like /user/web on route changes where multiple components request the same data.
const inflightGetRequests = new Map<string, Promise<FetchResult<any>>>();
const getCache = new Map<string, { expiresAt: number; value: FetchResult<any> }>();
const GET_CACHE_TTL_MS = 1500;

// Helper to build API path - uses environment variable
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

// Legacy tasks API (used by some pages)
export async function getRandomTask(email?: string): Promise<{ data: any | null; error: string | null }> {
  const url = email
    ? `${apiPath('task/random')}?email=${encodeURIComponent(email)}`
    : apiPath('task/random');
  return fetchWithErrorHandling<any>(url);
}

export async function checkTaskAnswer(task_id: number, answer: string, email: string): Promise<{ data: any | null; error: string | null }> {
  return fetchWithErrorHandling<any>(apiPath('task/check'), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id, answer, email }),
  });
}

export async function getTaskQuestions(taskId: number, email?: string): Promise<{ data: any[] | null; error: string | null }> {
  const url = email
    ? `${apiPath(`tasks/${taskId}/questions`)}?email=${encodeURIComponent(email)}`
    : apiPath(`tasks/${taskId}/questions`);
  return fetchWithErrorHandling<any[]>(url);
}

export async function checkTaskQuestionAnswer(
  taskId: number,
  question_index: number,
  answer: string,
  email: string
): Promise<{ data: any | null; error: string | null }> {
  const formData = new FormData();
  formData.append("question_index", question_index.toString());
  formData.append("answer", answer);
  formData.append("email", email);
  return fetchWithErrorHandling<any>(apiPath(`tasks/${taskId}/questions/check`), {
    method: "POST",
    body: formData,
  });
}

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

export async function getRating(limit: number = 50, league?: string): Promise<{ data: RatingUser[] | null; error: string | null }> {
  const url = league
    ? `${apiPath('rating')}?limit=${limit}&league=${encodeURIComponent(league)}`
    : `${apiPath('rating')}?limit=${limit}`;
  const result = await fetchWithErrorHandling<{ items: RatingUser[]; total: number; limit: number; offset: number; has_more: boolean } | RatingUser[]>(url);
  
  // Transform API response to expected format
  if (result.error) {
    return result as { data: RatingUser[] | null; error: string | null };
  }
  
  if (result.data) {
    // Check if response has 'items' field (new format) or is array directly (old format)
    if (Array.isArray(result.data)) {
      // Direct array response (shouldn't happen with new API, but handle for compatibility)
      return { data: result.data, error: null };
    } else if (result.data && typeof result.data === 'object' && 'items' in result.data) {
      // New format with items field
      return { data: result.data.items || [], error: null };
    }
  }
  
  return { data: [], error: null };
}

export async function getUserData(email: string): Promise<{ data: UserData | null; error: string | null }> {
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/web/${encodeURIComponent(email)}`)
  );
}

export async function getPublicUserData(email: string): Promise<{ data: UserData | null; error: string | null }> {
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/public/${encodeURIComponent(email)}`)
  );
}

export async function getPublicUserDataById(userId: number): Promise<{ data: UserData | null; error: string | null }> {
  // Use the unified endpoint that accepts both ID and email
  return fetchWithErrorHandling<UserData>(
    apiPath(`user/public/${userId}`)
  );
}

export async function updateNickname(email: string, nickname: string): Promise<{ data: any | null; error: string | null }> {
  return fetchWithErrorHandling(
    apiPath('user/web/nickname'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nickname }),
    }
  );
}

export async function createFriendInvite(
  email: string,
  expiresInDays: number = 1
): Promise<{ data: { token: string; expires_at: string } | null; error: string | null }> {
  return fetchWithErrorHandling<{ token: string; expires_at: string }>(
    apiPath('friends/invites'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, expires_in_days: expiresInDays }),
    }
  );
}

export async function listFriendInvites(
  email: string,
  status?: string
): Promise<{ data: { items: FriendInvite[] } | null; error: string | null }> {
  const url = status
    ? `${apiPath('friends/invites')}?email=${encodeURIComponent(email)}&status=${encodeURIComponent(status)}`
    : `${apiPath('friends/invites')}?email=${encodeURIComponent(email)}`;
  return fetchWithErrorHandling<{ items: FriendInvite[] }>(url);
}

export async function getFriendInviteDetails(
  token: string,
  email?: string
): Promise<{ data: FriendInviteDetails | null; error: string | null }> {
  const url = email
    ? `${apiPath(`friends/invites/${token}`)}?email=${encodeURIComponent(email)}`
    : apiPath(`friends/invites/${token}`);
  return fetchWithErrorHandling<FriendInviteDetails>(url);
}

export async function acceptFriendInvite(
  token: string,
  email: string
): Promise<{ data: { success: boolean; already_friends?: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; already_friends?: boolean }>(
    apiPath(`friends/invites/${token}/accept`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }
  );
}

export async function revokeFriendInvite(
  token: string,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/invites/${token}/revoke`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

export async function listFriends(
  email: string
): Promise<{ data: { items: FriendUser[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: FriendUser[] }>(
    `${apiPath('friends')}?email=${encodeURIComponent(email)}`
  );
}

export async function removeFriend(
  email: string,
  friendId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/${friendId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function listFriendRequests(
  email: string,
  direction: "incoming" | "outgoing" = "incoming"
): Promise<{ data: { items: FriendRequestItem[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: FriendRequestItem[] }>(
    `${apiPath('friends/requests')}?email=${encodeURIComponent(email)}&direction=${direction}`
  );
}

export async function declineFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}/decline`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

export async function acceptFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}/accept`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

export async function cancelFriendRequest(
  email: string,
  requestId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/requests/${requestId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function blockUser(
  email: string,
  blockedUserId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath('friends/blocks'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, blocked_user_id: blockedUserId }),
    }
  );
}

export async function unblockUser(
  email: string,
  blockedUserId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`friends/blocks/${blockedUserId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function sendFriendRequest(
  email: string,
  receiverId: number
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath('friends/requests'),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, receiver_id: receiverId }),
    }
  );
}

export async function getFriendStatus(
  email: string,
  otherId: number
): Promise<{ data: FriendStatus | null; error: string | null }> {
  return fetchWithErrorHandling<FriendStatus>(
    `${apiPath('friends/status')}?email=${encodeURIComponent(email)}&other_id=${otherId}`
  );
}

export async function listBlockedUsers(
  email: string
): Promise<{ data: { items: BlockedUser[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: BlockedUser[] }>(
    `${apiPath('friends/blocks')}?email=${encodeURIComponent(email)}`
  );
}

export async function checkAdminStatus(_email?: string): Promise<{ data: AdminCheckResponse | null; error: string | null }> {
  return fetchWithErrorHandling<AdminCheckResponse>(
    apiPath("admin/check")
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

export async function updateAdminReportTask(
  taskId: number,
  email: string,
  formData: FormData
): Promise<{ data: { success: boolean; message?: string } | null; error: string | null }> {
  const primaryUrl = `${apiPath(`admin/reports/tasks/${taskId}`)}?email=${encodeURIComponent(email)}`;
  const legacyUrl = `${apiPath(`admin/tasks/${taskId}`)}?email=${encodeURIComponent(email)}`;

  const request = async (
    url: string
  ): Promise<{ ok: boolean; status: number; parsed: any; statusText: string }> => {
    const response = await fetch(url, {
      method: "PUT",
      body: formData,
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let parsed: any = null;
    if (contentType.includes("application/json") && text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, parsed };
  };

  try {
    let result = await request(primaryUrl);
    if (!result.ok && (result.status === 404 || result.status === 405)) {
      result = await request(legacyUrl);
    }

    if (!result.ok) {
      const detail = result.parsed?.detail ?? result.parsed?.error?.detail;
      if (typeof detail === "string") {
        return { data: null, error: detail };
      }
      if (detail && typeof detail === "object") {
        const message = (detail as any).message;
        return { data: null, error: typeof message === "string" ? message : JSON.stringify(detail) };
      }
      if (typeof result.parsed?.message === "string") {
        return { data: null, error: result.parsed.message };
      }
      return { data: null, error: `Server error: ${result.status} ${result.statusText}` };
    }

    if (!result.parsed || typeof result.parsed !== "object") {
      return { data: null, error: "Invalid server response" };
    }
    return { data: result.parsed as { success: boolean; message?: string }, error: null };
  } catch (error: any) {
    return { data: null, error: error?.message || "Network error" };
  }
}

// Module System API
export async function getModulesMap(email?: string): Promise<{ data: Module[] | null; error: string | null }> {
  const url = email
    ? `${apiPath('modules/map')}?email=${encodeURIComponent(email)}`
    : apiPath('modules/map');
  return fetchWithErrorHandling<Module[]>(url);
}

export async function getModuleDetails(moduleId: number, email?: string): Promise<{ data: ModuleDetails | null; error: string | null }> {
  const url = email
    ? `${apiPath(`modules/${moduleId}`)}?email=${encodeURIComponent(email)}`
    : apiPath(`modules/${moduleId}`);
  return fetchWithErrorHandling<ModuleDetails>(url);
}

export async function getLessonDetails(lessonId: number, email?: string): Promise<{ data: LessonDetails | null; error: string | null }> {
  const url = email
    ? `${apiPath(`lessons/${lessonId}`)}?email=${encodeURIComponent(email)}`
    : apiPath(`lessons/${lessonId}`);
  return fetchWithErrorHandling<LessonDetails>(url);
}

// Trial Tests API
export async function getTrialTests(): Promise<{ data: TrialTest[] | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTest[]>(apiPath('trial-tests'));
}

export async function getTrialTestsAttempted(email: string): Promise<{ data: TrialTest[] | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTest[]>(
    `${apiPath('trial-tests')}?email=${encodeURIComponent(email)}&attempted_only=true`
  );
}

export async function getTrialTestDetails(testId: number, email?: string): Promise<{ data: TrialTestDetails | null; error: string | null }> {
  const url = email
    ? `${apiPath(`trial-tests/${testId}`)}?email=${encodeURIComponent(email)}`
    : apiPath(`trial-tests/${testId}`);
  return fetchWithErrorHandling<TrialTestDetails>(url);
}

export async function submitTrialTest(testId: number, request: TrialTestSubmitRequest): Promise<{ data: TrialTestSubmitResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestSubmitResponse>(
    apiPath(`trial-tests/${testId}/submit`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
}

export async function getTrialTestResults(testId: number, email: string): Promise<{ data: TrialTestResult[] | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestResult[]>(
    `${apiPath(`trial-tests/${testId}/results`)}?email=${encodeURIComponent(email)}`
  );
}

export type TrialTestDraft = { answers: Record<number, string>; current_task_index: number };

export async function getTrialTestDraft(testId: number, email: string): Promise<{ data: TrialTestDraft | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestDraft>(
    `${apiPath(`trial-tests/${testId}/draft`)}?email=${encodeURIComponent(email)}`
  );
}

/** Id тестов, по которым у пользователя есть черновик (для кнопки «Продолжить»). */
export async function getTrialTestDraftIds(email: string): Promise<{ data: { test_ids: number[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ test_ids: number[] }>(
    `${apiPath("trial-tests/drafts")}?email=${encodeURIComponent(email)}`
  );
}

export async function saveTrialTestDraft(
  testId: number,
  email: string,
  payload: { answers: Record<number, string>; current_task_index: number }
): Promise<{ data: { ok: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ ok: boolean }>(
    apiPath(`trial-tests/${testId}/draft`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...payload }),
    }
  );
}

export async function createTrialTestCoopSession(
  testId: number,
  email: string
): Promise<{ data: TrialTestCoopCreateResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopCreateResponse>(
    apiPath(`trial-tests/${testId}/coop/session`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }
  );
}

export async function getTrialTestCoopSession(
  sessionId: number,
  email: string
): Promise<{ data: TrialTestCoopSession | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopSession>(
    `${apiPath(`trial-tests/coop/session/${sessionId}`)}?email=${encodeURIComponent(email)}`
  );
}

export async function finishTrialTestCoopSession(
  testId: number,
  sessionId: number,
  email: string,
  answers: Record<number, string>
): Promise<{ data: TrialTestCoopFinishResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopFinishResponse>(
    apiPath(`trial-tests/${testId}/coop/finish`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, session_id: sessionId, answers }),
    }
  );
}

export async function getTrialTestCoopResults(
  sessionId: number,
  email: string
): Promise<{ data: TrialTestCoopResultsResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestCoopResultsResponse>(
    `${apiPath(`trial-tests/coop/session/${sessionId}/results`)}?email=${encodeURIComponent(email)}`
  );
}

export async function inviteFriendToCoopTest(
  testId: number,
  email: string,
  friendId: number
): Promise<{ data: { success: boolean; session_id: number; invite_id?: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; session_id: number; invite_id?: number }>(
    apiPath(`trial-tests/${testId}/coop/invite`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, friend_id: friendId }),
    }
  );
}

export async function getCoopTestInvites(
  email: string
): Promise<{ data: { items: any[] } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: any[] }>(
    `${apiPath('trial-tests/coop/invites')}?email=${encodeURIComponent(email)}`
  );
}

export async function acceptCoopTestInvite(
  inviteId: number,
  email: string
): Promise<{ data: { success: boolean; session_id: number; trial_test_id: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; session_id: number; trial_test_id: number }>(
    `${apiPath(`trial-tests/coop/invites/${inviteId}/accept`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

export async function declineCoopTestInvite(
  inviteId: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`trial-tests/coop/invites/${inviteId}/decline`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

// Admin Statistics API
export async function getAdminStatistics(email: string): Promise<{ data: AdminStatistics | null; error: string | null }> {
  return fetchWithErrorHandling<AdminStatistics>(
    `${apiPath('admin/statistics')}?email=${encodeURIComponent(email)}`
  );
}

export async function getOnboardingStatistics(email: string): Promise<{ data: OnboardingStatistics | null; error: string | null }> {
  return fetchWithErrorHandling<OnboardingStatistics>(
    `${apiPath('admin/onboarding-statistics')}?email=${encodeURIComponent(email)}`
  );
}

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

// Trial Tests Admin API
export async function getAdminTrialTests(email: string): Promise<{ data: TrialTest[] | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTest[]>(
    `${apiPath('admin/trial-tests')}?email=${encodeURIComponent(email)}`
  );
}

export async function getAdminTrialTestTasks(
  testId: number,
  email: string
): Promise<{ data: BankPlacementTask[] | null; error: string | null }> {
  const { data, error } = await fetchWithErrorHandling<{ tasks: BankPlacementTask[] }>(
    `${apiPath(`admin/trial-tests/${testId}/tasks`)}?email=${encodeURIComponent(email)}`
  );
  if (error) return { data: null, error };
  return { data: data?.tasks || [], error: null };
}

export async function createTrialTest(
  title: string,
  description: string | null,
  sort_order: number,
  expected_tasks_count: number,
  email: string
): Promise<{ data: TrialTest | null; error: string | null }> {
  const formData = new FormData();
  formData.append("title", title);
  if (description) formData.append("description", description);
  formData.append("sort_order", sort_order.toString());
  formData.append("expected_tasks_count", String(expected_tasks_count || 40));
  formData.append("email", email);
  return fetchWithErrorHandling<TrialTest>(apiPath('admin/trial-tests'), {
    method: "POST",
    body: formData,
  });
}

export async function updateTrialTest(
  testId: number,
  title: string | null,
  description: string | null,
  sort_order: number | null,
  expected_tasks_count: number | null,
  email: string
): Promise<{ data: TrialTest | null; error: string | null }> {
  const formData = new FormData();
  if (title !== null) formData.append("title", title);
  if (description !== null) formData.append("description", description || "");
  if (sort_order !== null) formData.append("sort_order", sort_order.toString());
  if (expected_tasks_count !== null) {
    formData.append("expected_tasks_count", expected_tasks_count.toString());
  }
  formData.append("email", email);
  return fetchWithErrorHandling<TrialTest>(apiPath(`admin/trial-tests/${testId}`), {
    method: "PUT",
    body: formData,
  });
}

export async function upsertTrialTestSlot(
  testId: number,
  slotIndex: number,
  payload: Record<string, any>
): Promise<{ data: BankPlacementTask | null; error: string | null }> {
  return fetchWithErrorHandling<BankPlacementTask>(
    apiPath(`admin/trial-tests/${testId}/slots/${slotIndex}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function clearTrialTestSlot(
  testId: number,
  slotIndex: number,
  email: string
): Promise<{ data: { success: boolean; cleared: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean; cleared: number }>(
    `${apiPath(`admin/trial-tests/${testId}/slots/${slotIndex}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function deleteTrialTest(testId: number, email: string): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`admin/trial-tests/${testId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function addTaskToTrialTest(
  testId: number,
  taskId: number,
  sortOrder: number,
  email: string
): Promise<{ data: any | null; error: string | null }> {
  const formData = new FormData();
  formData.append("task_id", taskId.toString());
  formData.append("sort_order", sortOrder.toString());
  formData.append("email", email);
  return fetchWithErrorHandling(apiPath(`admin/trial-tests/${testId}/tasks`), {
    method: "POST",
    body: formData,
  });
}

export async function removeTaskFromTrialTest(
  testId: number,
  taskId: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`admin/trial-tests/${testId}/tasks/${taskId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function createTaskForTrialTest(
  testId: number,
  formData: FormData,
  email: string
): Promise<{ data: any | null; error: string | null }> {
  formData.append("email", email);
  return fetchWithErrorHandling(
    apiPath(`admin/trial-tests/${testId}/tasks/create`),
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function updateTrialTestTask(
  testId: number,
  taskId: number,
  formData: FormData,
  email: string
): Promise<{ data: any | null; error: string | null }> {
  formData.append("email", email);
  return fetchWithErrorHandling(
    apiPath(`admin/trial-tests/${testId}/tasks/${taskId}`),
    {
      method: "PUT",
      body: formData,
    }
  );
}

export async function updateTrialTestTaskPost(
  testId: number,
  taskId: number,
  formData: FormData,
  email: string
): Promise<{ data: any | null; error: string | null }> {
  formData.append("email", email);
  return fetchWithErrorHandling(
    apiPath(`admin/trial-tests/${testId}/tasks/${taskId}/update`),
    {
      method: "POST",
      body: formData,
    }
  );
}

// Bank tasks admin API
export type BankMutationConflict =
  | SimilarConflictPayload
  | { code: "VERSION_CONFLICT"; message: string; current_version?: number | null };

async function mutateBankTask(
  endpoint: string,
  method: "POST" | "PUT",
  formData: FormData
): Promise<{ data: BankTask | null; error: string | null; conflict: BankMutationConflict | null }> {
  try {
    const response = await fetch(endpoint, {
      method,
      body: formData,
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

    if (response.status === 409) {
      const detail = parsed?.detail ?? parsed?.error?.detail ?? parsed;
      if (detail && typeof detail === "object" && typeof detail.code === "string") {
        const code = detail.code as string;
        if (code === "SIMILAR_TASKS_FOUND" || code === "VERSION_CONFLICT") {
          return {
            data: null,
            error: detail.message || "Conflict",
            conflict: detail as BankMutationConflict,
          };
        }
      }
    }

    if (!response.ok) {
      const detail = parsed?.detail ?? parsed?.error?.detail;
      if (typeof detail === "string") {
        return { data: null, error: detail, conflict: null };
      }
      if (typeof parsed?.message === "string") {
        return { data: null, error: parsed.message, conflict: null };
      }
      if (detail && typeof detail === "object") {
        return { data: null, error: JSON.stringify(detail), conflict: null };
      }
      return {
        data: null,
        error: `Server error: ${response.status} ${response.statusText}`,
        conflict: null,
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return { data: null, error: "Invalid server response", conflict: null };
    }

    return { data: parsed as BankTask, error: null, conflict: null };
  } catch (error: any) {
    return { data: null, error: error?.message || "Network error", conflict: null };
  }
}

export async function getAdminBankTasks(
  email: string,
  params?: {
    search?: string;
    difficulty?: BankDifficulty | "";
    topics?: string[];
    limit?: number;
    offset?: number;
    trash?: boolean;
  }
): Promise<{ data: BankTaskListResponse | null; error: string | null }> {
  const search = params?.search?.trim();
  const difficulty = params?.difficulty?.trim();
  const topics = params?.topics || [];
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const trash = params?.trash ?? false;

  const endpoint = trash ? "admin/bank/tasks/trash" : "admin/bank/tasks";
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(limit));
  query.set("offset", String(offset));
  if (search) query.set("search", search);
  if (difficulty) query.set("difficulty", difficulty);
  if (topics.length > 0) query.set("topics", topics.join(","));

  return fetchWithErrorHandling<BankTaskListResponse>(
    `${apiPath(endpoint)}?${query.toString()}`
  );
}

export async function getAdminBankQualitySummary(
  email: string
): Promise<{ data: BankQualitySummaryResponse | null; error: string | null }> {
  return fetchWithErrorHandling<BankQualitySummaryResponse>(
    `${apiPath("admin/bank/quality/summary")}?email=${encodeURIComponent(email)}`
  );
}

export async function getAdminBankQualityDeadTasks(
  email: string,
  params?: BankQualityListParams
): Promise<{ data: BankTaskListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(params?.limit ?? 20));
  query.set("offset", String(params?.offset ?? 0));

  const search = params?.search?.trim();
  const difficulty = params?.difficulty?.trim();
  if (search) query.set("search", search);
  if (difficulty) query.set("difficulty", difficulty);

  return fetchWithErrorHandling<BankTaskListResponse>(
    `${apiPath("admin/bank/quality/dead")}?${query.toString()}`
  );
}

export async function getAdminBankQualityNoTopicsTasks(
  email: string,
  params?: BankQualityListParams
): Promise<{ data: BankTaskListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(params?.limit ?? 20));
  query.set("offset", String(params?.offset ?? 0));

  const search = params?.search?.trim();
  const difficulty = params?.difficulty?.trim();
  if (search) query.set("search", search);
  if (difficulty) query.set("difficulty", difficulty);

  return fetchWithErrorHandling<BankTaskListResponse>(
    `${apiPath("admin/bank/quality/no-topics")}?${query.toString()}`
  );
}

export async function getAdminBankQualityDuplicates(
  email: string,
  params?: BankDuplicateListParams
): Promise<{ data: BankDuplicateListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("threshold", String(params?.threshold ?? 0.92));
  query.set("limit", String(params?.limit ?? 10));
  query.set("offset", String(params?.offset ?? 0));

  const search = params?.search?.trim();
  const difficulty = params?.difficulty?.trim();
  const questionType = params?.question_type?.trim();
  if (search) query.set("search", search);
  if (difficulty) query.set("difficulty", difficulty);
  if (questionType) query.set("question_type", questionType);

  return fetchWithErrorHandling<BankDuplicateListResponse>(
    `${apiPath("admin/bank/quality/duplicates")}?${query.toString()}`
  );
}

export async function getAdminBankAuditLogs(
  email: string,
  params?: BankAuditListParams
): Promise<{ data: BankAuditListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(params?.limit ?? 20));
  query.set("offset", String(params?.offset ?? 0));

  const action = params?.action?.trim();
  const actorEmail = params?.actor_email?.trim();
  if (action) query.set("action", action);
  if (typeof params?.task_id === "number" && Number.isFinite(params.task_id) && params.task_id > 0) {
    query.set("task_id", String(params.task_id));
  }
  if (actorEmail) query.set("actor_email", actorEmail);

  return fetchWithErrorHandling<BankAuditListResponse>(
    `${apiPath("admin/bank/audit")}?${query.toString()}`
  );
}

export async function getAdminBankTask(
  taskId: number,
  email: string
): Promise<{ data: BankTask | null; error: string | null }> {
  return fetchWithErrorHandling<BankTask>(
    `${apiPath(`admin/bank/tasks/${taskId}`)}?email=${encodeURIComponent(email)}`
  );
}

export async function createAdminBankTask(
  formData: FormData,
  email: string
): Promise<{ data: BankTask | null; error: string | null; conflict: BankMutationConflict | null }> {
  formData.append("email", email);
  return mutateBankTask(apiPath("admin/bank/tasks"), "POST", formData);
}

export async function updateAdminBankTask(
  taskId: number,
  formData: FormData,
  email: string
): Promise<{ data: BankTask | null; error: string | null; conflict: BankMutationConflict | null }> {
  formData.append("email", email);
  return mutateBankTask(apiPath(`admin/bank/tasks/${taskId}`), "PUT", formData);
}

export async function importAdminBankTasks(
  email: string,
  tasks: Record<string, any> | Array<Record<string, any>>,
  params: {
    mode: BankImportMode;
    previewToken?: string;
    dedupConfirmed?: boolean;
  }
): Promise<{
  preview: BankImportPreviewResponse | null;
  data: BankImportResponse | null;
  error: string | null;
  conflict: SimilarConflictPayload | null;
  validation: BankImportValidationErrorPayload | null;
}> {
  try {
    const response = await fetch(apiPath("admin/bank/tasks/import"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        tasks,
        mode: params.mode,
        preview_token: params.previewToken,
        dedup_confirmed: params.dedupConfirmed ?? false,
      }),
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

    if (response.status === 409) {
      const detail = parsed?.detail ?? parsed?.error?.detail ?? parsed;
      if (detail && typeof detail === "object" && detail.code === "SIMILAR_TASKS_FOUND") {
        return {
          preview: null,
          data: null,
          error: detail.message || "Conflict",
          conflict: detail as SimilarConflictPayload,
          validation: null,
        };
      }
    }

    if (response.status === 400) {
      const detail = parsed?.detail ?? parsed?.error?.detail ?? parsed;
      if (detail && typeof detail === "object" && detail.code === "IMPORT_VALIDATION_FAILED") {
        return {
          preview: null,
          data: null,
          error: "Import validation failed",
          conflict: null,
          validation: detail as BankImportValidationErrorPayload,
        };
      }
      if (detail && typeof detail === "object" && typeof detail.code === "string") {
        return {
          preview: null,
          data: null,
          error: detail.message || detail.code,
          conflict: null,
          validation: null,
        };
      }
    }

    if (!response.ok) {
      const detail = parsed?.detail ?? parsed?.error?.detail;
      if (typeof detail === "string") {
        return { preview: null, data: null, error: detail, conflict: null, validation: null };
      }
      if (detail && typeof detail === "object") {
        return { preview: null, data: null, error: JSON.stringify(detail), conflict: null, validation: null };
      }
      return {
        preview: null,
        data: null,
        error: `Server error: ${response.status} ${response.statusText}`,
        conflict: null,
        validation: null,
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return { preview: null, data: null, error: "Invalid server response", conflict: null, validation: null };
    }

    if (params.mode === "dry_run") {
      return {
        preview: parsed as BankImportPreviewResponse,
        data: null,
        error: null,
        conflict: null,
        validation: null,
      };
    }

    return {
      preview: null,
      data: parsed as BankImportResponse,
      error: null,
      conflict: null,
      validation: null,
    };
  } catch (error: any) {
    return {
      preview: null,
      data: null,
      error: error?.message || "Network error",
      conflict: null,
      validation: null,
    };
  }
}

export async function deleteAdminBankTask(
  taskId: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`admin/bank/tasks/${taskId}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function restoreAdminBankTask(
  taskId: number,
  email: string
): Promise<{ data: BankTask | null; error: string | null }> {
  return fetchWithErrorHandling<BankTask>(
    `${apiPath(`admin/bank/tasks/${taskId}/restore`)}?email=${encodeURIComponent(email)}`,
    {
      method: "POST",
    }
  );
}

export async function permanentlyDeleteAdminBankTask(
  taskId: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`admin/bank/tasks/${taskId}/permanent`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function getAdminBankTopics(
  email: string,
  q?: string,
  limit: number = 20
): Promise<{ data: { items: string[] } | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(limit));
  if (q && q.trim()) query.set("q", q.trim());
  return fetchWithErrorHandling<{ items: string[] }>(
    `${apiPath("admin/bank/topics")}?${query.toString()}`
  );
}

export async function findSimilarAdminBankTasks(
  email: string,
  payload: {
    text: string;
    question_type?: string;
    options?: Array<{ label: string; text: string }>;
    exclude_task_id?: number;
    threshold?: number;
    limit?: number;
  }
): Promise<{ data: { items: BankTaskSimilarCandidate[]; threshold: number; limit: number } | null; error: string | null }> {
  return fetchWithErrorHandling<{ items: BankTaskSimilarCandidate[]; threshold: number; limit: number }>(
    apiPath("admin/bank/tasks/similar"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, ...payload }),
    }
  );
}

export async function getAdminBankTaskVersions(
  taskId: number,
  email: string,
  params?: { limit?: number; offset?: number }
): Promise<{ data: BankTaskVersionListResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("limit", String(params?.limit ?? 50));
  query.set("offset", String(params?.offset ?? 0));
  return fetchWithErrorHandling<BankTaskVersionListResponse>(
    `${apiPath(`admin/bank/tasks/${taskId}/versions`)}?${query.toString()}`
  );
}

export async function getAdminBankTaskVersion(
  taskId: number,
  versionNo: number,
  email: string
): Promise<{ data: BankTaskVersionDetail | null; error: string | null }> {
  return fetchWithErrorHandling<BankTaskVersionDetail>(
    `${apiPath(`admin/bank/tasks/${taskId}/versions/${versionNo}`)}?email=${encodeURIComponent(email)}`
  );
}

export async function deleteAdminBankTaskVersion(
  taskId: number,
  versionNo: number,
  email: string
): Promise<{ data: { success: boolean } | null; error: string | null }> {
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`admin/bank/tasks/${taskId}/versions/${versionNo}`)}?email=${encodeURIComponent(email)}`,
    {
      method: "DELETE",
    }
  );
}

export async function rollbackAdminBankTask(
  taskId: number,
  payload: {
    email: string;
    target_version: number;
    reason?: string;
    expected_current_version?: number;
  }
): Promise<{ data: BankTask | null; error: string | null; conflict: BankMutationConflict | null }> {
  try {
    const response = await fetch(apiPath(`admin/bank/tasks/${taskId}/rollback`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let parsed: any = null;
    if (contentType.includes("application/json") && text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (response.status === 409) {
      const detail = parsed?.detail ?? parsed?.error?.detail ?? parsed;
      if (detail && typeof detail === "object" && detail.code === "VERSION_CONFLICT") {
        return { data: null, error: detail.message || "Conflict", conflict: detail as BankMutationConflict };
      }
    }
    if (!response.ok) {
      const detail = parsed?.detail ?? parsed?.error?.detail;
      return {
        data: null,
        error: typeof detail === "string" ? detail : (parsed?.message || `Server error: ${response.status}`),
        conflict: null,
      };
    }
    return { data: parsed as BankTask, error: null, conflict: null };
  } catch (error: any) {
    return { data: null, error: error?.message || "Network error", conflict: null };
  }
}

export async function getAdminBankTaskUsage(
  taskId: number,
  email: string,
  scope: "active" | "all" = "active"
): Promise<{ data: BankTaskUsageResponse | null; error: string | null }> {
  const query = new URLSearchParams();
  query.set("email", email);
  query.set("scope", scope);
  return fetchWithErrorHandling<BankTaskUsageResponse>(
    `${apiPath(`admin/bank/tasks/${taskId}/usage`)}?${query.toString()}`
  );
}

export async function addTasksFromBankToTrialTest(
  testId: number,
  bankTaskIds: number[],
  email: string
): Promise<{ data: TrialTestAddFromBankResponse | null; error: string | null }> {
  return fetchWithErrorHandling<TrialTestAddFromBankResponse>(
    apiPath(`admin/trial-tests/${testId}/tasks/from-bank`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        bank_task_ids: bankTaskIds,
      }),
    }
  );
}

export async function exportAdminBankTasksJson(): Promise<FileDownloadResult> {
  try {
    const response = await fetch(apiPath("admin/bank/tasks/export"), {
      method: "GET",
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const responseText = await response.text();
      if (contentType.includes("application/json") && responseText) {
        try {
          const parsed = JSON.parse(responseText);
          const detail = parsed?.detail ?? parsed?.error?.detail ?? parsed?.message ?? parsed;
          if (typeof detail === "string") {
            return { blob: null, filename: null, error: detail };
          }
          if (detail && typeof detail === "object") {
            return { blob: null, filename: null, error: JSON.stringify(detail) };
          }
        } catch {
          // Fall back to plain-text handling below.
        }
      }

      return {
        blob: null,
        filename: null,
        error: responseText || `Server error: ${response.status} ${response.statusText}`,
      };
    }

    const contentDisposition = response.headers.get("content-disposition") || "";
    const filenameMatch =
      contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
      contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    const filename = filenameMatch?.[1]
      ? decodeURIComponent(filenameMatch[1])
      : "bank_tasks_export.json";

    return {
      blob: await response.blob(),
      filename,
      error: null,
    };
  } catch (error: any) {
    return {
      blob: null,
      filename: null,
      error: error?.message || "Network error",
    };
  }
}
