import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as api from "@/lib/api";
import type { BankPlacementTask, BankTask, TrialTest } from "@/types";
import TrialTestsCatalog from "../TrialTestsCatalog";
import TrialTestWorkspace from "../TrialTestWorkspace";
import { TrialTestsProvider } from "../TrialTestsProvider";

jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "editor@example.com" } }, status: "authenticated" }) }));
jest.mock("@/lib/api", () => ({ apiPath: (path: string) => `/api/backend/${path}`,
  getAdminTrialTests: jest.fn(), getAdminTrialTestTasks: jest.fn(), getAdminBankTasks: jest.fn(),
  createTrialTest: jest.fn(), updateTrialTest: jest.fn(), deleteTrialTest: jest.fn(),
  upsertTrialTestSlot: jest.fn(), clearTrialTestSlot: jest.fn(),
}));
jest.mock("@/components/ui/MathRender", () => function MathRender({ latex }: { latex: string }) { return <span>{latex}</span>; });
jest.mock("@/components/ui/MathFieldInput", () => function MathFieldInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <textarea aria-label={placeholder} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />;
});
jest.mock("@/components/admin/StudentTaskPreview", () => function Preview() { return <p>Оқушы көрінісі</p>; });

const test = { id: 9, title: "Алгебра тесті", category: " Геометрия ", description: "Бақылау", sort_order: 0, expected_tasks_count: 3, task_count: 1 } as TrialTest;
const other = { ...test, id: 10, title: "Басқа тест", category: "all" };
const placement = { id: 21, bank_task_id: 7, sort_order: 0, text: "2+2", answer: "4", question_type: "input", text_scale: "md" } as BankPlacementTask;
const bank = [{ id: 7, text: "2+2", difficulty: "A", question_type: "input" }, { id: 8, text: "3+3", difficulty: "B", question_type: "input" }, { id: 11, text: "4+4", difficulty: "C", question_type: "input" }] as BankTask[];
const mocked = jest.mocked(api);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getAdminTrialTests.mockResolvedValue({ data: [test, other], error: null });
  mocked.getAdminTrialTestTasks.mockResolvedValue({ data: [placement], error: null });
  mocked.getAdminBankTasks.mockResolvedValue({ data: { items: bank, total: bank.length, has_more: false, limit: 20, offset: 0 }, error: null });
  mocked.createTrialTest.mockResolvedValue({ data: test, error: null });
  mocked.updateTrialTest.mockResolvedValue({ data: test, error: null });
  mocked.upsertTrialTestSlot.mockResolvedValue({ data: placement, error: null });
  mocked.clearTrialTestSlot.mockResolvedValue({ data: { success: true, cleared: 1 }, error: null });
});

const catalog = (category?: string) => <TrialTestsProvider><TrialTestsCatalog category={category} /></TrialTestsProvider>;
const workspace = (id = 9) => <TrialTestsProvider><TrialTestWorkspace key={id} testId={id} /></TrialTestsProvider>;

