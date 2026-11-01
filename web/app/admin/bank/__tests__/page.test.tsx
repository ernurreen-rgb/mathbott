import { act, fireEvent, render, screen } from "@testing-library/react";
import BankPage from "../page";
import { getAdminBankTask, getAdminBankTasks, updateAdminBankTask } from "@/lib/api";
import type { BankTask } from "@/types";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "editor@example.com" } }, status: "authenticated" }),
}));
jest.mock("@/lib/use-admin-page-access", () => ({ useAdminPageAccess: () => ({ loading: false }) }));
jest.mock("@/components/DesktopNav", () => () => null);
jest.mock("@/components/MobileNav", () => () => null);
jest.mock("@/components/admin/StudentTaskPreview", () => () => null);
jest.mock("@/components/ui/MathRender", () => ({
  __esModule: true,
  default: ({ latex }: { latex: string }) => <span>{latex}</span>,
}));
jest.mock("@/components/ui/MathFieldInput", () => ({
  __esModule: true,
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  getAdminBankTasks: jest.fn(),
  getAdminBankTask: jest.fn(),
  updateAdminBankTask: jest.fn(),
}));

const initialTask: BankTask = {
  id: 9, text: "Original task", answer: "4", question_type: "input",
  difficulty: "B", topics: [], current_version: 1,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
};
const latestTask: BankTask = {
  ...initialTask, text: "Another editor's task", answer: "B", question_type: "mcq",
  current_version: 2, difficulty: "C", topics: ["Updated topic"], text_scale: "lg",
  options: "ABCD".split("").map((label) => ({ label, text: `Updated ${label}` })),
};
const versionConflict = {
  data: null, error: "Version conflict",
  conflict: { code: "VERSION_CONFLICT", message: "Version conflict", current_version: 2 },
};

beforeEach(() => {
  jest.resetAllMocks();
  (getAdminBankTasks as jest.Mock).mockResolvedValue({ data: { items: [initialTask], total: 1 }, error: null });
  (updateAdminBankTask as jest.Mock).mockResolvedValue(versionConflict);
  (getAdminBankTask as jest.Mock).mockResolvedValue({ data: latestTask, error: null });
});

async function openEditor() {
  await act(async () => { render(<BankPage />); });
  fireEvent.click(screen.getAllByRole("button", { name: "Өңдеу" })[0]);
  fireEvent.change(screen.getByDisplayValue("Original task"), { target: { value: "My unsaved draft" } });
}

async function save() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Сақтау" })); });
}

it("keeps the stale version and draft, and blocks repeat submissions after a conflict", async () => {
  await openEditor();
  await save();

  expect(screen.getByDisplayValue("My unsaved draft")).toBeInTheDocument();
  expect(screen.getByText("Нұсқа: v1")).toBeInTheDocument();
  const saveButton = screen.getByRole("button", { name: "Сақтау" });
  expect(saveButton).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("басқа редактор");
  await act(async () => {
    fireEvent.submit(saveButton.closest("form")!);
  });
  expect(updateAdminBankTask).toHaveBeenCalledTimes(1);
  expect(getAdminBankTask).not.toHaveBeenCalled();
  expect((updateAdminBankTask as jest.Mock).mock.calls[0][1].get("expected_current_version")).toBe("1");
});

it("reloads the entire latest task before allowing a save with its version", async () => {
  (updateAdminBankTask as jest.Mock)
    .mockResolvedValueOnce(versionConflict)
    .mockResolvedValueOnce({ data: { ...latestTask, current_version: 3 }, error: null, conflict: null });
  await openEditor();
  await save();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Жаңа нұсқаны жүктеу" }));
  });

  expect(getAdminBankTask).toHaveBeenCalledWith(9, "editor@example.com");
  expect(screen.getByDisplayValue(latestTask.text)).toBeInTheDocument();
  expect(screen.getByDisplayValue("Updated B")).toBeInTheDocument();
  expect(screen.getByText("Нұсқа: v2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await save();

  expect(updateAdminBankTask).toHaveBeenCalledTimes(2);
  const payload = (updateAdminBankTask as jest.Mock).mock.calls[1][1] as FormData;
  expect(payload.get("expected_current_version")).toBe("2");
  expect(payload.get("text")).toBe(latestTask.text);
  expect(payload.get("answer")).toBe("B");
  expect(payload.get("difficulty")).toBe("C");
  expect(payload.get("text_scale")).toBe("lg");
  expect(JSON.parse(payload.get("topics") as string)).toEqual(latestTask.topics);
  expect(JSON.parse(payload.get("options") as string)).toEqual(latestTask.options);
});

