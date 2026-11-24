import { apiPath, fetchWithErrorHandling as fetchBase, type FetchResult } from "./client";
import type {
  ConstructorQuestionType,
  ConstructorTaskPage,
  TaskCollection,
  TaskCollectionImageKind,
  TaskCollectionList,
  TaskCollectionSummary,
} from "@/types/constructor";

// Collections change with every save: never answer from the short GET cache.
const request = <T>(url: string, options?: RequestInit) => fetchBase<T>(url, { ...options, cache: "no-store" });
const withEmail = (path: string, email: string, params?: URLSearchParams) => {
  const query = new URLSearchParams(params);
  query.set("email", email);
  return `${apiPath(path)}?${query}`;
};
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface ConstructorTaskQuery {
  search?: string;
  difficulty?: "A" | "B" | "C";
  topics?: string[];
  topicMatch?: "any" | "all";
  questionType?: ConstructorQuestionType;
  limit?: number;
  offset?: number;
}

export function getConstructorTasks(query: ConstructorTaskQuery, email: string): Promise<FetchResult<ConstructorTaskPage>> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.topics?.length) params.set("topics", query.topics.join(","));
  if (query.topicMatch && query.topicMatch !== "any") params.set("topic_match", query.topicMatch);
  if (query.questionType) params.set("question_type", query.questionType);
  params.set("limit", String(query.limit ?? 20));
  if (query.offset) params.set("offset", String(query.offset));
  return request<ConstructorTaskPage>(withEmail("constructor/tasks", email, params));
}

export function getConstructorTopics(email: string): Promise<FetchResult<{ items: string[] }>> {
  return request<{ items: string[] }>(withEmail("constructor/topics", email));
}

export function listTaskCollections(email: string): Promise<FetchResult<TaskCollectionList>> {
  return request<TaskCollectionList>(withEmail("constructor/collections", email));
}

export function createTaskCollection(title: string, email: string): Promise<FetchResult<TaskCollection>> {
  return request<TaskCollection>(withEmail("constructor/collections", email), json("POST", { title }));
}

export function getTaskCollection(id: number, email: string): Promise<FetchResult<TaskCollection>> {
  return request<TaskCollection>(withEmail(`constructor/collections/${id}`, email));
}

export function updateTaskCollection(
  id: number,
  change: { title?: string; header_text?: string; task_ids?: number[]; pptx_font?: string },
  email: string,
): Promise<FetchResult<TaskCollection>> {
  return request<TaskCollection>(withEmail(`constructor/collections/${id}`, email), json("PUT", change));
}

export function deleteTaskCollection(id: number, email: string): Promise<FetchResult<{ deleted: boolean }>> {
  return request<{ deleted: boolean }>(withEmail(`constructor/collections/${id}`, email), { method: "DELETE" });
}

/** The collection with answers, for the answer key of a download. */
export function exportTaskCollection(id: number, email: string): Promise<FetchResult<TaskCollection>> {
  return request<TaskCollection>(withEmail(`constructor/collections/${id}/export`, email));
}

export function uploadTaskCollectionImage(
  id: number,
  kind: TaskCollectionImageKind,
  file: Blob,
  email: string,
): Promise<FetchResult<TaskCollectionSummary>> {
  const form = new FormData();
  form.append("image", file, kind === "title" ? "title.jpg" : "background.jpg");
  return request<TaskCollectionSummary>(withEmail(`constructor/collections/${id}/images/${kind}`, email), {
    method: "POST",
    body: form,
  });
}

export function deleteTaskCollectionImage(
  id: number,
  kind: TaskCollectionImageKind,
  email: string,
): Promise<FetchResult<TaskCollectionSummary>> {
  return request<TaskCollectionSummary>(withEmail(`constructor/collections/${id}/images/${kind}`, email), {
    method: "DELETE",
  });
}
