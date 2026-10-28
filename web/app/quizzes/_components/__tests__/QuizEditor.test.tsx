import { fireEvent, render, screen, within } from "@testing-library/react";
import QuizEditor from "../QuizEditor";
import type { QuizQuestion } from "@/types/quiz";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "owner@example.com" } } }) }));
jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: ({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel?: string }) => (
    <input aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const question = (id: number, question_text: string): QuizQuestion => ({
  id, quiz_id: 42, question_text, question_type: "input", options: [],
  correct_answer: "1", time_limit_seconds: 30, points: 1000, sort_order: id,
});

beforeEach(() => { localStorage.clear(); });

it("renders fractions and mixed text as math in the question list, including after reordering and copying", () => {
  const formula = String.raw`\frac{1}{2}\times\frac{3}{4}\times\frac{5}{6}= ?`;
  const mixed = String.raw`Есептеңіз: \frac{2}{3}\times 3 = ?`;
  render(<QuizEditor initialQuestions={[question(1, formula), question(2, mixed)]} />);
  const sidebar = screen.getByRole("complementary");
  const firstPreview = within(sidebar).getByLabelText("Сұрақ 1 мәтіні");
  const secondPreview = within(sidebar).getByLabelText("Сұрақ 2 мәтіні");
  // Use the real renderer: the list must contain math elements, not a raw LaTeX text node.
  expect(firstPreview.querySelector("math-span")).not.toBeNull();
  expect(firstPreview.querySelector("math-span")?.textContent).toContain(String.raw`\frac{1}{2}`);
  expect(secondPreview).toHaveTextContent("Есептеңіз:");
  expect(secondPreview.querySelector("math-span")).not.toBeNull();

  fireEvent.click(within(sidebar).getAllByTitle("Төмен жылжыту")[0]);
  expect(within(sidebar).getByLabelText("Сұрақ 1 мәтіні")).toHaveTextContent("Есептеңіз:");
  fireEvent.click(within(sidebar).getAllByTitle("Көшірмесін жасау")[0]);
  expect(within(sidebar).getByLabelText("Сұрақ 2 мәтіні").querySelector("math-span")).not.toBeNull();
  expect(screen.getByLabelText("Сұрақ мәтіні")).toHaveValue(mixed);
  fireEvent.click(within(sidebar).getAllByTitle("Өшіру")[1]);
  expect(within(sidebar).getAllByTitle("Көшірмесін жасау")).toHaveLength(2);
});

it("keeps the empty-question label and renders a newly entered formula in the list", () => {
  render(<QuizEditor />);
  const sidebar = screen.getByRole("complementary");
  expect(within(sidebar).getByText("Жаңа сұрақ...")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Сұрақ мәтіні"), { target: { value: String.raw`\frac{2}{7}\times 3 = ?` } });
  expect(within(sidebar).queryByText("Жаңа сұрақ...")).not.toBeInTheDocument();
  expect(within(sidebar).getByLabelText("Сұрақ 1 мәтіні").querySelector("math-span")).not.toBeNull();
});
