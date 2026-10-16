import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import TrialTestPage from "../page";
import TrialTestResultsPage from "../results/page";
import { getTrialTestDetails, getTrialTestDraft, getTrialTestResults, submitTrialTest } from "@/lib/api";
import type { TrialTestDetails, TrialTestResult } from "@/types";

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockSearch = "";
let mockTestId = "1";
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: mockTestId }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "student@example.com" } } }),
}));
jest.mock("next/dynamic", () => () => function MockDynamic() { return null; });
jest.mock("@/components/DesktopNav", () => function MockDesktopNav() { return null; });
jest.mock("@/components/MobileNav", () => function MockMobileNav() { return null; });
jest.mock("@/components/ui/MathRender", () => function MockMathRender({ latex }: { latex: string }) {
  return <span>{latex}</span>;
});
jest.mock("@/components/student/StudentMathAnswerInput", () => function MockAnswer({ value, onChange }: {
  value: string; onChange: (value: string) => void;
}) {
  return <input aria-label="Жауап" value={value} onChange={(event) => onChange(event.target.value)} />;
});
jest.mock("@/components/student/StudentWrittenAnswerFields", () => function MockWritten() { return null; });
jest.mock("@/components/student/StudentChoiceAnswerFields", () => function MockChoice() { return null; });
jest.mock("@/components/trial-test/TrialTestDetailedReview", () => function MockReview({ answers }: {
  answers: Record<number, { answer: string }>;
}) {
  return <div data-testid="review-answer">{Object.values(answers)[0]?.answer}</div>;
});
jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  getTrialTestDetails: jest.fn(), getTrialTestDraft: jest.fn(),
  getTrialTestResults: jest.fn(), submitTrialTest: jest.fn(),
}));

const details: TrialTestDetails = {
  id: 1, title: "Сынақ тесті", sort_order: 0, created_at: "2026-10-15T00:00:00Z",
  tasks: [{ id: 7, text: "2 + 2", question_type: "input", sort_order: 0 }],
};
const result: TrialTestResult = {
  id: 101, trial_test_id: 1, submit_mode: "solo", attempt_id: "older-attempt",
  score: 0, total: 1, percentage: 0,
  completed_at: "2026-10-15T00:00:00Z",
  answers: { 7: { answer: "3", correct: false, correct_answer: "4" } },
};
const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  mockSearch = "";
  mockTestId = "1";
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  (getTrialTestDetails as jest.Mock).mockResolvedValue({ data: details, error: null });
  (getTrialTestDraft as jest.Mock).mockResolvedValue({ data: { answers: {}, current_task_index: 0 }, error: null });
  (getTrialTestResults as jest.Mock).mockResolvedValue({ data: [result], error: null });
  (submitTrialTest as jest.Mock).mockResolvedValue({ data: { result_id: 102, score: 1, total: 1, percentage: 100 }, error: null });
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

async function openTest() {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<TrialTestPage />); });
  return view;
}

async function finishTest() {
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "4" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Тестті аяқтау" })); });
}

