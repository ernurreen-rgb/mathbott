import { apiPath, fetchWithErrorHandling } from "./client";
import { Module, ModuleDetails, LessonDetails } from "@/types";


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
