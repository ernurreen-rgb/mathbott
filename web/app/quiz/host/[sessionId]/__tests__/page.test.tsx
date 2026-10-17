import { act, render, waitFor } from "@testing-library/react";
import HostQuizPage from "../page";
import { getQuizSession, getQuizSessionStats } from "@/lib/api/quizzes";
import { useQuizConnection } from "@/lib/use-quiz-connection";

jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ sessionId: "1" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({
  data: { user: { email: "teacher@example.com" } }, status: "authenticated",
}) }));
jest.mock("@/lib/api/quizzes", () => ({ getQuizSession: jest.fn(), getQuizSessionStats: jest.fn() }));
jest.mock("@/lib/use-quiz-connection", () => ({ useQuizConnection: jest.fn() }));

const report = { session_id: 1, total_players: 0, leaderboard: [], podium: [], question_stats: [] };
beforeEach(() => {
  jest.resetAllMocks();
  (getQuizSession as jest.Mock).mockResolvedValue({ data: { id: 1, status: "finished", participants: [] }, error: null });
});

it("stops host polling after the final report is loaded", async () => {
  (getQuizSessionStats as jest.Mock).mockResolvedValue({ data: report, error: null });
  render(<HostQuizPage params={Promise.resolve({ sessionId: "1" })} />);
  await waitFor(() => expect((useQuizConnection as jest.Mock).mock.calls.at(-1)?.[3]).toBe(false));
  expect(getQuizSessionStats).toHaveBeenCalledTimes(1);
});

it("keeps polling if the report failed and stops after it recovers", async () => {
  (getQuizSessionStats as jest.Mock).mockResolvedValueOnce({ data: null, error: "Network failure" })
    .mockResolvedValue({ data: report, error: null });
  render(<HostQuizPage params={Promise.resolve({ sessionId: "1" })} />);
  await waitFor(() => expect(getQuizSessionStats).toHaveBeenCalledTimes(1));
  expect((useQuizConnection as jest.Mock).mock.calls.at(-1)?.[3]).toBe(true);
  await act(async () => { (useQuizConnection as jest.Mock).mock.calls.at(-1)?.[2](); });
  await waitFor(() => expect((useQuizConnection as jest.Mock).mock.calls.at(-1)?.[3]).toBe(false));
  expect(getQuizSessionStats).toHaveBeenCalledTimes(2);
});
