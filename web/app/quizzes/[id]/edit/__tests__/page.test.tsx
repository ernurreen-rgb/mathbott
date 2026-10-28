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
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: "42" };
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
});
