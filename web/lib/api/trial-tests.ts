import { apiPath, fetchWithErrorHandling } from "./client";
import { TrialTest, TrialTestDetails, TrialTestResult, TrialTestSubmitRequest, TrialTestSubmitResponse } from "@/types";


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
