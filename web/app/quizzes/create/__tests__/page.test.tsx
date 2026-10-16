import { act, fireEvent, render, screen, within } from "@testing-library/react";
import CreateQuizPage from "../page";
import { createQuiz } from "@/lib/api/quizzes";
import toast from "react-hot-toast";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "owner@example.com" } } }) }));
jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: ({ value, onChange, placeholder, ariaLabel }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));
jest.mock("@/components/ui/MathRender", () => function MockMathRender({ latex }: { latex: string }) {
  return <span>{latex}</span>;
});
jest.mock("@/lib/api/quizzes", () => ({ createQuiz: jest.fn() }));
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  (createQuiz as jest.Mock).mockReset();
});

it("keeps the draft on an atomic-save failure and submits all questions together", async () => {
  (createQuiz as jest.Mock).mockResolvedValueOnce({ data: null, error: "Save failed" })
    .mockResolvedValueOnce({ data: { id: 12 }, error: null });
  render(<CreateQuizPage />);
  fireEvent.change(screen.getByPlaceholderText("Мысалы: 9-сынып Теңдеулер жарысы"), { target: { value: "Quiz title" } });
  fireEvent.change(screen.getByPlaceholderText(/Мысалы: Теңдеуді шешіңіз/), { target: { value: "Question" } });
  for (const label of ["A", "B", "C", "D"]) {
    fireEvent.change(screen.getByLabelText(`${label} жауап нұсқасы`), { target: { value: label } });
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

it.each(["mcq", "multi_select"])("saves formulas from %s question, option, and explanation fields", async (questionType) => {
  (createQuiz as jest.Mock).mockResolvedValue({ data: { id: 12 }, error: null });
  const question = "Есептеңіз: \\frac{1}{2}+\\sqrt{4}";
  const explanation = "Шешімі: \\frac{1}{2}+2=\\frac{5}{2}";
  const options = ["\\frac{5}{2}", "\\sqrt{4}", "x^{2}", "0"];
  render(<CreateQuizPage />);
  fireEvent.change(screen.getByPlaceholderText("Мысалы: 9-сынып Теңдеулер жарысы"), { target: { value: "Формулалар" } });
  fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: questionType } });
  fireEvent.change(screen.getByLabelText("Сұрақ мәтіні"), { target: { value: question } });
  fireEvent.change(screen.getByLabelText("Түсіндірме"), { target: { value: explanation } });
  ["A", "B", "C", "D"].forEach((label, index) => {
    fireEvent.change(screen.getByLabelText(`${label} жауап нұсқасы`), { target: { value: options[index] } });
  });

  // Previews receive the same LaTeX that will be stored.
  expect(within(screen.getByRole("main")).getByText(question, { selector: "span" })).toBeInTheDocument();
  expect(screen.getByText(explanation, { selector: "span" })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Сақтау және дайын/ })); });
  expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({
    questions: [expect.objectContaining({
      question_text: question,
      question_type: questionType,
      explanation,
      correct_answer: questionType === "multi_select" ? "A,B" : "A",
      options: options.map((text, index) => ({
        id: ["A", "B", "C", "D"][index],
        text,
        is_correct: questionType === "multi_select" ? index < 2 : index === 0,
      })),
    })],
  }), "owner@example.com");
});

it("keeps formulas when switching and duplicating questions and saves a math input answer", async () => {
  (createQuiz as jest.Mock).mockResolvedValue({ data: { id: 12 }, error: null });
  const question = "Есептеңіз: \\sqrt{4}";
  const answer = "\\frac12";
  render(<CreateQuizPage />);
  fireEvent.change(screen.getByPlaceholderText("Мысалы: 9-сынып Теңдеулер жарысы"), { target: { value: "Квиз" } });
  fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "input" } });
  fireEvent.change(screen.getByLabelText("Сұрақ мәтіні"), { target: { value: question } });
  fireEvent.change(screen.getByLabelText("Дұрыс математикалық жауап"), { target: { value: answer } });

  fireEvent.click(screen.getByRole("button", { name: "Сұрақ қосу" }));
  expect(screen.getByLabelText("Сұрақ мәтіні")).toHaveValue("");
  expect(screen.getByLabelText("A жауап нұсқасы")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Сұрақ мәтіні"), { target: { value: "Екінші сұрақ" } });
  fireEvent.click(screen.getByText(question, { selector: "span" }));
  expect(screen.getByLabelText("Сұрақ мәтіні")).toHaveValue(question);
  expect(screen.getByLabelText("Дұрыс математикалық жауап")).toHaveValue(answer);

  fireEvent.click(screen.getAllByTitle("Көшірмесін жасау")[0]);
  expect(screen.getByLabelText("Сұрақ мәтіні")).toHaveValue(question);
  expect(screen.getByLabelText("Дұрыс математикалық жауап")).toHaveValue(answer);
  fireEvent.change(screen.getByLabelText("Дұрыс математикалық жауап"), { target: { value: "2" } });
  // Remove the unfinished second question before saving both math questions.
  fireEvent.click(screen.getAllByTitle("Өшіру")[2]);

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Сақтау және дайын/ })); });
  expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({
    questions: [
      expect.objectContaining({ question_text: question, question_type: "input", correct_answer: "\\frac{1}{2}", sort_order: 1 }),
      expect.objectContaining({ question_text: question, question_type: "input", correct_answer: "2", sort_order: 2 }),
    ],
  }), "owner@example.com");
});
