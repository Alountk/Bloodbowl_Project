import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const sessionMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

/** Renders the desktop sidebar and returns its nav landmark. */
function navOf() {
  return screen.getByRole("navigation");
}

describe("Sidebar dev link (RAU-52)", () => {
  it("hides the dev rulesets link for a regular user", () => {
    sessionMock.mockReturnValue({ data: { user: { id: "u1", role: "user" } }, status: "authenticated" });
    render(<Sidebar />);
    const nav = navOf();
    expect(within(nav).getByRole("link", { name: "Equipos" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Ligas" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Mi Perfil" })).toBeTruthy();
    expect(within(nav).queryByRole("link", { name: "Tipos de reglas" })).toBeNull();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
  });

  it("shows the dev rulesets link for a developer", () => {
    sessionMock.mockReturnValue({ data: { user: { id: "dev-1", role: "developer" } }, status: "authenticated" });
    render(<Sidebar />);
    const nav = navOf();
    expect(within(nav).getByRole("link", { name: "Tipos de reglas" }).getAttribute("href")).toBe("/dev/rulesets");
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
  });

  it("hides the dev link when there is no session (anonymous/local mode)", () => {
    sessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<Sidebar />);
    expect(within(navOf()).queryByRole("link", { name: "Tipos de reglas" })).toBeNull();
  });
});
