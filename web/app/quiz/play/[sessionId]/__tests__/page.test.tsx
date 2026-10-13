import { render, screen } from "@testing-library/react";
import PlayQuizPage from "../page";
import { useQuizPlayer } from "@/lib/use-quiz-player";

// Next's App Router resolves params with React.use; standalone Jest uses React 18.
jest.mock("react", () => ({ ...jest.requireActual("react"), use: () => ({ sessionId: "1" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/use-quiz-player", () => ({ useQuizPlayer: jest.fn() }));

it("offers retry instead of displaying a successful finish on initial load failure", () => {
  (useQuizPlayer as jest.Mock).mockReturnValue({
    credentials: { participantId: 7, nickname: "Player", avatarColor: "#123456" },
    progress: null, sessionData: null, loading: false, submitting: false,
    error: "Connection failed", timeLeft: 0, rank: null, refresh: jest.fn(),
  });
  render(<PlayQuizPage params={Promise.resolve({ sessionId: "1" })} />);
  expect(screen.queryByText("Викторина сәтті аяқталды")).toBeNull();
  expect(screen.getByText("Connection failed")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Қайта жүктеу" })).toBeInTheDocument();
});
