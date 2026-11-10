import { apiPath, fetchWithErrorHandling } from "./client";
import { Module, ModuleDetails, LessonDetails, MiniLessonReview, MiniLessonReviewAnswerResult } from "@/types";


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


// Mistake review (Қателерді талдау): the proxy replaces the email with the signed-in account.
export async function getMiniLessonReview(miniLessonId: number, email: string) {
  return fetchWithErrorHandling<MiniLessonReview>(
    `${apiPath(`mini-lessons/${miniLessonId}/review`)}?email=${encodeURIComponent(email)}`,
    { cache: "no-store" }
  );
}


export async function submitMiniLessonReviewAnswer(
  miniLessonId: number,
  payload: { task_id: number; bank_task_id: number; answer: string },
  email: string
) {
  return fetchWithErrorHandling<MiniLessonReviewAnswerResult>(
    `${apiPath(`mini-lessons/${miniLessonId}/review/answers`)}?email=${encodeURIComponent(email)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );
}
