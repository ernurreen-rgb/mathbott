import { act, render, screen } from "@testing-library/react";
import QuizHistoryPage from "../page";
import { claimQuizResult, getQuizProgress, getUserQuizHistory } from "@/lib/api/quizzes";
import { saveQuizPlayer } from "@/lib/quiz-player-storage";

let mockEmail: string | null = null;
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: mockEmail ? { user: { email: mockEmail } } : null, status: mockEmail ? "authenticated" : "unauthenticated" }), signIn: jest.fn() }));
jest.mock("@/lib/api/quizzes", () => ({ claimQuizResult: jest.fn(), getQuizProgress: jest.fn(), getUserQuizHistory: jest.fn() }));
jest.mock("@/lib/api/user", () => ({ getUserData: () => Promise.resolve({ data: { id: 1 }, error: null }) }));
beforeEach(() => {
  jest.clearAllMocks(); mockEmail = null; localStorage.clear(); sessionStorage.clear();
  saveQuizPlayer({ sessionId: 4, participantId: 7, token: "t".repeat(43), nickname: "Guest", avatarColor: "#fff" });
  sessionStorage.clear();
  (getQuizProgress as jest.Mock).mockResolvedValue({ data: {
    status: "finished", session: { quiz_title: "Алгебра" }, question_count: 2,
    participant: { is_finished: true, score: 900, correct_count: 1 },
  }, error: null });
  (claimQuizResult as jest.Mock).mockResolvedValue({ data: { linked: true }, error: null });
  (getUserQuizHistory as jest.Mock).mockResolvedValue({ data: [{
    session_id: 4, participant_id: 7, quiz_title: "Алгебра", score: 900, correct_count: 1, question_count: 2, is_finished: true,
  }], error: null });
});

it("shows guest results after tab loss and preserves the same result after registration without duplication", async () => {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<QuizHistoryPage />); });
  expect(screen.getByText("Алгебра")).toBeInTheDocument();
  expect(screen.getByText(/900 ұпай/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Талдау және қателермен жұмыс" })).toHaveAttribute("href", "/quiz/review/4?participant=7");
  mockEmail = "owner@example.com";
  await act(async () => { view.rerender(<QuizHistoryPage />); });
  expect(claimQuizResult).toHaveBeenCalledTimes(1);
  expect(screen.getAllByText("Алгебра")).toHaveLength(1);
  expect(screen.getByText(/900 ұпай/)).toBeInTheDocument();
  expect(getUserQuizHistory).toHaveBeenCalledWith("owner@example.com");
});
