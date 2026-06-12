import { apiPath, fetchWithErrorHandling, FileDownloadResult } from "./client";
import { BankDifficulty, BankTask, BankTaskListResponse, TrialTestAddFromBankResponse, BankTaskVersionListResponse, BankTaskVersionDetail, BankTaskUsageResponse, BankTaskSimilarCandidate, SimilarConflictPayload, BankImportValidationErrorPayload, BankImportResponse, BankImportMode, BankImportPreviewResponse, BankQualitySummaryResponse, BankQualityListParams, BankDuplicateListParams, BankDuplicateListResponse, BankAuditListParams, BankAuditListResponse } from "@/types";


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
