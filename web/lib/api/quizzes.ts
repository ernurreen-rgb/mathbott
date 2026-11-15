import { apiPath, fetchWithErrorHandling as fetchBase, FetchResult } from "./client";
import {
  Quiz,
  QuizCatalog,
  QuizCatalogQuery,
  QuizQuestion,
  QuizSession,
  QuizParticipant,
  QuizAnswerResponse,
  QuizSessionStats,
  QuizSessionSummary,
  QuizSessionFullResults,
  UserQuizHistoryItem,
  QuizReview,
  QuizPracticeResult,
  QuizAuth,
  QuizPlayerProgress,
} from "@/types/quiz";

// Quiz reads carry changing state and guest capabilities; never reuse URL-only caches.
const fetchWithErrorHandling = <T>(url: string, options?: RequestInit) =>
  fetchBase<T>(url, { ...options, cache: "no-store" });
const authQuery = (auth?: QuizAuth) => auth?.email ? `?email=${encodeURIComponent(auth.email)}` : "";
const authHeaders = (auth?: QuizAuth): Record<string, string> =>
  auth?.participantToken ? { "X-Quiz-Participant-Token": auth.participantToken } : {};

export async function getQuizCatalog(query: QuizCatalogQuery, email?: string): Promise<FetchResult<QuizCatalog>> {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.visibility) params.set("visibility", query.visibility);
  if (query.q) params.set("q", query.q);
  if (query.grade) params.set("grade", String(query.grade));
  if (query.untagged) params.set("untagged", "true");
  else if (query.topic) params.set("topic", query.topic);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  if (email) params.set("email", email);
  return fetchWithErrorHandling<QuizCatalog>(`${apiPath("quizzes/catalog")}?${params}`);
}

export async function getQuiz(quizId: number, email?: string): Promise<FetchResult<Quiz>> {
  return fetchWithErrorHandling<Quiz>(`${apiPath(`quizzes/${quizId}`)}${authQuery({ email })}`);
}

export async function getQuizQuestions(quizId: number, email?: string): Promise<FetchResult<QuizQuestion[]>> {
  return fetchWithErrorHandling<QuizQuestion[]>(`${apiPath(`quizzes/${quizId}/questions`)}${authQuery({ email })}`);
}

export async function createQuiz(
  payload: { title: string; description?: string; cover_image?: string; is_public?: boolean; grade?: number | null; topic?: string; questions?: Partial<QuizQuestion>[] },
  email?: string
): Promise<FetchResult<Quiz>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<Quiz>(`${apiPath("quizzes")}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateQuiz(
  quizId: number,
  payload: Partial<Quiz> & { questions?: Partial<QuizQuestion>[] },
  email?: string
): Promise<FetchResult<Quiz>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<Quiz>(`${apiPath(`quizzes/${quizId}`)}${qs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function forkQuiz(
  quizId: number,
  email?: string
): Promise<FetchResult<Quiz>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<Quiz>(`${apiPath(`quizzes/${quizId}/fork`)}${qs}`, {
    method: "POST",
  });
}

export async function deleteQuiz(
  quizId: number,
  email?: string
): Promise<FetchResult<{ success: boolean }>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<{ success: boolean }>(`${apiPath(`quizzes/${quizId}`)}${qs}`, {
    method: "DELETE",
  });
}

// --- Game Sessions ---

export async function createQuizSession(
  quizId: number,
  settings: Record<string, any> = {},
  email?: string
): Promise<FetchResult<QuizSession>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizSession>(`${apiPath("quiz-sessions")}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz_id: quizId, settings }),
  });
}

export async function getQuizSession(sessionId: number, auth?: QuizAuth): Promise<FetchResult<QuizSession>> {
  return fetchWithErrorHandling<QuizSession>(`${apiPath(`quiz-sessions/${sessionId}`)}${authQuery(auth)}`, { headers: authHeaders(auth) });
}

export async function getQuizSessionByPin(pinCode: string): Promise<FetchResult<QuizSession>> {
  return fetchWithErrorHandling<QuizSession>(apiPath(`quiz-sessions/pin/${encodeURIComponent(pinCode)}`));
}

export async function joinQuizSession(
  pinCode: string,
  nickname: string,
  email?: string,
  avatarColor?: string,
  participantToken?: string
): Promise<FetchResult<{ session: QuizSession; participant: QuizParticipant; participant_token: string }>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<{ session: QuizSession; participant: QuizParticipant; participant_token: string }>(
    `${apiPath("quiz-sessions/join")}${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin_code: pinCode,
        nickname,
        email: email || undefined,
        avatar_color: avatarColor || undefined,
        participant_token: participantToken || undefined,
      }),
    }
  );
}

export async function updateQuizParticipantAvatar(
  sessionId: number,
  avatarColor: string,
  auth?: QuizAuth
): Promise<FetchResult<QuizParticipant>> {
  return fetchWithErrorHandling<QuizParticipant>(
    apiPath(`quiz-sessions/${sessionId}/avatar`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify({ avatar_color: avatarColor }),
    }
  );
}

