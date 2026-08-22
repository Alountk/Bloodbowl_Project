import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppNav } from "./AppNav";

type SessionStub = {
  data: { user: { id: string; name: string; role: string } } | null;
  status: string;
};

const sessionMock = vi.hoisted(() =>
  vi.fn<() => SessionStub>(() => ({ data: null, status: "unauthenticated" })),
);
vi.mock("next-auth/react", () => ({ useSession: () => sessionMock() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

const logoutMock = vi.fn();

function renderPublic() {
  return render(<AppNav authenticated={false} showSignIn onLogout={logoutMock} />);
}

function renderLogged(name = "Coach") {
  sessionMock.mockReturnValue({
    data: { user: { id: "u1", name, role: "user" } },
    status: "authenticated",
  });
  return render(<AppNav authenticated onLogout={logoutMock} />);
}

describe("AppNav public variant (landing)", () => {
  it("renders the working section links (Teams + Leagues + Matches) and a Sign in button that opens the auth modal", () => {
    renderPublic();

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    // Teams and Matches now ship with dedicated pages.
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Leagues" }).getAttribute("href")).toBe("/leagues");
    expect(within(nav).getByRole("link", { name: "Teams" }).getAttribute("href")).toBe("/teams");
    expect(within(nav).getByRole("link", { name: "Matches" }).getAttribute("href")).toBe("/matches");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Iniciar sesión" })).toBeTruthy();
  });

  it("shows no user menu when not authenticated", () => {
    renderPublic();
    expect(screen.queryByRole("button", { name: "Menú de usuario" })).toBeNull();
  });
});

describe("AppNav logged-in variant (app shell)", () => {
  it("shows the avatar pill with the coach name and a Perfil / Cerrar sesión menu", () => {
    renderLogged();

    const pill = screen.getByRole("button", { name: "Menú de usuario" });
    expect(pill).toBeTruthy();
    expect(within(pill).getByText("Coach")).toBeTruthy();

    fireEvent.click(pill);
    expect(screen.getByRole("link", { name: "Mi Perfil" }).getAttribute("href")).toBe("/profile");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(logoutMock).toHaveBeenCalled();
  });

  it("shows no Sign in button for a logged-in user", () => {
    renderLogged();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("appends the dev rulesets link for a developer session", () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "dev-1", name: "Dev", role: "developer" } },
      status: "authenticated",
    });
    render(<AppNav authenticated onLogout={logoutMock} />);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "Leagues" }).getAttribute("href")).toBe("/leagues");
    expect(within(nav).getByRole("link", { name: "Teams" }).getAttribute("href")).toBe("/teams");
    expect(within(nav).getByRole("link", { name: "Matches" }).getAttribute("href")).toBe("/matches");
    expect(within(nav).getByRole("link", { name: "Tipos de reglas" }).getAttribute("href")).toBe(
      "/dev/rulesets",
    );
  });
});

describe("AppNav local/anonymous shell mode", () => {
  it("shows neither Sign in nor the user menu when not authenticated and not public", () => {
    render(<AppNav authenticated={false} />);
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Menú de usuario" })).toBeNull();
  });
});

describe("AppNav mobile drawer", () => {
  it("opens from the hamburger and shares the same links plus the auth action", () => {
    renderPublic();

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));

    const drawer = screen.getByRole("complementary", { name: "Mobile navigation" });
    expect(within(drawer).getByRole("link", { name: "Leagues" })).toBeTruthy();
    // The drawer shares the unified nav: Teams and Matches both present.
    expect(within(drawer).getByRole("link", { name: "Teams" }).getAttribute("href")).toBe("/teams");
    expect(within(drawer).getByRole("link", { name: "Matches" }).getAttribute("href")).toBe("/matches");

    // The public drawer Sign in opens the same auth modal.
    fireEvent.click(within(drawer).getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
  });

  it("closes on the scrim", () => {
    renderPublic();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    expect(screen.getByRole("complementary", { name: "Mobile navigation" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("drawer-scrim"));

    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
  });

  it("closes when a drawer nav link is activated", () => {
    renderPublic();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    const drawer = screen.getByRole("complementary", { name: "Mobile navigation" });

    fireEvent.click(within(drawer).getByRole("link", { name: "Leagues" }));

    expect(screen.queryByRole("complementary", { name: "Mobile navigation" })).toBeNull();
  });

  it("lists Profile and Log out directly for a logged-in user", () => {
    renderLogged();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de navegación" }));
    const drawer = screen.getByRole("complementary", { name: "Mobile navigation" });

    expect(within(drawer).getByRole("link", { name: "Mi Perfil" })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Cerrar sesión" }));
    expect(logoutMock).toHaveBeenCalled();
  });
});
