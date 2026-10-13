import type { QuizPlayerCredentials } from "@/types/quiz";

export function readQuizPlayer(sessionId: number): QuizPlayerCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const item = JSON.parse(sessionStorage.getItem(`quiz_player_${sessionId}`) || "null");
    return item?.sessionId === sessionId && Number.isInteger(item.participantId) &&
      typeof item.token === "string" && item.token.length >= 32 ? item : null;
  } catch {
    return null;
  }
}

export function saveQuizPlayer(player: QuizPlayerCredentials) {
  sessionStorage.setItem(`quiz_player_${player.sessionId}`, JSON.stringify(player));
}
