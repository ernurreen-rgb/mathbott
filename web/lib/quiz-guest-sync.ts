import { claimQuizResult } from "@/lib/api/quizzes";
import { getUserData } from "@/lib/api/user";
import { listQuizPlayers, markQuizPlayerLinked } from "@/lib/quiz-player-storage";

export const QUIZ_RESULTS_LINKED = "quiz-results-linked";
const pending = new Map<string, Promise<number>>();
const terminalFailures = new Set<string>();
const TERMINAL_CLAIM_STATUSES = new Set([401, 403, 404, 409]);

export function syncGuestQuizResults(rawEmail: string): Promise<number> {
  const email = rawEmail.trim().toLowerCase();
  const existing = pending.get(email);
  if (existing) return existing;
  const work = (async () => {
    let linked = 0;
    const players = listQuizPlayers().filter((player) => !player.accountEmail);
    // OAuth creates a session first. Bootstrap the web account before attaching old games.
    try {
      if (players.length && !(await getUserData(email)).data) return 0;
    } catch { return 0; }
    for (const player of players) {
      // Never move results already associated with an account on a shared browser.
      if (player.accountEmail) continue;
      const failureKey = `${email}:${player.sessionId}:${player.participantId}`;
      if (terminalFailures.has(failureKey)) continue;
      try {
        const response = await claimQuizResult(player.sessionId, player.token, email);
        if (response.data?.linked) {
          markQuizPlayerLinked(player, email);
          linked++;
        } else if (response.status && TERMINAL_CLAIM_STATUSES.has(response.status)) {
          // Stop retrying expired, missing, or already-claimed guest tokens for this account.
          terminalFailures.add(failureKey);
        }
      } catch { /* Keep the capability and retry on the next connection. */ }
    }
    if (linked) window.dispatchEvent(new Event(QUIZ_RESULTS_LINKED));
    return linked;
  })();
  pending.set(email, work);
  void work.finally(() => pending.delete(email));
  return work;
}
