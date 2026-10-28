import { act, fireEvent, render, screen, within } from "@testing-library/react";
import QuizResultReview from "../QuizResultReview";
import { checkQuizPracticeAnswer, getQuizReview } from "@/lib/api/quizzes";
import { saveQuizPlayer } from "@/lib/quiz-player-storage";

jest.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
jest.mock("@/lib/api/quizzes", () => ({ getQuizReview: jest.fn(), checkQuizPracticeAnswer: jest.fn() }));
jest.mock("@/components/ui/MathFieldInput", () => ({ __esModule: true, default: ({ value, onChange, ariaLabel }: {
  value: string; onChange: (value: string) => void; ariaLabel: string;
}) => <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} /> }));
jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/components/student/TaskStatement", () => ({ __esModule: true, default: ({ task }: { task: { text: string } }) => <span>{task.text}</span> }));

const token = "t".repeat(43);
const question = { id: 1, question_text: "2+2=?", question_type: "input", options: [], correct_answer: "4", explanation: "2+2=4" };
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  saveQuizPlayer({ sessionId: 4, participantId: 7, token, nickname: "Guest", avatarColor: "#fff" });
  (getQuizReview as jest.Mock).mockResolvedValue({ data: {
    session_id: 4, quiz_title: "Алгебра", participant: { nickname: "Guest", score: 900 }, items: [
      { question, user_answer: "3", is_correct: false },
      { question: { ...question, id: 2, question_text: "Correct question" }, user_answer: "4", is_correct: true },
    ],
  }, error: null });
});

it("lets an unsigned guest retry only missed questions, with server feedback and unchanged score", async () => {
  (checkQuizPracticeAnswer as jest.Mock).mockResolvedValueOnce({ data: { is_correct: false, correct_answer: "4", explanation: "2+2=4" }, error: null })
    .mockResolvedValueOnce({ data: { is_correct: true, correct_answer: "4", explanation: "2+2=4" }, error: null });
  await act(async () => { render(<QuizResultReview sessionId={4} participantId={7} />); });
  expect(getQuizReview).toHaveBeenCalledWith(4, 7, { email: undefined, participantToken: token });
  fireEvent.click(screen.getByRole("button", { name: "Қателерді қайта орындау" }));
  const practice = screen.getByRole("region", { name: "Қайталау тапсырмасы" });
  expect(within(practice).queryByText("Correct question")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Қайталау жауабы"), { target: { value: "5" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Тексеру" })); });
  expect(screen.getByText("Қайта байқап көріңіз")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Қайталау жауабы"), { target: { value: "4" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Тексеру" })); });
  expect(screen.getByText("Дұрыс!")).toBeInTheDocument();
  expect(checkQuizPracticeAnswer).toHaveBeenLastCalledWith(4, 7, 1, "4", { email: undefined, participantToken: token });
  expect(screen.getByText(/900 ұпай/)).toBeInTheDocument();
});

it("keeps a failed practice request retryable", async () => {
  (checkQuizPracticeAnswer as jest.Mock).mockResolvedValue({ data: null, error: "Offline" });
  await act(async () => { render(<QuizResultReview sessionId={4} participantId={7} />); });
  fireEvent.click(screen.getByRole("button", { name: "Қателерді қайта орындау" }));
  fireEvent.change(screen.getByLabelText("Қайталау жауабы"), { target: { value: "4" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Тексеру" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByLabelText("Қайталау жауабы")).toHaveValue("4");
  expect(screen.getByRole("button", { name: "Тексеру" })).toBeEnabled();
});
