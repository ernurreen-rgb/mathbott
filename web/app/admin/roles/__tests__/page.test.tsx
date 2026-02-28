import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import AdminRolesPage from "../page";

const mockUseSession = jest.fn();
const mockGetAdminRoles = jest.fn();
const mockSetAdminRoleBySuper = jest.fn();
const mockUseAdminPageAccess = jest.fn();

jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

jest.mock("@/lib/use-admin-page-access", () => ({
  useAdminPageAccess: (...args: any[]) => mockUseAdminPageAccess(...args),
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

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/lib/api", () => ({
  getAdminRoles: (...args: any[]) => mockGetAdminRoles(...args),
  setAdminRoleBySuper: (...args: any[]) => mockSetAdminRoleBySuper(...args),
}));

describe("AdminRolesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: { user: { email: "super@example.com" } },
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
    mockGetAdminRoles.mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            email: "editor@example.com",
            role: "content_editor",
            created_at: "2026-02-22T10:00:00",
            last_active: "2026-02-22T11:00:00",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        has_more: false,
      },
      error: null,
    });
    mockSetAdminRoleBySuper.mockResolvedValue({
      data: null,
      error: null,
    });
    Object.defineProperty(window, "confirm", {
      writable: true,
      value: jest.fn(() => true),
    });
  });

  it("renders for super_admin with roles list", async () => {
    render(<AdminRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("Rolderdi baskaru")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    });
  });

  it("applies role filter in getAdminRoles request", async () => {
    render(<AdminRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("roles-filter-role"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByText("Izdeu"));

    await waitFor(() => {
      expect(mockGetAdminRoles).toHaveBeenLastCalledWith(
        "super@example.com",
        expect.objectContaining({ role: "reviewer" })
      );
    });
  });

  it("saves inline role update from row controls", async () => {
    mockSetAdminRoleBySuper.mockResolvedValue({
      data: {
        success: true,
        changed: true,
        target_user: {
          id: 1,
          email: "editor@example.com",
          previous_role: "content_editor",
          new_role: "reviewer",
        },
      },
      error: null,
    });

    render(<AdminRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("editor@example.com")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("inline-role-select-1"), { target: { value: "reviewer" } });
    fireEvent.click(screen.getByTestId("inline-role-save-1"));

    await waitFor(() => {
      expect(mockSetAdminRoleBySuper).toHaveBeenCalledWith("super@example.com", {
        target_email: "editor@example.com",
        role: "reviewer",
      });
    });
  });

  it("does not fetch list for non-super access", async () => {
    mockUseAdminPageAccess.mockReturnValue({
      loading: false,
      access: {
        is_admin: true,
        role: "reviewer",
        is_super_admin: false,
        permissions: ["review_manage"],
      },
    });

    render(<AdminRolesPage />);

    await waitFor(() => {
      expect(screen.getByText("Rolderdi baskaru")).toBeInTheDocument();
    });
    expect(mockGetAdminRoles).not.toHaveBeenCalled();
  });
});

