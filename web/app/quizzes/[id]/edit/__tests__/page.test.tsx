import { act, fireEvent, render, screen } from "@testing-library/react";
import EditQuizPage from "../page";
import { getQuiz, getQuizQuestions, updateQuiz, forkQuiz } from "@/lib/api/quizzes";
import toast from "react-hot-toast";

const mockPush = jest.fn();
let mockParams = { id: "42" };

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "author@example.com" } } }),
}));

jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    placeholder,
    ariaLabel,
  }: {
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

jest.mock("@/components/ui/MathRender", () =>
  function MockMathRender({ latex }: { latex: string }) {
    return <span>{latex}</span>;
  }
);

jest.mock("@/components/DesktopNav", () => function MockDesktopNav() { return <div data-testid="desktop-nav" />; });
jest.mock("@/components/MobileNav", () => function MockMobileNav() { return <div data-testid="mobile-nav" />; });

jest.mock("@/lib/api/quizzes", () => ({
  getQuiz: jest.fn(),
  getQuizQuestions: jest.fn(),
  updateQuiz: jest.fn(),
  forkQuiz: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

describe("EditQuizPage", () => {
  beforeEach(() => { localStorage.clear(); });
  beforeEach(() => {
    jest.resetAllMocks();
    mockParams = { id: "42" };
  });

  it.each([
    {
      name: "the questions request fails",
      result: { data: null, error: "Question API unavailable" },
      message: "Question API unavailable",
    },
    {
      name: "the questions payload is missing",
      result: { data: null, error: null },
      message: "Квиз сұрақтарын жүктеу мүмкін болмады",
    },
    {
      name: "the questions payload is not an array",
      result: { data: {}, error: null },
      message: "Квиз сұрақтарын жүктеу мүмкін болмады",
    },
  ])("prevents editing when $name", async ({ result, message }) => {
    (getQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Бастапқы квиз", is_public: true, can_manage: true },
      error: null,
    });
    (getQuizQuestions as jest.Mock).mockResolvedValue(result);

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: /Өзгерістерді сақтау/ })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Бастапқы квиз")).not.toBeInTheDocument();
    expect(updateQuiz).not.toHaveBeenCalled();
  });

  it("retries a failed load and preserves every loaded question when saving", async () => {
    (getQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Бастапқы квиз", is_public: true, can_manage: true },
      error: null,
    });
    let resolveQuestions!: (result: unknown) => void;
    const retryQuestions = new Promise((resolve) => { resolveQuestions = resolve; });
    (getQuizQuestions as jest.Mock)
      .mockResolvedValueOnce({ data: null, error: "Question API unavailable" })
      .mockReturnValueOnce(retryQuestions);
    (updateQuiz as jest.Mock).mockResolvedValue({ data: { id: 42 }, error: null });

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Қайта жүктеу" }));
    });

    expect(getQuiz).toHaveBeenCalledTimes(2);
    expect(getQuizQuestions).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Квиз деректері жүктелуде...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Өзгерістерді сақтау/ })).not.toBeInTheDocument();
    expect(updateQuiz).not.toHaveBeenCalled();

    await act(async () => {
      resolveQuestions({
        data: [
          { id: 101, quiz_id: 42, question_text: "2+2=?", question_type: "input", correct_answer: "4" },
          { id: 102, quiz_id: 42, question_text: "3+3=?", question_type: "input", correct_answer: "6" },
        ],
        error: null,
      });
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("2+2=?")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Өзгерістерді сақтау/ }));
    });

    expect(updateQuiz).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        questions: [
          expect.objectContaining({ question_text: "2+2=?", correct_answer: "4" }),
          expect.objectContaining({ question_text: "3+3=?", correct_answer: "6" }),
        ],
      }),
      "author@example.com"
    );
  });

  it("opens an existing quiz whose questions were successfully loaded as an empty list", async () => {
    (getQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Бос квиз", is_public: true, can_manage: true },
      error: null,
    });
    (getQuizQuestions as jest.Mock).mockResolvedValue({ data: [], error: null });

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Бос квиз")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Өзгерістерді сақтау/ })).toBeInTheDocument();
  });

  it("loads existing quiz and questions, and saves updates atomically", async () => {
    (getQuiz as jest.Mock).mockResolvedValue({
      data: {
        id: 42,
        title: "Бастапқы квиз",
        description: "Сипаттама",
        is_public: true,
        can_manage: true,
      },
      error: null,
    });

    (getQuizQuestions as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 101,
          quiz_id: 42,
          question_text: "2+2=?",
          question_type: "mcq",
          options: [
            { id: "A", text: "4", is_correct: true },
            { id: "B", text: "5", is_correct: false },
            { id: "C", text: "6", is_correct: false },
            { id: "D", text: "7", is_correct: false },
          ],
          correct_answer: "A",
          time_limit_seconds: 30,
          points: 1000,
          explanation: "2 қосу 2 тең 4",
        },
      ],
      error: null,
    });

    (updateQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Жаңартылған квиз" },
      error: null,
    });

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });

    expect(screen.getByDisplayValue("Бастапқы квиз")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2+2=?")).toBeInTheDocument();

    // Edit title
    fireEvent.change(screen.getByDisplayValue("Бастапқы квиз"), {
      target: { value: "Жаңартылған квиз" },
    });

    // Save
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Өзгерістерді сақтау/ }));
    });

    expect(updateQuiz).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        title: "Жаңартылған квиз",
        questions: expect.arrayContaining([
          expect.objectContaining({
            question_text: "2+2=?",
            correct_answer: "A",
          }),
        ]),
      }),
      "author@example.com"
    );

    expect(toast.success).toHaveBeenCalledWith("Квиз сәтті жаңартылды!");
    expect(mockPush).toHaveBeenCalledWith("/quizzes/42");
  });

  it("shows permission barrier and allows copying if quiz is public but owned by another user", async () => {
    mockParams = { id: "77" };

    (getQuiz as jest.Mock).mockResolvedValue({
      data: {
        id: 77,
        title: "Басқа мұғалімнің квизі",
        description: "",
        is_public: true,
        can_manage: false,
      },
      error: null,
    });

    (getQuizQuestions as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });

    (forkQuiz as jest.Mock).mockResolvedValue({
      data: { id: 88, title: "Басқа мұғалімнің квизі (Көшірме)", can_manage: true },
      error: null,
    });

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });

    expect(screen.getByText("Өңдеуге рұқсат жоқ")).toBeInTheDocument();
    const forkBtn = screen.getByRole("button", { name: /Өзіме көшіріп өңдеу/ });
    expect(forkBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(forkBtn);
    });

    expect(forkQuiz).toHaveBeenCalledWith(77, "author@example.com");
    expect(toast.success).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/quizzes/88/edit");
  });

  it("allows reordering questions via move buttons and saves updated sort_order", async () => {
    (getQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Тест квиз", is_public: true, can_manage: true },
      error: null,
    });
    (getQuizQuestions as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 1,
          quiz_id: 42,
          question_text: "Сұрақ 1",
          question_type: "mcq",
          options: [
            { id: "A", text: "1", is_correct: true },
            { id: "B", text: "2", is_correct: false },
            { id: "C", text: "3", is_correct: false },
            { id: "D", text: "4", is_correct: false },
          ],
          correct_answer: "A",
          time_limit_seconds: 30,
          points: 1000,
        },
        {
          id: 2,
          quiz_id: 42,
          question_text: "Сұрақ 2",
          question_type: "mcq",
          options: [
            { id: "A", text: "10", is_correct: true },
            { id: "B", text: "20", is_correct: false },
            { id: "C", text: "30", is_correct: false },
            { id: "D", text: "40", is_correct: false },
          ],
          correct_answer: "A",
          time_limit_seconds: 30,
          points: 1000,
        },
      ],
      error: null,
    });
    (updateQuiz as jest.Mock).mockResolvedValue({
      data: { id: 42, title: "Тест квиз" },
      error: null,
    });

    await act(async () => {
      render(<EditQuizPage params={Promise.resolve(mockParams)} />);
    });

    // Both questions are shown
    expect(screen.getAllByText("Сұрақ 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Сұрақ 2").length).toBeGreaterThanOrEqual(1);

    // Click "Төмен жылжыту" on the first question
    const downButtons = screen.getAllByTitle("Төмен жылжыту");
    expect(downButtons).toHaveLength(2);
    fireEvent.click(downButtons[0]);

    // Save
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Өзгерістерді сақтау/ }));
    });

    // Check that question 2 is now first and question 1 is second
    expect(updateQuiz).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        questions: [
          expect.objectContaining({ question_text: "Сұрақ 2", sort_order: 1 }),
          expect.objectContaining({ question_text: "Сұрақ 1", sort_order: 2 }),
        ],
      }),
      "author@example.com"
    );
  });
});
