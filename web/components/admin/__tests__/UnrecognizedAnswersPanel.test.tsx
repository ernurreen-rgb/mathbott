import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import UnrecognizedAnswersPanel from "../UnrecognizedAnswersPanel";

const mockGetAnswers = jest.fn();
const mockAcceptAnswer = jest.fn();

jest.mock("@/lib/api", () => ({
  getAdminBankUnrecognizedAnswers: (...args: unknown[]) => mockGetAnswers(...args),
  acceptAdminBankUnrecognizedAnswer: (...args: unknown[]) => mockAcceptAnswer(...args),
}));

jest.mock("@/components/ui/MathRender", () => ({
  __esModule: true,
  default: ({ latex }: { latex?: string }) => <span>{latex}</span>,
}));

const item = {
  bank_task_id: 12,
  task_text: "x+1=3",
  student_answer: "x=3",
  primary_answer: "x=2",
  accepted_answers: [],
  question_type: "input" as const,
  current_version: 4,
  occurrences: 7,
  students_count: 3,
  last_seen_at: "2026-09-05 12:00:00",
  sources: ["lesson", "trial_test"] as const,
};

describe("UnrecognizedAnswersPanel", () => {
  beforeEach(() => {
    mockGetAnswers.mockReset();
    mockAcceptAnswer.mockReset();
    mockGetAnswers.mockResolvedValue({
      data: {
        items: [item],
        total: 1,
        limit: 100,
        min_count: 2,
        sample_limit_per_source: 5000,
      },
      error: null,
    });
  });

  it("shows frequency, sources and the student answer", async () => {
    render(<UnrecognizedAnswersPanel email="admin@example.com" />);

    expect(await screen.findByText("x=3")).toBeInTheDocument();
    expect(screen.getByText("7 рет")).toBeInTheDocument();
    expect(screen.getByText("3 оқушы")).toBeInTheDocument();
    expect(screen.getByText("Сабақ")).toBeInTheDocument();
    expect(screen.getByText("Пробный тест")).toBeInTheDocument();
    expect(mockGetAnswers).toHaveBeenCalledWith("admin@example.com", { minCount: 2, limit: 100 });
  });

  it("adds an answer to accepted aliases and removes it from the queue", async () => {
    mockAcceptAnswer.mockResolvedValue({
      data: {
        added: true,
        task: {
          id: 12,
          text: "x+1=3",
          answer: "x=2",
          accepted_answers: ["x=3"],
          question_type: "input",
          answer_mode: "written",
          difficulty: "A",
          topics: [],
          created_at: "",
          updated_at: "",
          current_version: 5,
        },
      },
      error: null,
    });
    render(<UnrecognizedAnswersPanel email="admin@example.com" />);

    fireEvent.click(await screen.findByRole("button", { name: "Дұрыс деп қабылдау" }));

    await waitFor(() => {
      expect(mockAcceptAnswer).toHaveBeenCalledWith(12, "x=3", "admin@example.com", 4);
    });
    expect(await screen.findByRole("status")).toHaveTextContent("x=3");
    expect(screen.queryByRole("button", { name: "Дұрыс деп қабылдау" })).not.toBeInTheDocument();
  });
});
