import { act, fireEvent, render, screen } from "@testing-library/react";
import BankPage from "@/app/admin/bank/page";
import { getAdminBankTasks, updateAdminBankTask } from "@/lib/api";
jest.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "editor@example.com" } }, status: "authenticated" }) }));
jest.mock("@/lib/use-admin-page-access", () => ({ useAdminPageAccess: () => ({ loading: false }) }));
jest.mock("@/components/DesktopNav", () => () => null);
jest.mock("@/components/MobileNav", () => () => null);
jest.mock("@/components/ui/MathRender", () => ({ __esModule: true, default: ({ latex }: { latex: string }) => <span>{latex}</span> }));
jest.mock("@/app/admin/bank/_components/BankTaskForm", () => ({ __esModule: true, default: (props: any) => props.showForm ? <button onClick={props.handleSubmitForm}>Audit Save</button> : null }));
jest.mock("@/lib/api", () => ({ apiPath: (path: string) => `/api/backend/${path}`, getAdminBankTasks: jest.fn(), updateAdminBankTask: jest.fn() }));
it("AUDIT reproduces conflict token rebasing without reloading stale values", async () => {
  (getAdminBankTasks as jest.Mock).mockResolvedValue({ data: { items: [{ id: 9, text: "old text from v1", answer: "4", question_type: "input", difficulty: "B", topics: [], current_version: 1 }], total: 1 }, error: null });
  (updateAdminBankTask as jest.Mock).mockResolvedValueOnce({ error: "Conflict", conflict: { code: "VERSION_CONFLICT", current_version: 2 } }).mockResolvedValueOnce({ data: { id: 9 }, error: null });
  await act(async () => { render(<BankPage />); });
  fireEvent.click(screen.getByRole("button", { name: "Өңдеу" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Audit Save" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Audit Save" })); });
  const first = (updateAdminBankTask as jest.Mock).mock.calls[0][1] as FormData;
  const second = (updateAdminBankTask as jest.Mock).mock.calls[1][1] as FormData;
  expect(first.get("expected_current_version")).toBe("1");
  expect(second.get("expected_current_version")).toBe("2");
  expect(second.get("text")).toBe("old text from v1");
  expect(getAdminBankTasks).toHaveBeenCalledTimes(2); // initial load and refresh after success, no reload at conflict.
});
