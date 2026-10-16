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

it("links mini-lessons to task pages instead of opening their tasks inline", async () => {
  await act(async () => { render(<CmsWorkspace moduleId={1} sectionId={2} lessonId={3} />); });
  expect(screen.getByRole("heading", { name: "Кіші сабақтар" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Қайталау/ })).toHaveAttribute("href", `${lesson}/mini-lessons/4`);
  expect(screen.queryByText("2+2")).not.toBeInTheDocument();
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
