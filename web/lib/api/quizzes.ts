import { apiPath, fetchWithErrorHandling, FetchResult } from "./client";
import {
  Quiz,
  QuizQuestion,
  QuizSession,
  QuizParticipant,
  QuizAnswerResult,
  QuizSessionStats,
} from "@/types/quiz";

export async function getQuizzes(
  myOnly: boolean = false,
  email?: string
): Promise<FetchResult<Quiz[]>> {
  const params = new URLSearchParams();
  if (myOnly) params.set("my_only", "true");
  if (email) params.set("email", email);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return fetchWithErrorHandling<Quiz[]>(`${apiPath("quizzes")}${qs}`);
}

export async function getQuiz(quizId: number): Promise<FetchResult<Quiz>> {
  return fetchWithErrorHandling<Quiz>(apiPath(`quizzes/${quizId}`));
}

export async function getQuizQuestions(quizId: number): Promise<FetchResult<QuizQuestion[]>> {
  return fetchWithErrorHandling<QuizQuestion[]>(apiPath(`quizzes/${quizId}/questions`));
}

export async function createQuiz(
  payload: { title: string; description?: string; cover_image?: string; is_public?: boolean },
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
  payload: Partial<Quiz>,
  email?: string
): Promise<FetchResult<Quiz>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<Quiz>(`${apiPath(`quizzes/${quizId}`)}${qs}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

export async function getQuizSession(sessionId: number): Promise<FetchResult<QuizSession>> {
  return fetchWithErrorHandling<QuizSession>(apiPath(`quiz-sessions/${sessionId}`));
}

export async function getQuizSessionByPin(pinCode: string): Promise<FetchResult<QuizSession>> {
  return fetchWithErrorHandling<QuizSession>(apiPath(`quiz-sessions/pin/${encodeURIComponent(pinCode)}`));
}

export async function joinQuizSession(
  pinCode: string,
  nickname: string,
  email?: string,
  avatarColor?: string
): Promise<FetchResult<{ session: QuizSession; participant: QuizParticipant }>> {
  return fetchWithErrorHandling<{ session: QuizSession; participant: QuizParticipant }>(
    apiPath("quiz-sessions/join"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin_code: pinCode,
        nickname,
        email: email || undefined,
        avatar_color: avatarColor || undefined,
      }),
    }
  );
}

export async function startQuizSession(
  sessionId: number,
  email?: string
): Promise<FetchResult<QuizSession>> {
  const qs = email ? `?email=${encodeURIComponent(email)}` : "";
  return fetchWithErrorHandling<QuizSession>(`${apiPath(`quiz-sessions/${sessionId}/start`)}${qs}`, {
    method: "POST",
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
  isHost: boolean = false
): Promise<FetchResult<QuizQuestion[]>> {
  return fetchWithErrorHandling<QuizQuestion[]>(
    `${apiPath(`quiz-sessions/${sessionId}/questions`)}?is_host=${isHost}`
  );
}

export async function submitQuizAnswer(
  sessionId: number,
  payload: {
    participant_id: number;
    question_id: number;
    answer: string;
    time_taken_seconds: number;
  }
): Promise<FetchResult<QuizAnswerResult>> {
  return fetchWithErrorHandling<QuizAnswerResult>(
    apiPath(`quiz-sessions/${sessionId}/answers`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
}

export async function completeQuizParticipant(
  sessionId: number,
  participantId: number
): Promise<FetchResult<{ success: boolean }>> {
  return fetchWithErrorHandling<{ success: boolean }>(
    apiPath(`quiz-sessions/${sessionId}/complete`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    }
  );
}

export async function getQuizLeaderboard(
  sessionId: number
): Promise<FetchResult<QuizParticipant[]>> {
  return fetchWithErrorHandling<QuizParticipant[]>(
    apiPath(`quiz-sessions/${sessionId}/leaderboard`)
  );
}

export async function getQuizSessionStats(
  sessionId: number
): Promise<FetchResult<QuizSessionStats>> {
  return fetchWithErrorHandling<QuizSessionStats>(
    apiPath(`quiz-sessions/${sessionId}/stats`)
  );
}
