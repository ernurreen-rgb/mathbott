import { act, fireEvent, render, screen, within } from "@testing-library/react";
import CmsWorkspace from "../CmsWorkspace";

let mockAuthenticated = true;
jest.mock("next-auth/react", () => ({ useSession: () => mockAuthenticated
  ? { data: { user: { email: "editor@example.com" } }, status: "authenticated" }
  : { data: null, status: "loading" } }));
jest.mock("@/lib/use-admin-page-access", () => ({ useAdminPageAccess: () => ({ loading: false }) }));
jest.mock("@/components/DesktopNav", () => () => null);
jest.mock("@/components/MobileNav", () => () => null);
jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/lib/api", () => ({ apiPath: (path: string) => `/api/backend/${path}` }));

const root = "/admin/cms/modules/1";
const section = `${root}/sections/2`;
const lesson = `${section}/lessons/3`;
const originalFetch = global.fetch;

beforeEach(() => {
  mockAuthenticated = true;
  global.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    if (options?.method === "POST") return { ok: false } as Response;
    const path = String(input).split("?")[0];
    const fixtures: Record<string, unknown> = {
      "/api/backend/admin/modules": [{ id: 1, name: "Алгебра", sort_order: 0 }],
      "/api/backend/admin/modules/1/sections": [{ id: 2, module_id: 1, name: "Теңдеулер", sort_order: 0 }],
      "/api/backend/admin/sections/2/lessons": [{ id: 3, section_id: 2, lesson_number: 1, title: "Сызықтық теңдеулер", sort_order: 0 }],
      "/api/backend/admin/lessons/3/mini-lessons": [{ id: 4, lesson_id: 3, mini_index: 1, title: "Қайталау", sort_order: 0 }],
      "/api/backend/admin/mini-lessons/4/tasks": [{ id: 11, text: "2+2", answer: "4", question_type: "input", sort_order: 0 }],
    };
    return { ok: true, json: async () => fixtures[path] ?? [] } as Response;
  }) as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; });

it("links modules to their own section pages", async () => {
  await act(async () => { render(<CmsWorkspace />); });
  expect(screen.getByRole("link", { name: /Алгебра/ })).toHaveAttribute("href", root);
  expect(screen.queryByRole("heading", { name: "Бөлімдер" })).not.toBeInTheDocument();
});

it("shows sections without embedding lessons on a module page", async () => {
  await act(async () => { render(<CmsWorkspace moduleId={1} />); });
  expect(screen.getByRole("heading", { name: "Бөлімдер" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Теңдеулер/ })).toHaveAttribute("href", section);
  expect(screen.queryByRole("heading", { name: "Сабақтар" })).not.toBeInTheDocument();
});

it("shows loading instead of an empty section list while its request is pending", async () => {
  const original = global.fetch;
  let resolveSections!: (value: unknown) => void;
  const pending = new Promise((resolve) => { resolveSections = resolve; });
  global.fetch = jest.fn((input: RequestInfo | URL, options?: RequestInit) => String(input).includes("/modules/1/sections")
    ? pending : original(input, options)) as typeof fetch;
  await act(async () => { render(<CmsWorkspace moduleId={1} />); });
  expect(screen.getByRole("status")).toHaveTextContent("Мазмұн жүктелуде...");
  expect(screen.queryByText("Бұл модульде бөлімдер әлі жоқ.")).not.toBeInTheDocument();
  await act(async () => { resolveSections({ ok: true, json: async () => [] }); });
  expect(screen.getByText("Бұл модульде бөлімдер әлі жоқ.")).toBeInTheDocument();
});

it("shows lessons and a parent breadcrumb on a section page", async () => {
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} />); });
  expect(screen.getByRole("heading", { name: "Сабақтар" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Сызықтық теңдеулер/ })).toHaveAttribute("href", lesson);
  expect(within(screen.getByRole("navigation", { name: "Мазмұн жолы" })).getByRole("link", { name: "Алгебра" })).toHaveAttribute("href", root);
  expect(screen.queryByRole("heading", { name: "Тапсырмалар" })).not.toBeInTheDocument();
});