export async function startQuizSession(
  sessionId: number,
  email?: string,
  options?: { shuffle_questions?: boolean }
): Promise<FetchResult<QuizSession>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizSession>(`${apiPath(`quiz-sessions/${sessionId}/start`)}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options || {}),
  });
}

export async function finishQuizSession(
  sessionId: number,
  email?: string
): Promise<FetchResult<QuizSessionStats>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizSessionStats>(
    `${apiPath(`quiz-sessions/${sessionId}/finish`)}${qs}`,
    {
      method: "POST",
    }
  );
}

export async function submitQuizAnswer(
  sessionId: number,
  payload: {
    participant_id: number;
    question_id: number;
    answer: string;
    time_taken_seconds?: number;
  },
  auth?: QuizAuth
): Promise<FetchResult<QuizAnswerResponse>> {
  return fetchWithErrorHandling<QuizAnswerResponse>(
    apiPath(`quiz-sessions/${sessionId}/answers`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify(payload),
    }
  );
}

export async function completeQuizParticipant(
  sessionId: number,
  participantId: number,
  auth?: QuizAuth
): Promise<FetchResult<{ success: boolean }>> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath(`quiz-sessions/${sessionId}/complete`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify({ participant_id: participantId }),
    }
  );
}

export async function getQuizLeaderboard(
  sessionId: number, auth?: QuizAuth
): Promise<FetchResult<QuizParticipant[]>> {
  return fetchWithErrorHandling<QuizParticipant[]>(
    `${apiPath(`quiz-sessions/${sessionId}/leaderboard`)}${authQuery(auth)}`,
    { headers: authHeaders(auth) }
  );
}

export async function getQuizSessionStats(
  sessionId: number, auth?: QuizAuth
): Promise<FetchResult<QuizSessionStats>> {
  return fetchWithErrorHandling<QuizSessionStats>(
    `${apiPath(`quiz-sessions/${sessionId}/stats`)}${authQuery(auth)}`,
    { headers: authHeaders(auth) }
  );
}

export function getQuizProgress(sessionId: number, auth: QuizAuth) {
  return fetchWithErrorHandling<QuizPlayerProgress>(apiPath(`quiz-sessions/${sessionId}/progress`), { headers: authHeaders(auth) });
}

export function activateQuizQuestion(sessionId: number, auth: QuizAuth, advance = false, questionId?: number) {
  return fetchWithErrorHandling<QuizPlayerProgress>(apiPath(`quiz-sessions/${sessionId}/${advance ? "next" : "current-question"}`), {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(auth) },
    body: advance ? JSON.stringify({ question_id: questionId }) : undefined,
  });
}

export function getQuizWsToken(sessionId: number, auth: QuizAuth) {
  return fetchWithErrorHandling<{ token: string; expires_in: number }>(
    `${apiPath(`quiz-sessions/${sessionId}/ws-token`)}${authQuery(auth)}`, { headers: authHeaders(auth) });
}

export async function getQuizSessions(
  quizId: number,
  email?: string
): Promise<FetchResult<QuizSessionSummary[]>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizSessionSummary[]>(
    `${apiPath(`quizzes/${quizId}/sessions`)}${qs}`
  );
}

export async function getQuizSessionFullResults(
  sessionId: number,
  auth?: QuizAuth
): Promise<FetchResult<QuizSessionFullResults>> {
  return fetchWithErrorHandling<QuizSessionFullResults>(
    `${apiPath(`quiz-sessions/${sessionId}/results`)}${authQuery(auth)}`,
    { headers: authHeaders(auth) }
  );
}

export async function getUserQuizHistory(
  email?: string
): Promise<FetchResult<UserQuizHistoryItem[]>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<UserQuizHistoryItem[]>(
    `${apiPath("quiz-sessions/user/history")}${qs}`
  );
}

export function claimQuizResult(sessionId: number, participantToken: string, email: string) {
  return fetchWithErrorHandling<{ linked: boolean }>(`${apiPath(`quiz-sessions/${sessionId}/claim`)}?email=${encodeURIComponent(email)}&expected_email=${encodeURIComponent(email)}`, {
    method: "POST", headers: { "X-Quiz-Participant-Token": participantToken },
  });
}

export function getQuizReview(sessionId: number, participantId: number, auth?: QuizAuth) {
  const params = new URLSearchParams({ participant_id: String(participantId) });
  if (auth?.email) params.set("email", auth.email);
  return fetchWithErrorHandling<QuizReview>(`${apiPath(`quiz-sessions/${sessionId}/review`)}?${params}`, { headers: authHeaders(auth) });
}

export function checkQuizPracticeAnswer(sessionId: number, participantId: number, questionId: number, answer: string, auth?: QuizAuth) {
  return fetchWithErrorHandling<QuizPracticeResult>(`${apiPath(`quiz-sessions/${sessionId}/review/answers`)}${authQuery(auth)}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(auth) },
    body: JSON.stringify({ participant_id: participantId, question_id: questionId, answer }),
  });
}
