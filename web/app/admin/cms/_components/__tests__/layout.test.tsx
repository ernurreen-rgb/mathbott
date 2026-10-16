import { act, render, screen } from "@testing-library/react";
import CmsLayout from "../../layout";
import CmsWorkspace from "../CmsWorkspace";

let mockEmail: string | null = "editor@example.com";
const mockRouter = { push: jest.fn() };
const mockCheckAdminStatus = jest.fn();
const allowed = { data: { is_admin: true, role: "content_editor" }, error: null };
const originalFetch = global.fetch;

jest.mock("next-auth/react", () => ({ useSession: () => ({
  data: mockEmail ? { user: { email: mockEmail } } : null,
  status: mockEmail ? "authenticated" : "unauthenticated",
}) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/components/DesktopNav", () => function DesktopNav() { return <nav aria-label="Негізгі мәзір">Мәзір</nav>; });
jest.mock("@/components/MobileNav", () => function MobileNav() { return <nav aria-label="Төменгі мәзір" />; });
jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  checkAdminStatus: (...args: unknown[]) => mockCheckAdminStatus(...args),
}));

beforeEach(() => {
  mockEmail = "editor@example.com";
  mockRouter.push.mockReset();
  mockCheckAdminStatus.mockReset().mockResolvedValue(allowed);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [
    { id: 1, name: "Алгебра", sort_order: 0 },
  ] });
});
afterEach(() => { global.fetch = originalFetch; });

it("keeps navigation mounted while access is checked and between CMS pages", async () => {
  let resolveAccess!: (value: unknown) => void;
  mockCheckAdminStatus.mockImplementation(() => new Promise((resolve) => { resolveAccess = resolve; }));
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<CmsLayout><p>Модульдер беті</p></CmsLayout>); });
  const nav = screen.getByRole("navigation", { name: "Негізгі мәзір" });
  const main = screen.getByRole("main");
  expect(screen.getByRole("status")).toHaveAccessibleName("CMS жүктелуде...");
  expect(screen.queryByText("Модульдер беті")).not.toBeInTheDocument();
  await act(async () => { resolveAccess(allowed); });
  expect(screen.getByText("Модульдер беті")).toBeInTheDocument();
  await act(async () => { view.rerender(<CmsLayout><p>Сабақтар беті</p></CmsLayout>); });
  expect(screen.getByRole("navigation", { name: "Негізгі мәзір" })).toBe(nav);
  expect(screen.getByRole("main")).toBe(main);
  expect(screen.getByText("Сабақтар беті")).toBeInTheDocument();
  expect(mockCheckAdminStatus).toHaveBeenCalledTimes(1);
});

it.each([
  { is_admin: false, role: null, destination: "/" },
  { is_admin: true, role: "reviewer", destination: "/admin" },
])("does not render CMS content for denied access ($role)", async ({ is_admin, role, destination }) => {
  mockCheckAdminStatus.mockResolvedValue({ data: { is_admin, role }, error: null });
  await act(async () => { render(<CmsLayout><p>Жеке контент</p></CmsLayout>); });
  expect(screen.queryByText("Жеке контент")).not.toBeInTheDocument();
  expect(mockRouter.push).toHaveBeenCalledWith(destination);
});

it("drops the previous account's cached content on account changes and logout", async () => {
  let view!: ReturnType<typeof render>;
  const page = () => <CmsLayout><CmsWorkspace /></CmsLayout>;
  await act(async () => { view = render(page()); });
  expect(screen.getByRole("link", { name: /Алгебра/ })).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Негізгі мәзір" });

  let resolveAccess!: (value: unknown) => void;
  mockCheckAdminStatus.mockImplementation(() => new Promise((resolve) => { resolveAccess = resolve; }));
  global.fetch = jest.fn(() => new Promise(() => {})) as typeof fetch;
  mockEmail = "other@example.com";
  await act(async () => { view.rerender(page()); });
  expect(screen.queryByRole("link", { name: /Алгебра/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName("CMS жүктелуде...");
  await act(async () => { resolveAccess(allowed); });
  expect(screen.queryByRole("link", { name: /Алгебра/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName("Мазмұн жүктелуде...");
  expect(screen.getByRole("navigation", { name: "Негізгі мәзір" })).toBe(nav);
  mockEmail = null;
  await act(async () => { view.rerender(page()); });
  expect(screen.queryByText("Оқу материалдары")).not.toBeInTheDocument();
  expect(mockRouter.push).toHaveBeenCalledWith("/");
});