it.each([
  { name: "request failure", response: { data: null, error: "Reload unavailable" } },
  { name: "missing task", response: { data: null, error: null } },
  { name: "missing version", response: { data: { ...latestTask, current_version: undefined }, error: null } },
  { name: "wrong task", response: { data: { ...latestTask, id: 10 }, error: null } },
  { name: "deleted task", response: { data: { ...latestTask, deleted_at: "2026-11-01" }, error: null } },
])("keeps the draft blocked after a reload returns $name", async ({ response }) => {
  (getAdminBankTask as jest.Mock).mockResolvedValueOnce(response);
  await openEditor();
  await save();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Жаңа нұсқаны жүктеу" }));
  });

  expect(screen.getByDisplayValue("My unsaved draft")).toBeInTheDocument();
  expect(screen.getByText("Нұсқа: v1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeDisabled();
  expect(updateAdminBankTask).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Жаңа нұсқаны жүктеу" })).toBeEnabled();
});

it("ignores a late reload after the user switches to another task", async () => {
  const otherTask = { ...initialTask, id: 10, text: "Other task", current_version: 4 };
  (getAdminBankTasks as jest.Mock).mockResolvedValue({ data: { items: [initialTask, otherTask], total: 2 }, error: null });
  let resolveReload!: (result: unknown) => void;
  (getAdminBankTask as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { resolveReload = resolve; }));
  await openEditor();
  await save();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Жаңа нұсқаны жүктеу" }));
  });
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeDisabled();
  fireEvent.click(screen.getAllByRole("button", { name: "Өңдеу" })[1]);
  await act(async () => { resolveReload({ data: latestTask, error: null }); });

  expect(screen.getByDisplayValue("Other task")).toBeInTheDocument();
  expect(screen.queryByDisplayValue(latestTask.text)).not.toBeInTheDocument();
  expect(screen.getByText("Нұсқа: v4")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeEnabled();
});

it("clears the conflict when canceling and starting a new task", async () => {
  await openEditor();
  await save();
  fireEvent.click(screen.getByRole("button", { name: "Бас тарту" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Тапсырма құру" }));

  expect(screen.getByRole("button", { name: "Құру" })).toBeEnabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("allows retrying a normal save failure with the original version", async () => {
  (updateAdminBankTask as jest.Mock)
    .mockResolvedValueOnce({ data: null, error: "Network unavailable", conflict: null })
    .mockResolvedValueOnce({ data: initialTask, error: null, conflict: null });
  await openEditor();
  await save();
  expect(screen.getByText("Network unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeEnabled();
  await save();
  expect(updateAdminBankTask).toHaveBeenCalledTimes(2);
  expect((updateAdminBankTask as jest.Mock).mock.calls[1][1].get("expected_current_version")).toBe("1");
});

it("closes duplicate confirmation if its save encounters a version conflict", async () => {
  (updateAdminBankTask as jest.Mock)
    .mockResolvedValueOnce({ data: null, error: "Similar tasks", conflict: { code: "SIMILAR_TASKS_FOUND", similar_tasks: [] } })
    .mockResolvedValueOnce(versionConflict);
  await openEditor();
  await save();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Соған қарамастан сақтау" }));
  });
  expect(screen.queryByRole("button", { name: "Соған қарамастан сақтау" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Сақтау" })).toBeDisabled();
});
