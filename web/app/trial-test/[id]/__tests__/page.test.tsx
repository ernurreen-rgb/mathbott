import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import TrialTestPage from "../page";
import TrialTestResultsPage from "../results/page";
import { getTrialTestDetails, getTrialTestDraft, getTrialTestResults, submitTrialTest } from "@/lib/api";
import type { TrialTestDetails, TrialTestResult } from "@/types";

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockSearch = "";
let mockTestId = "1";
let mockEmail: string | null = "student@example.com";
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: mockTestId }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: mockEmail ? { user: { email: mockEmail } } : null }),
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
  mockEmail = "student@example.com";
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

const twoTaskDetails: TrialTestDetails = {
  ...details,
  tasks: [...details.tasks, { id: 8, text: "3 + 3", question_type: "input", sort_order: 1 }],
};

it("keeps a single set of navigation actions and preserves answers between tasks", async () => {
  (getTrialTestDetails as jest.Mock).mockResolvedValue({ data: twoTaskDetails, error: null });
  await openTest();
  expect(screen.getAllByRole("button", { name: /Алдыңғы/ })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: /Келесі/ })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Тестті аяқтау" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: /Алдыңғы/ })).toBeDisabled();
  expect(within(screen.getByRole("article", { name: "Тапсырма 1" })).getByText("2 + 2")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "4" } });
  expect(screen.getByRole("progressbar", { name: "Тест барысы" })).toHaveAttribute("aria-valuenow", "50");
  fireEvent.click(screen.getByRole("button", { name: /Келесі/ }));
  expect(screen.getByRole("article", { name: "Тапсырма 2" })).toHaveTextContent("3 + 3");
  expect(screen.getByRole("button", { name: /Келесі/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Алдыңғы/ }));
  expect(screen.getByLabelText("Жауап")).toHaveValue("4");
});

