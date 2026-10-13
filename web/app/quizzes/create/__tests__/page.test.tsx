import { act, fireEvent, render, screen } from "@testing-library/react";
import CreateQuizPage from "../page";
import { createQuiz } from "@/lib/api/quizzes";
import toast from "react-hot-toast";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "owner@example.com" } } }) }));
jest.mock("@/components/ui/MathRender", () => function MockMathRender({ latex }: { latex: string }) {
  return <span>{latex}</span>;
});
jest.mock("@/lib/api/quizzes", () => ({ createQuiz: jest.fn() }));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }));

it("keeps the draft on an atomic-save failure and submits all questions together", async () => {
  (createQuiz as jest.Mock).mockResolvedValueOnce({ data: null, error: "Save failed" })
    .mockResolvedValueOnce({ data: { id: 12 }, error: null });
  render(<CreateQuizPage />);
  fireEvent.change(screen.getByPlaceholderText("Мысалы: 9-сынып Теңдеулер жарысы"), { target: { value: "Quiz title" } });
  fireEvent.change(screen.getByPlaceholderText(/Мысалы: Теңдеуді шешіңіз/), { target: { value: "Question" } });
  for (const label of ["A", "B", "C", "D"]) {
    fireEvent.change(screen.getByPlaceholderText(`${label} нұсқасын жазыңыз...`), { target: { value: label } });
  }
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Сақтау және дайын/ })); });
  expect(toast.success).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("Quiz title")).toBeInTheDocument();
  expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({ questions: [expect.objectContaining({ question_text: "Question" })] }), "owner@example.com");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Сақтау және дайын/ })); });
  expect(mockPush).toHaveBeenCalledWith("/quizzes/12");
  expect(toast.success).toHaveBeenCalledTimes(1);
});
