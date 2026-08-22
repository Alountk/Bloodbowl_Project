import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// The AppNav reads the session to derive the user menu + the developer nav link.
// These shell tests render without a SessionProvider, so useSession resolves to
// no session → no user menu and no dev link.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("AppShell unified nav", () => {
  it("renders the landing-style nav with the section links", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Leagues" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Teams" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Matches" })).toBeTruthy();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });

  it("renders the unified nav without a topbar search (search lives in the teams section)", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("shows neither Sign in nor the user menu in anonymous/local mode", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Menú de usuario" })).toBeNull();
  });

  it("renders the page content", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );
    expect(screen.getByText("page content")).toBeTruthy();
  });
});

describe("AppShell mobile drawer", () => {
  it("does not render the drawer or scrim when closed", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
  });

  it("opens the drawer via the hamburger, mounting the drawer and scrim", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));

    expect(screen.getByRole("complementary", { name: "Mobile navigation" })).toBeTruthy();
    expect(screen.getByTestId("drawer-scrim")).toBeTruthy();
  });

  it("closes the drawer when the scrim is clicked", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    expect(screen.getByRole("complementary", { name: "Mobile navigation" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("drawer-scrim"));

    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
  });

  it("closes the drawer when a navigation link inside it is clicked", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    const drawer = screen.getByRole("complementary", { name: "Mobile navigation" });
    expect(within(drawer).getByRole("link", { name: "Leagues" })).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("link", { name: "Leagues" }));

    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
  });

  it("lists Profile and Log out in the drawer for an authenticated shell", () => {
    const logout = vi.fn();
    render(
      <AppShell authenticated onLogout={logout}>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    const drawer = screen.getByRole("complementary", { name: "Mobile navigation" });
    expect(within(drawer).getByRole("link", { name: "Mi Perfil" })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cerrar sesión" }));
    expect(logout).toHaveBeenCalled();
  });
});
