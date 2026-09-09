import { fireEvent, render, screen } from "@testing-library/react";

import StudentTaskPreview from "../StudentTaskPreview";

const mockCheckAdminTaskAnswerPreview = jest.fn();

jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  checkAdminTaskAnswerPreview: (...args: unknown[]) => mockCheckAdminTaskAnswerPreview(...args),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <div data-testid="preview-image" data-src={String(props.src || "")} />,
}));

jest.mock("@/components/ui/MathRender", () => ({
  __esModule: true,
  default: ({ latex }: { latex?: string }) => <span>{latex}</span>,
}));

jest.mock("@/components/student/StudentChoiceAnswerFields", () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" data-testid="choice-fields" onClick={() => onChange("A")}>Choices</button>
  ),
}));

jest.mock("@/components/student/StudentWrittenAnswerFields", () => ({
  __esModule: true,
  default: ({ count = 1 }: { count?: number }) => <div data-testid="written-fields" data-count={count}>Written</div>,
}));

jest.mock("@/components/student/StudentMathAnswerInput", () => ({
  __esModule: true,
  default: () => <div data-testid="factor-field" />,
}));

describe("StudentTaskPreview", () => {
  const baseTask = {
    id: 10,
    text: "x+1 мәнін табыңыз",
    question_type: "mcq" as const,
    answer: "A",
    options: [
      { label: "A", text: "2" },
      { label: "B", text: "3" },
    ],
    sort_order: 0,
  };

  beforeEach(() => {
    mockCheckAdminTaskAnswerPreview.mockReset();
  });

  it("shows the same choice or written interaction selected by the admin", () => {
    const { rerender } = render(<StudentTaskPreview task={{ ...baseTask, answer_mode: "choices" }} />);

    expect(screen.getByTestId("choice-fields")).toBeInTheDocument();
    expect(screen.queryByTestId("written-fields")).not.toBeInTheDocument();

    rerender(<StudentTaskPreview task={{ ...baseTask, answer_mode: "written" }} />);

    expect(screen.getByTestId("written-fields")).toBeInTheDocument();
    expect(screen.queryByTestId("choice-fields")).not.toBeInTheDocument();
  });

  it("switches between phone and desktop widths", () => {
    render(<StudentTaskPreview task={baseTask} />);

    const viewport = screen.getByTestId("student-task-preview-viewport");
    expect(viewport).toHaveAttribute("data-viewport", "mobile");

    fireEvent.click(screen.getByRole("button", { name: "Компьютер" }));

    expect(viewport).toHaveAttribute("data-viewport", "desktop");
  });

  it("keeps the check button disabled until a preview answer is entered", () => {
    render(<StudentTaskPreview task={{ ...baseTask, answer_mode: "choices" }} />);

    const checkButton = screen.getByRole("button", { name: "Жауапты тексеру" });
    expect(checkButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("choice-fields"));

    expect(checkButton).toBeEnabled();
  });

  it("checks the preview answer without saving the task", async () => {
    mockCheckAdminTaskAnswerPreview.mockResolvedValue({
      data: { correct: true, question_type: "mcq", answer_mode: "choices" },
      error: null,
    });
    render(<StudentTaskPreview task={{ ...baseTask, answer_mode: "choices" }} />);

    fireEvent.click(screen.getByTestId("choice-fields"));
    fireEvent.click(screen.getByRole("button", { name: "Жауапты тексеру" }));

    expect(await screen.findByText("Жауап дұрыс")).toBeInTheDocument();
    expect(mockCheckAdminTaskAnswerPreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, answer: "A" }),
      "A"
    );
  });
});
