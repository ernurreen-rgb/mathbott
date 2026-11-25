import { apiPath, fetchWithErrorHandling as fetchBase, type FetchResult } from "./client";
import type {
  ConstructorQuestionType,
  ConstructorTask,
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
  excludeTopics?: string[];
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
  if (query.excludeTopics?.length) params.set("exclude_topics", query.excludeTopics.join(","));
  if (query.topicMatch && query.topicMatch !== "any") params.set("topic_match", query.topicMatch);
  if (query.questionType) params.set("question_type", query.questionType);
  params.set("limit", String(query.limit ?? 20));
  if (query.offset) params.set("offset", String(query.offset));
  return request<ConstructorTaskPage>(withEmail("constructor/tasks", email, params));
}

export function getConstructorTaskTwins(taskId: number, email: string): Promise<FetchResult<{ items: ConstructorTask[] }>> {
  return request<{ items: ConstructorTask[] }>(withEmail(`constructor/tasks/${taskId}/twins`, email));
}

export function getConstructorTopics(email: string): Promise<FetchResult<{ items: string[] }>> {
  return request<{ items: string[] }>(withEmail("constructor/topics", email));
}

const pendingCollectionUpdates = new Set<Promise<unknown>>();

export function trackCollectionMutation<T>(promise: Promise<T>): Promise<T> {
  pendingCollectionUpdates.add(promise);
  void promise.finally(() => pendingCollectionUpdates.delete(promise));
  return promise;
}

export async function waitForPendingCollectionUpdates(): Promise<void> {
  while (pendingCollectionUpdates.size > 0) {
    await Promise.allSettled(Array.from(pendingCollectionUpdates));
  }
}

export async function listTaskCollections(email: string): Promise<FetchResult<TaskCollectionList>> {
  await waitForPendingCollectionUpdates();
  return request<TaskCollectionList>(withEmail("constructor/collections", email));
}

export function createTaskCollection(
  title: string,
  email: string,
  options?: { keepalive?: boolean },
): Promise<FetchResult<TaskCollection>> {
  return trackCollectionMutation(
    request<TaskCollection>(
      withEmail("constructor/collections", email),
      { ...json("POST", { title }), ...(options?.keepalive ? { keepalive: true } : {}) },
    ),
  );
}

export async function getTaskCollection(id: number, email: string): Promise<FetchResult<TaskCollection>> {
  await waitForPendingCollectionUpdates();
  return request<TaskCollection>(withEmail(`constructor/collections/${id}`, email));
}

export function updateTaskCollection(
  id: number,
  change: { title?: string; header_text?: string; task_ids?: number[]; pptx_font?: string },
  email: string,
  options?: { keepalive?: boolean },
): Promise<FetchResult<TaskCollection>> {
  return trackCollectionMutation(
    request<TaskCollection>(
      withEmail(`constructor/collections/${id}`, email),
      { ...json("PUT", change), ...(options?.keepalive ? { keepalive: true } : {}) },
    ),
  );
}

export function deleteTaskCollection(
  id: number,
  email: string,
  options?: { keepalive?: boolean },
): Promise<FetchResult<{ deleted: boolean }>> {
  return trackCollectionMutation(
    request<{ deleted: boolean }>(withEmail(`constructor/collections/${id}`, email), {
      method: "DELETE",
      ...(options?.keepalive ? { keepalive: true } : {}),
    }),
  );
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
