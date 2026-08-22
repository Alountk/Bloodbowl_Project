import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const isAuthEnabledMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-mode", () => ({ isAuthEnabled: () => isAuthEnabledMock() }));

vi.mock("@/features/landing/Landing", () => ({
  Landing: () => <div data-testid="landing" />,
}));
vi.mock("@/features/dashboard/HomeDashboard", () => ({
  HomeDashboard: ({
    authenticated,
    userName,
  }: {
    authenticated: boolean;
    userName: string | null;
  }) => (
    <div
      data-testid="dashboard"
      data-authenticated={String(authenticated)}
      data-user-name={userName ?? ""}
    />
  ),
}));

describe("Home page", () => {
  it("renders the dashboard in local/anonymous mode (no auth gate)", async () => {
    isAuthEnabledMock.mockReturnValue(false);

    render(await Page());

    expect(screen.getByTestId("dashboard")).toBeTruthy();
    expect(screen.getByTestId("dashboard").getAttribute("data-authenticated")).toBe("false");
    expect(screen.getByTestId("dashboard").getAttribute("data-user-name")).toBe("");
    expect(screen.queryByTestId("landing")).toBeNull();
  });

  it("renders the public landing for anonymous users in auth mode", async () => {
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(null);

    render(await Page());

    expect(screen.getByTestId("landing")).toBeTruthy();
    expect(screen.queryByTestId("dashboard")).toBeNull();
  });

  it("renders the dashboard for authenticated users in auth mode", async () => {
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "u1", name: "Coach", email: "c@x.io" } });

    render(await Page());

    expect(screen.getByTestId("dashboard")).toBeTruthy();
    expect(screen.getByTestId("dashboard").getAttribute("data-authenticated")).toBe("true");
    expect(screen.getByTestId("dashboard").getAttribute("data-user-name")).toBe("Coach");
    expect(screen.queryByTestId("landing")).toBeNull();
  });

  it("falls back to the email when an authenticated user has no display name", async () => {
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "u1", name: null, email: "c@x.io" } });

    render(await Page());

    expect(screen.getByTestId("dashboard").getAttribute("data-user-name")).toBe("c@x.io");
  });
});
