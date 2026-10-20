import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import LessonPage from "../page";
import { getLessonDetails } from "@/lib/api";
import type { LessonDetails } from "@/types";

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockLessonId = "16";

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: mockLessonId }),
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "student@example.com" } } }),
}));

jest.mock("@/components/DesktopNav", () => function MockDesktopNav() { return null; });
jest.mock("@/components/MobileNav", () => function MockMobileNav() { return null; });
jest.mock("@/components/ui/MathRender", () => function MockMathRender({ latex }: { latex: string }) {
  return <span>{latex}</span>;
});
jest.mock("@/components/student/TaskStatement", () => function MockStatement({ task }: { task: { text: string } }) {
  return <div data-testid="task-statement">{task.text}</div>;
});
jest.mock("@/components/student/StudentMathAnswerInput", () => function MockInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      aria-label="Жауапты жазыңыз"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
});

jest.mock("@/lib/api", () => ({
  getLessonDetails: jest.fn(),
}));

const mockLessonData: LessonDetails = {
  id: 16,
  section_id: 1,
  module_id: 2,
  title: "Қосу мен азайту",
  sort_order: 1,
  progress: {
    completed: false,
    total_mini_lessons: 2,
    completed_mini_lessons: 0,
    progress: 0,
  },
  mini_lessons: [
    {
      id: 101,
      mini_index: 1,
      title: "1-бөлім",
      progress: {
        completed: false,
        total: 2,
        completed_count: 0,
        progress: 0,
      },
      tasks: [
        {
          id: 1001,
          text: "12 + 15",
          question_type: "input",
          sort_order: 1,
          status: "not_started",
        },
        {
          id: 1002,
          text: "49 + 54",
          question_type: "input",
          sort_order: 2,
          status: "not_started",
        },
      ],
    },
    {
      id: 102,
      mini_index: 2,
      title: "2-бөлім",
      progress: {
        completed: false,
        total: 1,
        completed_count: 0,
        progress: 0,
      },
      tasks: [
        {
          id: 1003,
          text: "20 + 30",
          question_type: "input",
          sort_order: 1,
          status: "not_started",
        },
      ],
    },
  ],
};

