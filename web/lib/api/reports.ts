import { apiPath, fetchWithErrorHandling } from "./client";

// Student reports about a broken task. The backend rejects messages shorter than
// MIN_TASK_REPORT_LENGTH after trimming (ReportRequest / TrialTestReportRequest).
export const MIN_TASK_REPORT_LENGTH = 5;

const postReport = (path: string, email: string, body: Record<string, unknown>) =>
  fetchWithErrorHandling<unknown>(`${apiPath(path)}?email=${encodeURIComponent(email)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export function reportLessonTask(email: string, taskId: number, message: string) {
  return postReport("reports", email, { task_id: taskId, message });
}

export function reportTrialTestTask(email: string, trialTestId: number, taskId: number, message: string) {
  return postReport("trial-test-reports", email, { trial_test_id: trialTestId, task_id: taskId, message });
}
