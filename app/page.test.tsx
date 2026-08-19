import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import Page from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// The Sidebar reads the session to gate the developer nav link (RAU-52);
// without a SessionProvider the session resolves to none.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Home page", () => {
  it("renders the app shell with an empty team list after hydration", async () => {
    render(
      <AppShell>
        <Page />
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Bloodbowl Teams" })).toBeTruthy();
    expect(screen.getByLabelText("Sidebar")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Equipos" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/no hay equipos todavía/i)).toBeTruthy());
  });

  it("renders the mobile hamburger button with a descriptive accessible name", () => {
    render(
      <AppShell>
        <Page />
      </AppShell>,
    );

    // The hamburger is mobile-only (md:hidden) but is still present in jsdom.
    const hamburger = screen.getByRole("button", { name: "Abrir menú de navegación" });
    expect(hamburger).toBeTruthy();
  });
});