it("opens a new attempt even when previous results exist", async () => {
  await openTest();
  expect(screen.getByLabelText("Жауап")).toHaveValue("");
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await finishTest();
  expect(submitTrialTest).toHaveBeenCalledWith(1, expect.objectContaining({
    email: "student@example.com", answers: { 7: "4" }, attempt_id: expect.stringMatching(/^[a-f0-9]{32}$/),
  }));
  expect(mockRouter.replace).toHaveBeenCalledWith("/trial-test/1/results?attempt=102");
  act(() => { window.dispatchEvent(new Event("pagehide")); jest.advanceTimersByTime(1000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("waits for saved answers before enabling autosave", async () => {
  let resolveDraft!: (value: unknown) => void;
  (getTrialTestDraft as jest.Mock).mockReturnValue(new Promise((resolve) => { resolveDraft = resolve; }));
  await openTest();
  act(() => { window.dispatchEvent(new Event("pagehide")); jest.advanceTimersByTime(1000); });
  expect(global.fetch).not.toHaveBeenCalled();
  await act(async () => { resolveDraft({ data: { answers: { 7: "4" }, current_task_index: 0 }, error: null }); });
  expect(screen.getByLabelText("Жауап")).toHaveValue("4");
  act(() => { jest.advanceTimersByTime(1000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("does not replace a failed draft load with empty answers", async () => {
  (getTrialTestDraft as jest.Mock).mockResolvedValue({ data: null, error: "Connection failed" });
  await openTest();
  expect(screen.getByText(/Сақталған жауаптарды жүктеу мүмкін болмады/)).toBeInTheDocument();
  act(() => { window.dispatchEvent(new Event("pagehide")); jest.advanceTimersByTime(1000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("ignores an older draft response after navigating to a different test", async () => {
  let resolveOldDraft!: (value: unknown) => void;
  const oldDraft = new Promise((resolve) => { resolveOldDraft = resolve; });
  const nextDetails = { ...details, id: 2, title: "Екінші тест", tasks: [{ ...details.tasks[0], id: 8 }] };
  (getTrialTestDetails as jest.Mock).mockImplementation(async (id) => ({ data: id === 1 ? details : nextDetails, error: null }));
  (getTrialTestDraft as jest.Mock).mockImplementation((id) => id === 1 ? oldDraft
    : Promise.resolve({ data: { answers: { 8: "8" }, current_task_index: 0 }, error: null }));
  const view = await openTest();
  mockTestId = "2";
  await act(async () => { view.rerender(<TrialTestPage />); });
  expect(screen.getByLabelText("Жауап")).toHaveValue("8");
  await act(async () => { resolveOldDraft({ data: { answers: { 7: "4" }, current_task_index: 0 }, error: null }); });
  expect(screen.getByLabelText("Жауап")).toHaveValue("8");
  expect(screen.getByRole("heading", { name: "Екінші тест" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "9" } });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(global.fetch).toHaveBeenCalledWith("/api/backend/trial-tests/2/draft", expect.objectContaining({
    body: JSON.stringify({ email: "student@example.com", answers: { 8: "9" }, current_task_index: 0 }),
  }));
});

it("recovers a saved attempt after its response was lost", async () => {
  (submitTrialTest as jest.Mock).mockResolvedValue({ data: null, error: "Connection failed" });
  (getTrialTestResults as jest.Mock).mockImplementation(async () => ({
    data: [{ ...result, id: 102, attempt_id: (submitTrialTest as jest.Mock).mock.calls[0][1].attempt_id }], error: null,
  }));
  await openTest();
  await finishTest();
  expect(mockRouter.replace).toHaveBeenCalledWith("/trial-test/1/results?attempt=102");
});

it("does not mistake an older result for a failed retake", async () => {
  (submitTrialTest as jest.Mock).mockResolvedValue({ data: null, error: "Connection failed" });
  await openTest();
  await finishTest();
  expect(screen.getByText("Connection failed")).toBeInTheDocument();
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it("shows the newest attempt when submissions share a timestamp and lets students choose an older one", async () => {
  const newest = { ...result, id: 102, score: 1, percentage: 100, answers: { 7: { answer: "4", correct: true } } };
  (getTrialTestResults as jest.Mock).mockResolvedValue({ data: [result, newest], error: null });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<TrialTestResultsPage />); });
  expect(screen.getByTestId("review-answer")).toHaveTextContent("4");
  expect(screen.getByRole("link", { name: "Қайта өту" })).toHaveAttribute("href", "/trial-test/1");
  fireEvent.change(screen.getByRole("combobox", { name: "Тапсыру әрекеті" }), { target: { value: "101" } });
  expect(mockRouter.replace).toHaveBeenCalledWith("/trial-test/1/results?attempt=101");
  mockSearch = "attempt=101";
  view.rerender(<TrialTestResultsPage />);
  expect(screen.getByTestId("review-answer")).toHaveTextContent("3");
});
