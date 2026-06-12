import { apiPath } from "./client";


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
