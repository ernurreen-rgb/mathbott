import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuizPlayer } from "../use-quiz-player";
import { readQuizPlayer, saveQuizPlayer } from "../quiz-player-storage";
import * as api from "../api/quizzes";
import type { QuizPlayerProgress } from "@/types/quiz";

jest.mock("../use-quiz-connection", () => ({ useQuizConnection: jest.fn() }));
jest.mock("../api/quizzes", () => ({
  activateQuizQuestion: jest.fn(), getQuizLeaderboard: jest.fn(), getQuizProgress: jest.fn(),
  getQuizSession: jest.fn(), submitQuizAnswer: jest.fn(), updateQuizParticipantAvatar: jest.fn(),
}));

const credentials = { sessionId: 1, participantId: 7, token: "t".repeat(43), nickname: "Player", avatarColor: "#123456" };
const active: QuizPlayerProgress = {
  status: "in_progress", participant: { id: 7, session_id: 1, nickname: "Player", avatar_color: "#123456",
    score: 950, streak: 1, correct_count: 1, total_answered: 1, is_finished: false, joined_at: "", last_active_at: "" },
  question_count: 2, current_question_index: 1,
  current_question: { id: 2, quiz_id: 1, question_text: "2+2", question_type: "input", options: [], points: 1000, time_limit_seconds: 30, sort_order: 1 },
  server_now: 1000, deadline_at: 1005, result: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  saveQuizPlayer(credentials);
  (api.getQuizProgress as jest.Mock).mockResolvedValue({ data: active, error: null });
  (api.getQuizSession as jest.Mock).mockResolvedValue({ data: { id: 1, status: "in_progress" }, error: null });
  (api.getQuizLeaderboard as jest.Mock).mockResolvedValue({ data: [active.participant], error: null });
});

it("restores authoritative score, question index and remaining time", async () => {
  const { result } = renderHook(() => useQuizPlayer(1));
  await waitFor(() => expect(result.current.progress?.participant.score).toBe(950));
  expect(result.current.progress?.current_question_index).toBe(1);
  expect(result.current.timeLeft).toBeLessThanOrEqual(5);
  expect(api.activateQuizQuestion).not.toHaveBeenCalled();
});

it("restores a finished result without starting a new question", async () => {
  (api.getQuizProgress as jest.Mock).mockResolvedValue({ data: { ...active, status: "finished" }, error: null });
  const { result } = renderHook(() => useQuizPlayer(1));
  await waitFor(() => expect(result.current.progress?.status).toBe("finished"));
  expect(result.current.progress?.participant.correct_count).toBe(1);
  expect(result.current.progress?.participant.score).toBe(950);
  expect(api.activateQuizQuestion).not.toHaveBeenCalled();
});

it("keeps failed answers retryable and recovers an accepted retry", async () => {
  (api.submitQuizAnswer as jest.Mock).mockResolvedValue({ data: null, error: "Network failure" });
  const { result } = renderHook(() => useQuizPlayer(1));
  await waitFor(() => expect(result.current.progress).not.toBeNull());
  await act(async () => { await result.current.submitAnswer("4"); });
  expect(result.current.submitting).toBe(false);
  expect(result.current.progress?.result).toBeNull();
  expect(result.current.error).toBe("Network failure");
  const answer = { is_correct: true, points_awarded: 900, total_score: 1850, streak: 2 };
  (api.submitQuizAnswer as jest.Mock).mockResolvedValue({ data: answer, error: null });
  (api.getQuizProgress as jest.Mock).mockResolvedValue({ data: { ...active, result: answer,
    participant: { ...active.participant, score: 1850, correct_count: 2 } }, error: null });
  await act(async () => { await result.current.submitAnswer("4"); });
  expect(result.current.progress?.participant.score).toBe(1850);
  expect(result.current.progress?.participant.correct_count).toBe(2);
  expect(result.current.error).toBeNull();
});

it("updates avatar in lobby and persists to sessionStorage", async () => {
  (api.updateQuizParticipantAvatar as jest.Mock).mockResolvedValue({
    data: { ...active.participant, avatar_color: "#ec4899:cat" },
    error: null,
  });
  const { result } = renderHook(() => useQuizPlayer(1));
  await waitFor(() => expect(result.current.progress).not.toBeNull());
  await act(async () => {
    await result.current.updateAvatar("#ec4899:cat");
  });
  expect(api.updateQuizParticipantAvatar).toHaveBeenCalledWith(
    1,
    "#ec4899:cat",
    { participantToken: credentials.token }
  );
  expect(readQuizPlayer(1)?.avatarColor).toBe("#ec4899:cat");
});

it("does not reuse credentials from a different game or legacy global storage", () => {
  expect(readQuizPlayer(2)).toBeNull();
  sessionStorage.clear();
  sessionStorage.setItem("quiz_participant_id", "7");
  expect(readQuizPlayer(1)).toBeNull();
});