const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetAllMocks();
  mockLessonId = "16";
  (getLessonDetails as jest.Mock).mockResolvedValue({
    data: JSON.parse(JSON.stringify(mockLessonData)),
    error: null,
  });
  global.fetch = jest.fn();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe("LessonPage task navigation (Алдыңғы / Келесі)", () => {
  it("renders the lesson tasks with disabled 'Алдыңғы' on the first task", async () => {
    await act(async () => {
      render(<LessonPage />);
    });

    expect(screen.getByText("Есеп 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("12 + 15")).toBeInTheDocument();

    const prevButton = screen.getByRole("button", { name: /Алдыңғы/ });
    expect(prevButton).toBeInTheDocument();
    expect(prevButton).toBeDisabled();

    // "Келесі" is not shown when task is not completed
    expect(screen.queryByRole("button", { name: /Келесі/ })).not.toBeInTheDocument();
  });

  it("shows 'Келесі' after completing a task, and allows navigating back with 'Алдыңғы'", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ correct: true, correct_answer: "27" }),
    });

    await act(async () => {
      render(<LessonPage />);
    });

    // Enter answer and check
    const input = screen.getByLabelText("Жауапты жазыңыз");
    fireEvent.change(input, { target: { value: "27" } });

    const checkButton = screen.getByRole("button", { name: "Тексеру" });
    await act(async () => {
      fireEvent.click(checkButton);
    });

    // Now task is completed: both "Алдыңғы" and "Келесі" are present
    const prevBtn = screen.getByRole("button", { name: /Алдыңғы/ });
    expect(prevBtn).toBeInTheDocument();
    expect(prevBtn).toBeDisabled(); // still on task 1 of mini-lesson 1

    const nextBtn = screen.getByRole("button", { name: /Келесі/ });
    expect(nextBtn).toBeInTheDocument();

    // Navigate to next task
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    // Should now be on task 2: "49 + 54"
    expect(screen.getByText("Есеп 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("49 + 54")).toBeInTheDocument();

    // On task 2, "Алдыңғы" MUST be enabled!
    const prevBtnOnTask2 = screen.getByRole("button", { name: /Алдыңғы/ });
    expect(prevBtnOnTask2).toBeInTheDocument();
    expect(prevBtnOnTask2).not.toBeDisabled();

    // Click "Алдыңғы" to go back to task 1
    await act(async () => {
      fireEvent.click(prevBtnOnTask2);
    });

    // Should be back on task 1: "12 + 15"
    expect(screen.getByText("Есеп 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("12 + 15")).toBeInTheDocument();

    // On task 1, "Келесі" is available since task 1 was already completed
    const nextBtnOnTask1 = screen.getByRole("button", { name: /Келесі/ });
    expect(nextBtnOnTask1).toBeInTheDocument();

    // Click "Келесі" to return to task 2
    await act(async () => {
      fireEvent.click(nextBtnOnTask1);
    });

    expect(screen.getByText("Есеп 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("49 + 54")).toBeInTheDocument();
  });

  it("navigates to previous mini-lesson when clicking 'Алдыңғы' on the first task of subsequent mini-lessons", async () => {
    // Start lesson with mini-lesson 2 selected
    const dataWithMini2 = JSON.parse(JSON.stringify(mockLessonData));
    dataWithMini2.mini_lessons[0].tasks[0].status = "completed";
    dataWithMini2.mini_lessons[0].tasks[1].status = "completed";
    dataWithMini2.mini_lessons[0].progress.completed = true;

    (getLessonDetails as jest.Mock).mockResolvedValue({
      data: dataWithMini2,
      error: null,
    });

    await act(async () => {
      render(<LessonPage />);
    });

    // mini_lessons[1] is auto-selected because mini 0 is completed
    expect(screen.getByText("Есеп 1 / 1")).toBeInTheDocument();
    expect(screen.getByText("20 + 30")).toBeInTheDocument();

    // "Алдыңғы" should be enabled because previous mini-lesson exists!
    const prevBtn = screen.getByRole("button", { name: /Алдыңғы/ });
    expect(prevBtn).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();

    // Click "Алдыңғы" to go back to previous mini-lesson
    await act(async () => {
      fireEvent.click(prevBtn);
    });

    // Should navigate to mini-lesson 1's last task: "49 + 54"
    expect(screen.getByText("Есеп 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("49 + 54")).toBeInTheDocument();
  });

  it("allows returning to the previous task from the mini-lesson completed screen", async () => {
    const singleMiniLessonData: LessonDetails = {
      id: 16,
      section_id: 1,
      sort_order: 1,
      mini_lessons: [
        {
          id: 101,
          mini_index: 1,
          tasks: [
            { id: 1, text: "Task 1", question_type: "input", sort_order: 1, status: "completed" },
            { id: 2, text: "Task 2", question_type: "input", sort_order: 2, status: "completed" },
          ],
        },
      ],
    };

    (getLessonDetails as jest.Mock).mockResolvedValue({
      data: singleMiniLessonData,
      error: null,
    });

    await act(async () => {
      render(<LessonPage />);
    });

    // Task 1 is completed, click Келесі
    const nextBtn1 = screen.getByRole("button", { name: /Келесі/ });
    await act(async () => {
      fireEvent.click(nextBtn1);
    });

    // Task 2 is completed, click Келесі
    const nextBtn2 = screen.getByRole("button", { name: /Келесі/ });
    await act(async () => {
      fireEvent.click(nextBtn2);
    });

    // Now on lesson/mini-lesson completed screen
    expect(screen.getByText("Кіші сабақ аяқталды.")).toBeInTheDocument();
    expect(screen.getByText("Сабақ аяқталды!")).toBeInTheDocument();
    const prevTaskBtn = screen.getByRole("button", { name: /Алдыңғы есеп/ });
    expect(prevTaskBtn).toBeInTheDocument();

    // Click "Алдыңғы есеп" to return to task 2
    await act(async () => {
      fireEvent.click(prevTaskBtn);
    });

    expect(screen.getByText("Есеп 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Task 2")).toBeInTheDocument();
  });

  it("handles MCQ tasks correctly with 'Алдыңғы' and 'Келесі' after showing correct answer", async () => {
    const mcqLessonData: LessonDetails = {
      id: 16,
      section_id: 1,
      module_id: 2,
      sort_order: 1,
      mini_lessons: [
        {
          id: 201,
          mini_index: 1,
          tasks: [
            {
              id: 501,
              text: "1 + 1",
              question_type: "mcq",
              answer_mode: "choices",
              options: [
                { label: "A", text: "2" },
                { label: "B", text: "3" },
              ],
              sort_order: 1,
              status: "completed",
            },
            {
              id: 502,
              text: "49 + 54",
              question_type: "mcq",
              answer_mode: "choices",
              options: [
                { label: "A", text: "102" },
                { label: "B", text: "104" },
                { label: "C", text: "105" },
                { label: "D", text: "103" },
              ],
              sort_order: 2,
              status: "not_started",
            },
          ],
        },
      ],
    };

    (getLessonDetails as jest.Mock).mockResolvedValue({
      data: mcqLessonData,
      error: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ correct: true, correct_answer: "D" }),
    });

    await act(async () => {
      render(<LessonPage />);
    });

    // Task 501 was completed, so page picks first uncompleted (Task 502: "49 + 54")
    expect(screen.getByText("Есеп 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("49 + 54")).toBeInTheDocument();

    // "Алдыңғы" is enabled because task 1 exists
    const prevBtn = screen.getByRole("button", { name: /Алдыңғы/ });
    expect(prevBtn).toBeInTheDocument();
    expect(prevBtn).not.toBeDisabled();

    // "Келесі" is not shown yet
    expect(screen.queryByRole("button", { name: /Келесі/ })).not.toBeInTheDocument();

    // Choose D: 103 and check
    const optionD = screen.getByRole("button", { name: /103/ });
    fireEvent.click(optionD);

    const checkBtn = screen.getByRole("button", { name: "Тексеру" });
    await act(async () => {
      fireEvent.click(checkBtn);
    });

    // After correct answer is shown:
    // Both "Алдыңғы" and "Келесі" are present!
    expect(screen.getByRole("button", { name: /Алдыңғы/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Келесі/ })).toBeInTheDocument();

    // Click "Алдыңғы" to review Task 1
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Алдыңғы/ }));
    });

    expect(screen.getByText("Есеп 1 / 2")).toBeInTheDocument();
    expect(screen.getByText("1 + 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Алдыңғы/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Келесі/ })).toBeInTheDocument();
  });
});
