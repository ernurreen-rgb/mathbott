import type { QuizPlayerCredentials } from "@/types/quiz";

export const QUIZ_PLAYERS_CHANGED = "quiz-players-changed";
const PREFIX = "quiz_player_";

function parsePlayer(raw: string | null): QuizPlayerCredentials | null {
  try {
    const item = JSON.parse(raw || "null");
    return item && Number.isSafeInteger(item.sessionId) && item.sessionId > 0 &&
      Number.isSafeInteger(item.participantId) && item.participantId > 0 &&
      typeof item.token === "string" && item.token.length >= 32 && item.token.length <= 256 &&
      typeof item.nickname === "string" && typeof item.avatarColor === "string" ? item : null;
  } catch { return null; }
}

export function readQuizPlayer(sessionId: number, participantId?: number): QuizPlayerCredentials | null {
  if (typeof window === "undefined") return null;
  const key = `${PREFIX}${sessionId}${participantId ? `_${participantId}` : ""}`;
  try {
    const tabPlayer = parsePlayer(sessionStorage.getItem(key));
    if (tabPlayer?.sessionId === sessionId && (!participantId || tabPlayer.participantId === participantId)) {
      saveQuizPlayer(tabPlayer, false);
      return tabPlayer;
    }
  } catch { /* Persistent credentials still work when session storage is unavailable. */ }
  try {
    const player = parsePlayer(localStorage.getItem(key));
    return player?.sessionId === sessionId && (!participantId || player.participantId === participantId) ? player : null;
  } catch { return null; }
}

export function saveQuizPlayer(player: QuizPlayerCredentials, notify = true): boolean {
  if (typeof window === "undefined") return false;
  const activeKey = `${PREFIX}${player.sessionId}`;
  const archiveKey = `${activeKey}_${player.participantId}`;
  const previous = readArchive(archiveKey);
  const stored = { ...player, accountEmail: player.accountEmail || previous?.accountEmail };
  let persistent = false;
  try {
    localStorage.setItem(archiveKey, JSON.stringify(stored));
    localStorage.setItem(activeKey, JSON.stringify(stored));
    persistent = true;
  } catch { /* Keep the current tab playable if storage is full or blocked. */ }
  try {
    sessionStorage.setItem(activeKey, JSON.stringify(stored));
    sessionStorage.setItem(archiveKey, JSON.stringify(stored));
  } catch { /* The persistent copy remains usable. */ }
  if (notify) window.dispatchEvent(new Event(QUIZ_PLAYERS_CHANGED));
  return persistent;
}

function readArchive(key: string) {
  try { return parsePlayer(localStorage.getItem(key)); } catch { return null; }
}

export function listQuizPlayers(): QuizPlayerCredentials[] {
  if (typeof window === "undefined") return [];
  const players = new Map<string, QuizPlayerCredentials>();
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage();
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        const player = parsePlayer(storage.getItem(key));
        if (player) {
          const id = `${player.sessionId}:${player.participantId}`;
          const previous = players.get(id);
          players.set(id, { ...player, accountEmail: player.accountEmail || previous?.accountEmail });
        }
      }
    } catch { /* A blocked storage must not prevent playing as a guest. */ }
  }
  const result = [...players.values()];
  for (const player of result) {
    try { localStorage.setItem(`${PREFIX}${player.sessionId}_${player.participantId}`, JSON.stringify(player)); } catch { /* Legacy migration is best effort. */ }
  }
  return result;
}

export function markQuizPlayerLinked(player: QuizPlayerCredentials, email: string) {
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = getStorage();
      const linked = JSON.stringify({ ...player, accountEmail: email });
      storage.setItem(`${PREFIX}${player.sessionId}_${player.participantId}`, linked);
      const active = parsePlayer(storage.getItem(`${PREFIX}${player.sessionId}`));
      if (active?.participantId === player.participantId) storage.setItem(`${PREFIX}${player.sessionId}`, linked);
    } catch { /* Linking on the server remains successful even if local storage is unavailable. */ }
  }
}
