import { act, fireEvent, render, screen } from "@testing-library/react";
import QuizzesCatalogPage from "../page";
import { getQuizzes } from "@/lib/api/quizzes";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "owner@example.com" } } }) }));
jest.mock("@/components/DesktopNav", () => {
  const MockDesktopNav = () => <div data-testid="desktop-nav" />;
  MockDesktopNav.displayName = "MockDesktopNav";
  return MockDesktopNav;
});
jest.mock("@/components/MobileNav", () => {
  const MockMobileNav = () => <div data-testid="mobile-nav" />;
  MockMobileNav.displayName = "MockMobileNav";
  return MockMobileNav;
});
jest.mock("@/lib/api/quizzes", () => ({
  getQuizzes: jest.fn(),
  deleteQuiz: jest.fn(),
  updateQuiz: jest.fn(),
  forkQuiz: jest.fn(),
}));

const mockQuizzes = [
  {
    id: 101,
    title: "Бөлшектерді көбейту және бөлу",
    description: "Жай бөлшектерді көбейту бойынша есептер",
    is_public: true,
    question_count: 30,
    author_nickname: "Yera",
    can_manage: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  (getQuizzes as jest.Mock).mockResolvedValue({ data: mockQuizzes, error: null });
});

it("renders quizzes and opens quiz detail when clicking anywhere on the card", async () => {
  await act(async () => {
    render(<QuizzesCatalogPage />);
  });

  expect(screen.getByText("Бөлшектерді көбейту және бөлу")).toBeInTheDocument();

  // Find card role="button"
  const cards = screen.getAllByRole("button");
  const card = cards.find((el) => el.textContent?.includes("Бөлшектерді көбейту және бөлу"));
  expect(card).toBeDefined();

  // Click on the card title or whitespace
  fireEvent.click(card!);
  expect(mockPush).toHaveBeenCalledWith("/quizzes/101");
});

it("supports keyboard Enter to open quiz when focused on card", async () => {
  await act(async () => {
    render(<QuizzesCatalogPage />);
  });

  const cards = screen.getAllByRole("button");
  const card = cards.find((el) => el.textContent?.includes("Бөлшектерді көбейту және бөлу"));
  expect(card).toBeDefined();

  mockPush.mockClear();
  fireEvent.keyDown(card!, { key: "Enter" });
  expect(mockPush).toHaveBeenCalledWith("/quizzes/101");
});

it("does not trigger card router.push when edit link is clicked", async () => {
  await act(async () => {
    render(<QuizzesCatalogPage />);
  });

  mockPush.mockClear();
  const editLink = screen.getByTitle("Өңдеу");
  fireEvent.click(editLink);
  // mockPush should not be called with /quizzes/101 because edit link has its own href /quizzes/101/edit and e.stopPropagation()
  expect(mockPush).not.toHaveBeenCalledWith("/quizzes/101");
});
