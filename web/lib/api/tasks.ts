import { apiPath, fetchWithErrorHandling } from "./client";


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