it("opens task numbers on demand, indicates answered tasks and closes after choosing one", async () => {
  (getTrialTestDetails as jest.Mock).mockResolvedValue({ data: twoTaskDetails, error: null });
  await openTest();
  expect(screen.queryByRole("navigation", { name: "Тапсырма нөмірлері" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Сұрақтар" }));
  const navigator = screen.getByRole("navigation", { name: "Тапсырма нөмірлері" });
  expect(within(navigator).getByRole("button", { name: "Тапсырма 1, жауап берілді" })).toHaveAttribute("aria-current", "step");
  fireEvent.click(within(navigator).getByRole("button", { name: "Тапсырма 2" }));
  expect(screen.getByRole("article", { name: "Тапсырма 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сұрақтар" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("navigation", { name: "Тапсырма нөмірлері" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Сұрақтар" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Сұрақтар" })).toHaveAttribute("aria-expanded", "false");
});

it("keeps report and back actions available while finishing jumps to the first unanswered task", async () => {
  (getTrialTestDetails as jest.Mock).mockResolvedValue({ data: twoTaskDetails, error: null });
  await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Тестті аяқтау" }));
  expect(screen.getByRole("article", { name: "Тапсырма 2" })).toBeInTheDocument();
  expect(submitTrialTest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Шағым" }));
  expect(screen.getByRole("heading", { name: "Шағым жіберу" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Бас тарту" }));
  expect(screen.queryByRole("heading", { name: "Шағым жіберу" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Артқа" }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
});

it("flushes the latest answer and task position on SPA unmount inside debounce", async () => {
  (getTrialTestDetails as jest.Mock).mockResolvedValue({ data: twoTaskDetails, error: null });
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Last unsaved answer" } });
  fireEvent.click(screen.getByRole("button", { name: /Келесі/ }));
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(2000); });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch).toHaveBeenCalledWith("/api/backend/trial-tests/1/draft", expect.objectContaining({
    method: "PUT", keepalive: true,
    body: JSON.stringify({ email: "student@example.com", answers: { 7: "Last unsaved answer" }, current_task_index: 1 }),
  }));
});

it("does not save an unchanged restored draft on unmount", async () => {
  (getTrialTestDraft as jest.Mock).mockResolvedValue({ data: { answers: { 7: "Restored" }, current_task_index: 0 }, error: null });
  const view = await openTest();
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("aborts an in-flight autosave and sends the newest answer with keepalive on unmount", async () => {
  (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Earlier answer" } });
  await act(async () => { jest.advanceTimersByTime(800); });
  const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Newest answer" } });
  view.unmount();

  expect(signal.aborted).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect((global.fetch as jest.Mock).mock.calls[1][1]).toMatchObject({ keepalive: true, signal: undefined });
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).answers).toEqual({ 7: "Newest answer" });
});

it("does not send the same pending keepalive twice on pagehide followed by unmount", async () => {
  (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Pending answer" } });
  act(() => { window.dispatchEvent(new Event("pagehide")); });
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("flushes a restored value when an older different autosave is still in flight", async () => {
  (getTrialTestDraft as jest.Mock).mockResolvedValue({ data: { answers: { 7: "Saved value" }, current_task_index: 0 }, error: null });
  (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Temporary edit" } });
  await act(async () => { jest.advanceTimersByTime(800); });
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Saved value" } });
  view.unmount();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).answers).toEqual({ 7: "Saved value" });
});

it("does not resend an acknowledged autosave on unmount", async () => {
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Already saved" } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("flushes the old test on route change and ignores its late acknowledgement", async () => {
  const nextDetails = { ...details, id: 2, tasks: [{ ...details.tasks[0], id: 8 }] };
  (getTrialTestDetails as jest.Mock).mockImplementation(async (id) => ({ data: id === 1 ? details : nextDetails, error: null }));
  let resolveOldSave!: (value: unknown) => void;
  (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveOldSave = resolve; }));
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "First test answer" } });
  mockTestId = "2";
  await act(async () => { view.rerender(<TrialTestPage />); });

  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("/api/backend/trial-tests/1/draft");
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).answers).toEqual({ 7: "First test answer" });
  expect(screen.getByLabelText("Жауап")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "Second test answer" } });
  await act(async () => { jest.advanceTimersByTime(800); });
  expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe("/api/backend/trial-tests/2/draft");
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).answers).toEqual({ 8: "Second test answer" });
  await act(async () => { resolveOldSave({ ok: true }); });
  view.unmount();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it.each(["second@example.com", null])("does not flush the previous account's answers when identity changes to %s", async (email) => {
  (getTrialTestDraft as jest.Mock).mockImplementation(async (_id, owner) => ({
    data: { answers: owner === "second@example.com" ? { 7: "Second account draft" } : {}, current_task_index: 0 }, error: null,
  }));
  const view = await openTest();
  fireEvent.change(screen.getByLabelText("Жауап"), { target: { value: "First account answer" } });
  mockEmail = email;
  await act(async () => { view.rerender(<TrialTestPage />); });
  if (email) expect(screen.getByLabelText("Жауап")).toHaveValue("Second account draft");
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(2000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("does not recreate a draft on unmount after successful submission", async () => {
  const view = await openTest();
  await finishTest();
  view.unmount();
  act(() => { window.dispatchEvent(new Event("pagehide")); jest.advanceTimersByTime(2000); });
  expect(global.fetch).not.toHaveBeenCalled();
});

it("flushes the answers on unmount after a failed submit with no saved attempt", async () => {
  (submitTrialTest as jest.Mock).mockResolvedValue({ data: null, error: "Submit failed" });
  const view = await openTest();
  await finishTest();
  expect(screen.getByText("Submit failed")).toBeInTheDocument();
  view.unmount();
  expect(global.fetch).toHaveBeenCalledWith("/api/backend/trial-tests/1/draft", expect.objectContaining({
    keepalive: true,
    body: JSON.stringify({ email: "student@example.com", answers: { 7: "4" }, current_task_index: 0 }),
  }));
});

it("does not write during Strict Mode hydration or an unchanged unmount", async () => {
  (getTrialTestDraft as jest.Mock).mockResolvedValue({ data: { answers: { 7: "Restored" }, current_task_index: 0 }, error: null });
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<StrictMode><TrialTestPage /></StrictMode>); });
  expect(screen.getByLabelText("Жауап")).toHaveValue("Restored");
  view.unmount();
  expect(global.fetch).not.toHaveBeenCalled();
});

it.each([true, false])("ignores an old submit response after moving to another test (success=%s)", async (success) => {
  const nextDetails = { ...details, id: 2, tasks: [{ ...details.tasks[0], id: 8 }] };
  (getTrialTestDetails as jest.Mock).mockImplementation(async (id) => ({ data: id === 1 ? details : nextDetails, error: null }));
  let resolveSubmit!: (value: unknown) => void;
  (submitTrialTest as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveSubmit = resolve; }));
  const view = await openTest();
  await finishTest();
  mockTestId = "2";
  await act(async () => { view.rerender(<TrialTestPage />); });
  expect(screen.getByRole("button", { name: "Тестті аяқтау" })).toBeEnabled();
  await act(async () => {
    resolveSubmit(success ? { data: { result_id: 102 }, error: null } : { data: null, error: "Old submit failed" });
  });
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(getTrialTestResults).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Жауап")).toHaveValue("");
  view.unmount();
  expect(global.fetch).not.toHaveBeenCalled();
});
