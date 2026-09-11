import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import DesktopNav from "../DesktopNav";
import { DesktopNavProvider } from "@/lib/desktop-nav-context";
import * as api from "@/lib/api";

jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { email: "student@example.com" } },
    status: "authenticated",
  }),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/modules",
}));

jest.mock("@/lib/api", () => ({
  checkAdminStatus: jest.fn(),
}));

const mockCheckAdminStatus = api.checkAdminStatus as jest.MockedFunction<typeof api.checkAdminStatus>;

describe("DesktopNav collapse functionality", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
    jest.clearAllMocks();
    mockCheckAdminStatus.mockResolvedValue({ data: { is_admin: false }, error: null });
  });

  it("renders navigation items by default when expanded", async () => {
    await act(async () => {
      render(
        <DesktopNavProvider>
          <DesktopNav />
        </DesktopNavProvider>
      );
    });

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByText("Модульдер")).toBeInTheDocument();
    expect(screen.getByLabelText("Навигацияны жабу")).toBeInTheDocument();
    expect(screen.queryByLabelText("Навигацияны ашу")).not.toBeInTheDocument();
    expect(document.body.classList.contains("desktop-nav-collapsed")).toBe(false);
  });

  it("collapses navigation when close button is clicked", async () => {
    await act(async () => {
      render(
        <DesktopNavProvider>
          <DesktopNav />
        </DesktopNavProvider>
      );
    });

    const closeButton = screen.getByLabelText("Навигацияны жабу");
    fireEvent.click(closeButton);

    const reopenButton = screen.getByLabelText("Навигацияны ашу");
    expect(reopenButton).toBeInTheDocument();
    expect(document.body.classList.contains("desktop-nav-collapsed")).toBe(true);
    expect(localStorage.getItem("mathbot_desktop_nav_collapsed")).toBe("true");

    const nav = screen.getByRole("navigation", { hidden: true });
    expect(nav.className).toContain("-translate-x-full");
  });

  it("reopens navigation when reopen button is clicked", async () => {
    await act(async () => {
      render(
        <DesktopNavProvider>
          <DesktopNav />
        </DesktopNavProvider>
      );
    });

    // Close
    fireEvent.click(screen.getByLabelText("Навигацияны жабу"));
    expect(screen.getByLabelText("Навигацияны ашу")).toBeInTheDocument();

    // Reopen
    fireEvent.click(screen.getByLabelText("Навигацияны ашу"));
    expect(screen.queryByLabelText("Навигацияны ашу")).not.toBeInTheDocument();
    expect(document.body.classList.contains("desktop-nav-collapsed")).toBe(false);
    expect(localStorage.getItem("mathbot_desktop_nav_collapsed")).toBe("false");

    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("translate-x-0");
  });

  it("toggles navigation using Ctrl+B shortcut", async () => {
    await act(async () => {
      render(
        <DesktopNavProvider>
          <DesktopNav />
        </DesktopNavProvider>
      );
    });

    // Press Ctrl+B to collapse
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(screen.getByLabelText("Навигацияны ашу")).toBeInTheDocument();
    expect(document.body.classList.contains("desktop-nav-collapsed")).toBe(true);

    // Press Ctrl+B again to reopen
    fireEvent.keyDown(document, { key: "b", ctrlKey: true });
    expect(screen.queryByLabelText("Навигацияны ашу")).not.toBeInTheDocument();
    expect(document.body.classList.contains("desktop-nav-collapsed")).toBe(false);
  });

  it("renders admin link when user is admin", async () => {
    mockCheckAdminStatus.mockResolvedValue({ data: { is_admin: true }, error: null });

    await act(async () => {
      render(
        <DesktopNavProvider>
          <DesktopNav />
        </DesktopNavProvider>
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Әкімші")).toBeInTheDocument();
    });
  });
});
