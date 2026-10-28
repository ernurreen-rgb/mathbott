import { apiPath, fetchWithErrorHandling as fetchBase, FetchResult } from "./client";
import {
  Quiz,
  QuizQuestion,
  QuizSession,
  QuizParticipant,
  QuizAnswerResponse,
  QuizSessionStats,
  QuizSessionSummary,
  QuizSessionFullResults,
  UserQuizHistoryItem,
  QuizAuth,
  QuizPlayerProgress,
} from "@/types/quiz";

// Quiz reads carry changing state and guest capabilities; never reuse URL-only caches.
const fetchWithErrorHandling = <T>(url: string, options?: RequestInit) =>
  fetchBase<T>(url, { ...options, cache: "no-store" });
const authQuery = (auth?: QuizAuth) => auth?.email ? `?email=${encodeURIComponent(auth.email)}` : "";
const authHeaders = (auth?: QuizAuth): Record<string, string> =>
  auth?.participantToken ? { "X-Quiz-Participant-Token": auth.participantToken } : {};

export async function getQuizzes(
  myOnly: boolean = false,
  email?: string,
  isPublic?: boolean
): Promise<FetchResult<Quiz[]>> {
  const params = new URLSearchParams();
  if (myOnly) params.set("my_only", "true");
  if (email) params.set("email", email);
  if (isPublic !== undefined) params.set("is_public", isPublic ? "true" : "false");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return fetchWithErrorHandling<Quiz[]>(`${apiPath("quizzes")}${qs}`);
}

export async function getQuiz(quizId: number, email?: string): Promise<FetchResult<Quiz>> {
  return fetchWithErrorHandling<Quiz>(`${apiPath(`quizzes/${quizId}`)}${authQuery({ email })}`);
}

export async function getQuizQuestions(quizId: number, email?: string): Promise<FetchResult<QuizQuestion[]>> {
  return fetchWithErrorHandling<QuizQuestion[]>(`${apiPath(`quizzes/${quizId}/questions`)}${authQuery({ email })}`);
}

export async function createQuiz(
  payload: { title: string; description?: string; cover_image?: string; is_public?: boolean; questions?: Partial<QuizQuestion>[] },
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

export async function addQuizQuestion(
  quizId: number,
  payload: any,
  email?: string
): Promise<FetchResult<QuizQuestion>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizQuestion>(`${apiPath(`quizzes/${quizId}/questions`)}${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateQuizQuestion(
  quizId: number,
  questionId: number,
  payload: any,
  email?: string
): Promise<FetchResult<QuizQuestion>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizQuestion>(
    `${apiPath(`quizzes/${quizId}/questions/${questionId}`)}${qs}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteQuizQuestion(
  quizId: number,
  questionId: number,
  email?: string
): Promise<FetchResult<{ success: boolean }>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<{ success: boolean }>(
    `${apiPath(`quizzes/${quizId}/questions/${questionId}`)}${qs}`,
    {
      method: "DELETE",
    }
  );
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

export async function getSessionQuestions(
  sessionId: number,
  isHost: boolean = false,
  auth?: QuizAuth
): Promise<FetchResult<QuizQuestion[]>> {
  return fetchWithErrorHandling<QuizQuestion[]>(
    `${apiPath(`quiz-sessions/${sessionId}/questions`)}?is_host=${isHost}${auth?.email ? `&email=${encodeURIComponent(auth.email)}` : ""}`,
    { headers: authHeaders(auth) }
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