it("opens a lesson's tasks directly with horizontal mini-lesson navigation", async () => {
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} />); });
  const tabs = screen.getByRole("navigation", { name: "Кіші сабақтар" });
  expect(within(tabs).getByRole("link", { name: "Қайталау" })).toHaveAttribute("href", `${lesson}/mini-lessons/4`);
  expect(within(tabs).getByRole("link", { name: "Қайталау" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Кіші сабақтар" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "← Сабақтар" })).toHaveAttribute("href", section);
});

it.each([undefined, 4])("selects the first mini-lesson by order while preserving an explicit URL selection (%s)", async (miniLessonId) => {
  const original = global.fetch;
  global.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const path = String(input).split("?")[0];
    if (path.endsWith("/lessons/3/mini-lessons")) return { ok: true, json: async () => [
      { id: 4, lesson_id: 3, mini_index: 2, title: "Қайталау", sort_order: 0 },
      { id: 8, lesson_id: 3, mini_index: 1, title: "Бастау", sort_order: 0 },
    ] } as Response;
    if (path.endsWith("/mini-lessons/8/tasks")) return { ok: true, json: async () => [
      { id: 12, text: "3+3", answer: "6", question_type: "input", sort_order: 0 },
    ] } as Response;
    return original(input, options);
  }) as typeof fetch;
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} miniLessonId={miniLessonId} />); });
  const tabs = screen.getByRole("navigation", { name: "Кіші сабақтар" });
  expect(within(tabs).getByRole("link", { name: miniLessonId ? "Қайталау" : "Бастау" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText(miniLessonId ? "2+2" : "3+3")).toBeInTheDocument();
  expect(screen.queryByText(miniLessonId ? "3+3" : "2+2")).not.toBeInTheDocument();
});

it("waits for mini-lessons before loading the default task list", async () => {
  const original = global.fetch;
  let resolveMinis!: (value: unknown) => void;
  const pending = new Promise((resolve) => { resolveMinis = resolve; });
  global.fetch = jest.fn((input: RequestInfo | URL, options?: RequestInit) => String(input).includes("/lessons/3/mini-lessons")
    ? pending : original(input, options)) as typeof fetch;
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} />); });
  expect(screen.getByRole("status")).toHaveTextContent("Мазмұн жүктелуде...");
  expect(screen.queryByText("Тапсырмалар әлі жоқ")).not.toBeInTheDocument();
  expect(jest.mocked(global.fetch).mock.calls.some(([input]) => String(input).includes("/tasks?"))).toBe(false);
  await act(async () => { resolveMinis({ ok: true, json: async () => [
    { id: 4, lesson_id: 3, mini_index: 1, title: "Қайталау", sort_order: 0 },
  ] }); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
});

it("shows an empty lesson without a permanent loading state", async () => {
  const original = global.fetch;
  global.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => String(input).includes("/lessons/3/mini-lessons")
    ? { ok: true, json: async () => [] } as Response : original(input, options)) as typeof fetch;
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} />); });
  expect(screen.getByText("Бұл сабақта кіші сабақтар жоқ.")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Тапсырма қосу" })).not.toBeInTheDocument();
});

it("renames the selected mini-lesson from its task page and preserves input after a failure", async () => {
  const original = global.fetch;
  let failSave = true;
  global.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => options?.method === "PUT"
    ? { ok: !failSave } as Response : original(input, options)) as typeof fetch;
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} />); });
  fireEvent.click(screen.getByRole("button", { name: "Атауын өңдеу" }));
  fireEvent.change(screen.getByLabelText("Кіші сабақ атауы"), { target: { value: "Жаңа атау" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Сақтау" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("Кіші сабақты жаңарту мүмкін болмады");
  expect(screen.getByLabelText("Кіші сабақ атауы")).toHaveValue("Жаңа атау");
  const update = jest.mocked(global.fetch).mock.calls.find(([, options]) => options?.method === "PUT");
  expect(update?.[0]).toBe("/api/backend/admin/mini-lessons/4");
  expect((update?.[1]?.body as FormData).get("title")).toBe("Жаңа атау");
  failSave = false;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Сақтау" })); });
  expect(screen.queryByLabelText("Кіші сабақ атауы")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("2+2")).toBeInTheDocument();
});

it("opens a separate task dialog and keeps it open when saving fails", async () => {
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} miniLessonId={4} />); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Тапсырма қосу/ }));
  const dialog = screen.getByRole("dialog", { name: "Жаңа тапсырма" });
  fireEvent.change(within(dialog).getByPlaceholderText("Тапсырма мәтіні"), { target: { value: "Жаңа есеп" } });
  await act(async () => { fireEvent.submit(dialog.querySelector("form")!); });
  expect(within(dialog).getByRole("alert")).toHaveTextContent("Тапсырма құру мүмкін болмады");
  expect(within(dialog).getByPlaceholderText("Тапсырма мәтіні")).toHaveValue("Жаңа есеп");
  fireEvent.click(within(dialog).getByRole("button", { name: "Терезені жабу" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the task URL's selection while the login session is loading on refresh", async () => {
  mockAuthenticated = false;
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} miniLessonId={4} />); });
  expect(global.fetch).not.toHaveBeenCalled();
  mockAuthenticated = true;
  await act(async () => { view.rerender(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} miniLessonId={4} />); });
  expect(screen.getByText("2+2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Тапсырма қосу/ })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Мазмұн жолы" })).getByText("Қайталау")).toBeInTheDocument();
});
