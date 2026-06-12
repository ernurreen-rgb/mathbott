import { apiPath, fetchWithErrorHandling } from "./client";
import { TrialTest, BankPlacementTask } from "@/types";


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