it("lists encoded folder links without showing forms or tasks", async () => {
  await act(async () => { render(catalog()); });
  expect(screen.getByRole("link", { name: /Геометрия 1 тест/ })).toHaveAttribute("href", `/admin/trial-tests/folders/${encodeURIComponent("Геометрия")}`);
  expect(screen.getByRole("link", { name: /Жалпы 0 тест/ })).toBeInTheDocument();
  expect(screen.queryByText("2+2")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Атауы" })).not.toBeInTheDocument();
});

it("shows only a folder's tests and preserves a real folder called all", async () => {
  await act(async () => { render(catalog("all")); });
  expect(screen.getByRole("link", { name: /Басқа тест/ })).toHaveAttribute("href", "/admin/trial-tests/10");
  expect(screen.queryByRole("link", { name: /Алгебра тесті/ })).not.toBeInTheDocument();
  expect(mocked.getAdminTrialTestTasks).not.toHaveBeenCalled();
});

it("keeps new test data after a failed save and passes its folder and task count to the API", async () => {
  mocked.createTrialTest.mockResolvedValueOnce({ data: null, error: "Сақтау қатесі" }).mockResolvedValueOnce({ data: test, error: null });
  await act(async () => { render(catalog("Геометрия")); });
  fireEvent.click(screen.getByRole("button", { name: "Тест қосу" }));
  const dialog = screen.getByRole("dialog", { name: "Жаңа тест" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Атауы" }), { target: { value: "Жаңа тест" } });
  fireEvent.change(within(dialog).getByRole("spinbutton", { name: "Тапсырма саны" }), { target: { value: "12" } });
  await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Сақтау қатесі");
  expect(within(dialog).getByRole("textbox", { name: "Атауы" })).toHaveValue("Жаңа тест");
  expect(mocked.createTrialTest).toHaveBeenCalledWith("Жаңа тест", "", 0, 12, "editor@example.com", "Геометрия");
  await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("edits metadata in a dialog without opening or replacing a test's tasks", async () => {
  await act(async () => { render(catalog("Геометрия")); });
  fireEvent.click(screen.getByRole("button", { name: "Алгебра тесті өңдеу" }));
  const dialog = screen.getByRole("dialog", { name: "Тестті өңдеу" });
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Папка" }), { target: { value: "Жаңа папка" } });
  await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
  expect(mocked.updateTrialTest).toHaveBeenCalledWith(9, test.title, test.description, 0, 3, "editor@example.com", "Жаңа папка");
  expect(mocked.getAdminTrialTestTasks).not.toHaveBeenCalled();
});

it("opens tasks directly on their own page, and keeps preview answers between task navigation", async () => {
  await act(async () => { render(workspace()); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Атауы" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1-тапсырманы ашу" }));
  fireEvent.change(screen.getByPlaceholderText("Жауапты енгізіңіз"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "2-тапсырма, бос" }));
  expect(screen.getByRole("heading", { name: "Бос ұяшық" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "1-тапсырма" }));
  expect(screen.getByPlaceholderText("Жауапты енгізіңіз")).toHaveValue("4");
});

it("keeps the inline editor and task text open when saving fails", async () => {
  mocked.upsertTrialTestSlot.mockResolvedValue({ data: null, error: "Тапсырманы сақтау қатесі" });
  await act(async () => { render(workspace()); });
  fireEvent.click(screen.getByRole("button", { name: "Жаңа тапсырма" }));
  const dialog = screen.getByRole("dialog", { name: "Жаңа тапсырма · 2-ұяшық" });
  fireEvent.change(within(dialog).getByPlaceholderText("Тапсырма мәтіні"), { target: { value: "Жаңа есеп" } });
  await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Тапсырманы сақтау қатесі");
  expect(within(dialog).getByPlaceholderText("Тапсырма мәтіні")).toHaveValue("Жаңа есеп");
  expect(mocked.upsertTrialTestSlot).toHaveBeenCalledWith(9, 2, expect.objectContaining({ email: "editor@example.com", text: "Жаңа есеп" }));
});

it("adds into the selected empty slot when previewing a specific task position", async () => {
  await act(async () => { render(workspace()); });
  fireEvent.click(screen.getByRole("button", { name: "Алдын ала көру" }));
  fireEvent.click(screen.getByRole("button", { name: "3-тапсырма, бос" }));
  fireEvent.click(screen.getByRole("button", { name: "Жаңа тапсырма" }));
  expect(screen.getByRole("dialog", { name: "Жаңа тапсырма · 3-ұяшық" })).toBeInTheDocument();
});

it("selects bank exercises without overwriting filled slots, and blocks duplicates", async () => {
  await act(async () => { render(workspace()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Банктен қосу" })); });
  const dialog = screen.getByRole("dialog", { name: "Банктен таңдау · 2-ұяшық" });
  expect(within(dialog).getByRole("checkbox", { name: "Банк #7 таңдау" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #8 таңдау" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #11 таңдау" }));
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Таңдалғанды қосу (2)" })); });
  expect(mocked.upsertTrialTestSlot.mock.calls.map(([, slot]) => slot)).toEqual([2, 3]);
  expect(mocked.upsertTrialTestSlot.mock.calls.map(([, , payload]) => payload.bank_task_id).sort((a, b) => a - b)).toEqual([8, 11]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps a partial bank assignment visible after a later assignment fails", async () => {
  const added = { ...placement, id: 22, bank_task_id: 11, sort_order: 1, text: "4+4" };
  mocked.upsertTrialTestSlot.mockResolvedValueOnce({ data: added, error: null }).mockResolvedValueOnce({ data: null, error: "Екінші есеп сақталмады" });
  await act(async () => { render(workspace()); });
  mocked.getAdminTrialTestTasks.mockResolvedValue({ data: [placement, added], error: null });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Банктен қосу" })); });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #8 таңдау" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #11 таңдау" }));
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Таңдалғанды қосу (2)" })); });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Екінші есеп сақталмады");
  expect(within(dialog).getByRole("checkbox", { name: "Банк #11 таңдау" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Терезені жабу" }));
  expect(screen.getByRole("button", { name: "2-тапсырманы ашу" })).toBeInTheDocument();
});

it("shows cached tasks on a return visit while revalidating and isolates a different test", async () => {
  const page = (id: number) => <TrialTestsProvider><TrialTestWorkspace key={id} testId={id} /></TrialTestsProvider>;
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(page(9)); });
  mocked.getAdminTrialTestTasks.mockImplementation(() => new Promise(() => {}));
  await act(async () => { view.rerender(page(10)); });
  expect(screen.queryByText("2+2")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName("Тапсырмалар жүктелуде...");
  await act(async () => { view.rerender(page(9)); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("shows a missing-test message for a stale deep link", async () => {
  await act(async () => { render(workspace(999)); });
  expect(screen.getByRole("heading", { name: "Тест табылмады" })).toBeInTheDocument();
  expect(mocked.getAdminTrialTestTasks).not.toHaveBeenCalled();
});

it("does not treat a failed task request as empty slots that can be overwritten", async () => {
  mocked.getAdminTrialTestTasks.mockResolvedValue({ data: null, error: "Сервер қатесі" });
  await act(async () => { render(workspace()); });
  expect(screen.getByRole("alert")).toHaveTextContent("Сервер қатесі");
  expect(screen.getByRole("button", { name: "Жаңа тапсырма" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Банктен қосу" })).toBeDisabled();
  expect(screen.queryByText("Тапсырмалар әлі жоқ")).not.toBeInTheDocument();
  mocked.getAdminTrialTestTasks.mockResolvedValue({ data: [placement], error: null });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Қайта жүктеу" })); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Жаңа тапсырма" })).toBeEnabled();
});

it("does not write a batch when there are not enough free slots", async () => {
  mocked.getAdminTrialTests.mockResolvedValue({ data: [{ ...test, expected_tasks_count: 2 }], error: null });
  await act(async () => { render(workspace()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Банктен қосу" })); });
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #8 таңдау" }));
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Банк #11 таңдау" }));
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Таңдалғанды қосу (2)" })); });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("бос ұяшық жеткіліксіз");
  expect(mocked.upsertTrialTestSlot).not.toHaveBeenCalled();
});

it("loads later bank pages and ignores a response from a previous search", async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof api.getAdminBankTasks>>) => void;
  mocked.getAdminBankTasks.mockResolvedValue({ data: { items: Array.from({ length: 20 }, (_, i) => ({ ...bank[0], id: 100 + i })), total: 21, has_more: true, limit: 20, offset: 0 }, error: null });
  await act(async () => { render(workspace()); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Банктен қосу" })); });
  const dialog = screen.getByRole("dialog");
  mocked.getAdminBankTasks.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  await act(async () => { fireEvent.change(within(dialog).getByRole("searchbox", { name: "Іздеу" }), { target: { value: "old" } }); });
  mocked.getAdminBankTasks.mockResolvedValue({ data: { items: [bank[1]], total: 21, has_more: true, limit: 20, offset: 0 }, error: null });
  await act(async () => { fireEvent.change(within(dialog).getByRole("searchbox", { name: "Іздеу" }), { target: { value: "new" } }); });
  await act(async () => { resolveOld({ data: { items: [bank[2]], total: 1, has_more: false, limit: 20, offset: 0 }, error: null }); });
  expect(within(dialog).getByRole("checkbox", { name: "Банк #8 таңдау" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("checkbox", { name: "Банк #11 таңдау" })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Келесі" })); });
  expect(mocked.getAdminBankTasks).toHaveBeenLastCalledWith("editor@example.com", expect.objectContaining({ offset: 20, search: "new" }));
});

it("clears only the requested slot and resets its preview answer", async () => {
  await act(async () => { render(workspace()); });
  fireEvent.click(screen.getByRole("button", { name: "1-тапсырманы ашу" }));
  fireEvent.change(screen.getByPlaceholderText("Жауапты енгізіңіз"), { target: { value: "4" } });
  mocked.getAdminTrialTestTasks.mockResolvedValue({ data: [], error: null });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Тазалау" })); });
  expect(mocked.clearTrialTestSlot).toHaveBeenCalledWith(9, 1, "editor@example.com");
  expect(screen.getByRole("heading", { name: "Бос ұяшық" })).toBeInTheDocument();
  expect(screen.queryByPlaceholderText("Жауапты енгізіңіз")).not.toBeInTheDocument();
});
