import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

import AdminBankAuditPage from "../page";

const mockUseSession = jest.fn();
const mockGetAdminBankAuditLogs = jest.fn();
const mockRestoreAdminRoleFromAudit = jest.fn();
const mockUseAdminPageAccess = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("@/lib/use-admin-page-access", () => ({
  useAdminPageAccess: (...args: any[]) => mockUseAdminPageAccess(...args),
}));

jest.mock("@/lib/api", () => ({
  getAdminBankAuditLogs: (...args: any[]) => mockGetAdminBankAuditLogs(...args),
  restoreAdminRoleFromAudit: (...args: any[]) => mockRestoreAdminRoleFromAudit(...args),
}));

jest.mock("@/components/DesktopNav", () => {
  const ReactLocal = require("react");
  const MockDesktopNav = () => ReactLocal.createElement("div", { "data-testid": "desktop-nav" });
  return {
    __esModule: true,
    default: MockDesktopNav,
  };
});

jest.mock("@/components/MobileNav", () => {
  const ReactLocal = require("react");
  const MockMobileNav = () => ReactLocal.createElement("div", { "data-testid": "mobile-nav" });
  return {
    __esModule: true,
    default: MockMobileNav,
  };
});

describe("AdminBankAuditPage role_change quick action", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: { user: { email: "super@example.com" } },
    });
    mockGetAdminBankAuditLogs.mockResolvedValue({
      data: {
        items: [
          {
            id: 2,
            domain: "bank",
            action: "role_change",
            entity_type: "admin_user",
            entity_id: 55,
            actor_user_id: 1,
            actor_email: "super@example.com",
            summary: "Role changed",
            changed_fields: ["admin_role"],
            metadata: {
              from_role: "reviewer",
              to_role: "content_editor",
            },
            created_at: "2026-02-22T00:00:00",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        has_more: false,
      },
      error: null,
    });
    mockRestoreAdminRoleFromAudit.mockResolvedValue({ data: null, error: null });
  });

  it("shows restore button for super_admin", async () => {
    mockUseAdminPageAccess.mockReturnValue({
      loading: false,
      access: {
        is_admin: true,
        role: "super_admin",
        is_super_admin: true,
        permissions: ["content_manage", "review_manage", "super_critical"],
      },
    });

    render(<AdminBankAuditPage />);

    await waitFor(() => {
      expect(screen.getByTestId("restore-role-change-2")).toBeInTheDocument();
    });
  });

  it("hides restore button for non-super role", async () => {
    mockUseAdminPageAccess.mockReturnValue({
      loading: false,
      access: {
        is_admin: true,
        role: "reviewer",
        is_super_admin: false,
        permissions: ["review_manage"],
      },
    });

    render(<AdminBankAuditPage />);

    await waitFor(() => {
      expect(screen.getByText("Role changed")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("restore-role-change-2")).not.toBeInTheDocument();
  });
});

