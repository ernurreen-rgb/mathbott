import { act, fireEvent, render, screen } from "@testing-library/react";
import TrialTestListPage from "../page";
import { getTrialTests, getTrialTestDraftIds, getCoopTestInvites } from "@/lib/api";
import type { TrialTest } from "@/types";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/trial-test",
}));

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { email: "student@example.com" } } }),
}));

jest.mock("@/components/DesktopNav", () => function MockDesktopNav() { return <div data-testid="desktop-nav" />; });
jest.mock("@/components/MobileNav", () => function MockMobileNav() { return <div data-testid="mobile-nav" />; });

jest.mock("@/lib/api", () => ({
  getTrialTests: jest.fn(),
  getTrialTestDraftIds: jest.fn(),
  getCoopTestInvites: jest.fn(),
  acceptCoopTestInvite: jest.fn(),
  declineCoopTestInvite: jest.fn(),
}));

const mockTests: TrialTest[] = [
  {
    id: 1,
    title: "ҰБТ 1-нұсқа",
    description: "2025 жылғы 1-нұсқа",
    category: "ҰБТ 2025",
    sort_order: 1,
    task_count: 40,
    created_at: "2026-10-15T00:00:00Z",
  },
  {
    id: 2,
    title: "ҰБТ 2-нұсқа",
    description: "2025 жылғы 2-нұсқа",
    category: "ҰБТ 2025",
    sort_order: 2,
    task_count: 40,
    created_at: "2026-10-15T00:00:00Z",
  },
  {
    id: 3,
    title: "Үшбұрыштар мен шеңберлер",
    description: "Геометрия негіздері",
    category: "Геометрия",
    sort_order: 3,
    task_count: 20,
    created_at: "2026-10-15T00:00:00Z",
  },
  {
    id: 4,
    title: "Жалпы тест",
    description: "Кіріспе тесті",
    category: "Жалпы",
    sort_order: 4,
    task_count: 15,
    created_at: "2026-10-15T00:00:00Z",
  },
];

describe("TrialTestListPage - Pure Folder System", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getTrialTests as jest.Mock).mockResolvedValue({ data: mockTests, error: null });
    (getTrialTestDraftIds as jest.Mock).mockResolvedValue({ data: { test_ids: [1] }, error: null });
    (getCoopTestInvites as jest.Mock).mockResolvedValue({ data: { items: [] }, error: null });
  });

  it("renders pure folder cards on main page with test counts and no draft indicator badge", async () => {
    await act(async () => {
      render(<TrialTestListPage />);
    });

    // Only folders exist on the root page
    expect(screen.getByText("ҰБТ 2025")).toBeInTheDocument();
    expect(screen.getByText("2 тест")).toBeInTheDocument();
    expect(screen.getByText("Геометрия")).toBeInTheDocument();
    expect(screen.getAllByText("1 тест")).toHaveLength(2);
    expect(screen.getByText("Жалпы")).toBeInTheDocument();

    // No "Жалғастыру бар" badge on folder
    expect(screen.queryByText("Жалғастыру бар")).not.toBeInTheDocument();

    // No search or all tests tab
    expect(screen.queryByPlaceholderText(/іздеу/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Барлық тесттер/i })).not.toBeInTheDocument();
  });

  it("opens a folder, displays tests inside it, and navigates back to folders", async () => {
    await act(async () => {
      render(<TrialTestListPage />);
    });

    // Click "ҰБТ 2025" folder
    const ubtFolder = screen.getByRole("button", { name: /ҰБТ 2025/i });
    await act(async () => {
      fireEvent.click(ubtFolder);
    });

    // Tests inside folder are displayed
    expect(screen.getByText("ҰБТ 1-нұсқа")).toBeInTheDocument();
    expect(screen.getByText("ҰБТ 2-нұсқа")).toBeInTheDocument();
    expect(screen.queryByText("Үшбұрыштар мен шеңберлер")).not.toBeInTheDocument();

    // Draft button says "Жалғастыру"
    expect(screen.getByText(/Жалғастыру/)).toBeInTheDocument();

    // Click "Артқа" back button
    const backBtn = screen.getByRole("button", { name: /Артқа/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });

    // Returned to root folder list
    expect(screen.getByText("Геометрия")).toBeInTheDocument();
    expect(screen.getByText("Жалпы")).toBeInTheDocument();
  });

  it("sorts folders by min sort_order first", async () => {
    await act(async () => {
      render(<TrialTestListPage />);
    });

    const folderButtons = screen.getAllByRole("button");
    const folderTexts = folderButtons.map((b) => b.textContent || "");
    // mockTests has ҰБТ (sort_order 1), Геометрия (sort_order 3), Жалпы (sort_order 4)
    const ubtIdx = folderTexts.findIndex((t) => t.includes("ҰБТ 2025"));
    const geomIdx = folderTexts.findIndex((t) => t.includes("Геометрия"));
    const genIdx = folderTexts.findIndex((t) => t.includes("Жалпы"));

    expect(ubtIdx).toBeLessThan(geomIdx);
    expect(geomIdx).toBeLessThan(genIdx);
  });
});
