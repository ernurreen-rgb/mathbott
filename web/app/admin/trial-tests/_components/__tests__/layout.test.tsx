import { act, render, screen } from "@testing-library/react";
import TrialTestsLayout from "../../layout";
import TrialTestsCatalog from "../TrialTestsCatalog";

let mockEmail = "editor@example.com";
const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockAccess = jest.fn();
const mockTests = jest.fn();
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: mockEmail } }, status: "authenticated" }) }));
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
jest.mock("@/components/DesktopNav", () => function Nav() { return <nav aria-label="Негізгі мәзір" />; });
jest.mock("@/components/MobileNav", () => function Nav() { return null; });
jest.mock("@/lib/api", () => ({ checkAdminStatus: (...args: unknown[]) => mockAccess(...args), getAdminTrialTests: (...args: unknown[]) => mockTests(...args) }));

beforeEach(() => {
  mockEmail = "editor@example.com";
  jest.clearAllMocks();
  mockAccess.mockResolvedValue({ data: { is_admin: true, role: "content_editor" }, error: null });
  mockTests.mockResolvedValue({ data: [{ id: 9, title: "Тест", category: "Алгебра", sort_order: 0 }], error: null });
});

it("keeps navigation and access checks stable between folders", async () => {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<TrialTestsLayout><TrialTestsCatalog /></TrialTestsLayout>); });
  const nav = screen.getByRole("navigation", { name: "Негізгі мәзір" });
  await act(async () => { view.rerender(<TrialTestsLayout><TrialTestsCatalog category="Алгебра" /></TrialTestsLayout>); });
  expect(screen.getByRole("navigation", { name: "Негізгі мәзір" })).toBe(nav);
  expect(screen.getByRole("link", { name: /Тест 0 \/ 40/ })).toBeInTheDocument();
  expect(mockAccess).toHaveBeenCalledTimes(1);
  expect(mockTests).toHaveBeenCalledTimes(1);
});

it("keeps data hidden from a reviewer without content permissions", async () => {
  mockAccess.mockResolvedValue({ data: { is_admin: true, role: "reviewer" }, error: null });
  await act(async () => { render(<TrialTestsLayout><TrialTestsCatalog /></TrialTestsLayout>); });
  expect(screen.getByText("Қолжетім жоқ.")).toBeInTheDocument();
  expect(mockTests).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/admin");
});

it("clears the previous account's catalog before checking access for a new account", async () => {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<TrialTestsLayout><TrialTestsCatalog /></TrialTestsLayout>); });
  expect(screen.getByRole("link", { name: /Алгебра 1 тест/ })).toBeInTheDocument();
  mockEmail = "other@example.com";
  mockAccess.mockImplementation(() => new Promise(() => {}));
  await act(async () => { view.rerender(<TrialTestsLayout><TrialTestsCatalog /></TrialTestsLayout>); });
  expect(screen.queryByRole("link", { name: /Алгебра/ })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName("Сынақ тесттері жүктелуде...");
});
