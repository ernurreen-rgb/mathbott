import { claimQuizResult } from "../api/quizzes";
import { listQuizPlayers, saveQuizPlayer } from "../quiz-player-storage";
import { syncGuestQuizResults } from "../quiz-guest-sync";
import { getUserData } from "../api/user";

jest.mock("../api/quizzes", () => ({ claimQuizResult: jest.fn() }));
jest.mock("../api/user", () => ({ getUserData: jest.fn() }));
const player = { sessionId: 4, participantId: 7, token: "t".repeat(43), nickname: "Guest", avatarColor: "#fff" };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); jest.clearAllMocks();
  (getUserData as jest.Mock).mockResolvedValue({ data: { id: 1, email: "owner@example.com" }, error: null });
});

it("claims all guest games once, then keeps ownership when the account changes", async () => {
  saveQuizPlayer(player);
  (claimQuizResult as jest.Mock).mockResolvedValue({ data: { linked: true }, error: null });
  await syncGuestQuizResults("OWNER@example.com");
  expect(claimQuizResult).toHaveBeenCalledWith(4, player.token, "owner@example.com");
  expect(listQuizPlayers()[0].accountEmail).toBe("owner@example.com");
  await syncGuestQuizResults("other@example.com");
  expect(claimQuizResult).toHaveBeenCalledTimes(1);
});

it("retains credentials after network failure and retries without losing results", async () => {
  saveQuizPlayer(player);
  (claimQuizResult as jest.Mock).mockResolvedValueOnce({ data: null, error: "Offline" })
    .mockResolvedValueOnce({ data: { linked: true }, error: null });
  expect(await syncGuestQuizResults("owner@example.com")).toBe(0);
  expect(listQuizPlayers()[0].token).toBe(player.token);
  expect(await syncGuestQuizResults("owner@example.com")).toBe(1);
});

it("waits for a newly registered web account before claiming results", async () => {
  saveQuizPlayer(player);
  (getUserData as jest.Mock).mockResolvedValue({ data: null, error: "Account not ready" });
  expect(await syncGuestQuizResults("owner@example.com")).toBe(0);
  expect(claimQuizResult).not.toHaveBeenCalled();
  expect(listQuizPlayers()[0].accountEmail).toBeUndefined();
});
