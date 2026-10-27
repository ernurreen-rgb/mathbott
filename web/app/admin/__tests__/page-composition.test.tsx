import { act, render, screen } from "@testing-library/react";
import BankPage from "../bank/page";
import CMSPage from "../cms/page";
import TrialTestsPage from "../trial-tests/page";
import { TrialTestsProvider } from "../trial-tests/_components/TrialTestsProvider";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "editor@example.com" } }, status: "authenticated" }),
}));
jest.mock("@/lib/use-admin-page-access", () => ({ useAdminPageAccess: () => ({ loading: false }) }));
jest.mock("@/components/DesktopNav", () => () => null);
jest.mock("@/components/MobileNav", () => () => null);
jest.mock("@/lib/api", () => ({
  apiPath: (path: string) => `/api/backend/${path}`,
  getAdminBankTasks: jest.fn().mockResolvedValue({ data: { items: [], total: 0 }, error: null }),
  getAdminTrialTests: jest.fn().mockResolvedValue({ data: [], error: null }),
}));

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
});
afterEach(() => { global.fetch = originalFetch; });

it("shows only the module level on the CMS entry page", async () => {
  await act(async () => { render(<CMSPage />); });
  expect(screen.getByRole("heading", { name: "Модульдер" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Бөлімдер" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Сабақтар" })).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/api/backend/admin/modules?email=editor%40example.com");
});

it("composes bank import and version actions without opening dialogs", async () => {
  await act(async () => { render(<BankPage />); });
  expect(screen.getByRole("heading", { name: "Тапсырмалар банкі" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Тапсырма JSON")).not.toBeInTheDocument();
});

it("shows trial-test folders without embedding a task editor", async () => {
  await act(async () => { render(<TrialTestsProvider><TrialTestsPage /></TrialTestsProvider>); });
  expect(screen.getByRole("heading", { name: "Папкалар" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Жаңа тапсырма" })).not.toBeInTheDocument();
});
