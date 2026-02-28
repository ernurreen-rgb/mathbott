import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminOpsPage from "../page";

const mockUseSession = jest.fn();
const mockPush = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/components/DesktopNav", () => {
  const ReactLocal = require("react");
  const MockDesktopNav = () => ReactLocal.createElement("div", { "data-testid": "desktop-nav" });
  MockDesktopNav.displayName = "MockDesktopNav";
  return {
    __esModule: true,
    default: MockDesktopNav,
  };
});

jest.mock("@/components/MobileNav", () => {
  const ReactLocal = require("react");
  const MockMobileNav = () => ReactLocal.createElement("div", { "data-testid": "mobile-nav" });
  MockMobileNav.displayName = "MockMobileNav";
  return {
    __esModule: true,
    default: MockMobileNav,
  };
});

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}));

jest.mock("recharts", () => {
  const Mock = ({ children }: any) => <div>{children}</div>;
  return {
    Area: Mock,
    AreaChart: Mock,
    CartesianGrid: Mock,
    Legend: Mock,
    Line: Mock,
    LineChart: Mock,
    ResponsiveContainer: Mock,
    Tooltip: Mock,
    XAxis: Mock,
    YAxis: Mock,
  };
});

const mockGetAdminOpsHealthSummary = jest.fn();
const mockGetAdminOpsHealthTimeseries = jest.fn();
const mockGetAdminOpsIncidents = jest.fn();
const mockUseAdminPageAccess = jest.fn();
const mockCheckAdminStatus = jest.fn();

jest.mock("@/lib/use-admin-page-access", () => ({
  useAdminPageAccess: (...args: any[]) => mockUseAdminPageAccess(...args),
}));

jest.mock("@/lib/api", () => ({
  checkAdminStatus: (...args: any[]) => mockCheckAdminStatus(...args),
  getAdminOpsHealthSummary: (...args: any[]) => mockGetAdminOpsHealthSummary(...args),
  getAdminOpsHealthTimeseries: (...args: any[]) => mockGetAdminOpsHealthTimeseries(...args),
  getAdminOpsIncidents: (...args: any[]) => mockGetAdminOpsIncidents(...args),
}));

describe("AdminOpsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: { user: { email: "admin@example.com" } },
    });
    mockUseAdminPageAccess.mockReturnValue({
      loading: false,
      access: {
        is_admin: true,
        role: "super_admin",
        is_super_admin: true,
        permissions: ["content_manage", "review_manage", "super_critical"],
      },
    });
    mockCheckAdminStatus.mockResolvedValue({
      data: {
        is_admin: true,
        role: "super_admin",
        is_super_admin: true,
        permissions: ["content_manage", "review_manage", "super_critical"],
      },
      error: null,
    });
    mockGetAdminOpsHealthSummary.mockResolvedValue({
      data: {
        service_status: "healthy",
        database_status: "ok",
        window: "5m",
        requests_5m: 120,
        errors_5m: 3,
        error_rate_5m: 2.5,
        p95_ms_5m: 350,
        avg_ms_5m: 100,
        open_incidents: 1,
        updated_at: "2026-02-21T10:00:00",
      },
      error: null,
    });
    mockGetAdminOpsHealthTimeseries.mockResolvedValue({
      data: {
        range: "24h",
        step: "5m",
        items: [
          {
            ts: "2026-02-21 09:55:00",
            requests: 100,
            errors: 1,
            error_rate: 1,
            p95_ms: 200,
            avg_ms: 90,
            db_ok: 1,
          },
        ],
      },
      error: null,
    });
  });

  it("renders KPI and charts with valid payload", async () => {
    mockGetAdminOpsIncidents.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            kind: "high_5xx_rate",
            severity: "high",
            title: "High 5xx rate",
            message: "error spike",
            status: "open",
            first_seen_at: "2026-02-21 09:55:00",
            last_seen_at: "2026-02-21 10:00:00",
            occurrences: 2,
            metadata: {},
            telegram_last_sent_at: null,
            resolved_at: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        has_more: false,
      },
      error: null,
    });

    render(<AdminOpsPage />);

    await waitFor(() => {
      expect(screen.getByText("Өндіріс денсаулығы")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("Requests vs Errors")).toBeInTheDocument();
      expect(screen.getByText("Open Incidents")).toBeInTheDocument();
    });
  });

  it("renders empty state for incidents", async () => {
    mockGetAdminOpsIncidents.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        has_more: false,
      },
      error: null,
    });

    render(<AdminOpsPage />);

    await waitFor(() => {
      expect(screen.getByText("Инциденттер табылмады")).toBeInTheDocument();
    });
  });
});
