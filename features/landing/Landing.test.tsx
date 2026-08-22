import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Landing } from "./Landing";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Landing", () => {
  it("renders the unified public nav: Sign in opens the auth modal, section links present", () => {
    render(<Landing />);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    // Teams and Matches now ship with their dedicated pages.
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Leagues" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Teams" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Matches" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("dialog", { name: "Iniciar sesión" })).toBeTruthy();
  });

  it("renders the hero with both CTAs", () => {
    render(<Landing />);

    expect(
      screen.getByRole("heading", { name: "Your league, in your pocket." }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign up free" }).getAttribute("href")).toBe(
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Tour the app" }).getAttribute("href")).toBe(
      "#what-you-get",
    );
  });

  it("renders the four 'What you get' cards with their unique copy", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: "What you get" })).toBeTruthy();
    expect(screen.getByText("31 races with rulebook costs, skills and characteristics.")).toBeTruthy();
    expect(screen.getByText("Round-robin matchdays and negotiation when schedules clash.")).toBeTruthy();
    expect(screen.getByText("Turn clock, events and rolls stream to both coaches.")).toBeTruthy();
    expect(screen.getByText("Progress players, miss the next match, hire journeymen.")).toBeTruthy();
  });

  it("shows the How it works steps by default", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: "How it works" })).toBeTruthy();
    expect(screen.getByText("Three steps to your next season")).toBeTruthy();
    expect(screen.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad.")).toBeTruthy();
    expect(screen.getByText("Start or join a season with your own rules — races, treasury and TV caps included.")).toBeTruthy();
    expect(screen.getByText("Shared match board, turn clock, events, MVPs and winnings. The league keeps itself.")).toBeTruthy();
  });

  it("collapses the steps on Hide and brings them back on Show", () => {
    render(<Landing />);

    expect(
      screen.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));

    expect(
      screen.queryByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).toBeNull();
    expect(
      screen.queryByText("Shared match board, turn clock, events, MVPs and winnings. The league keeps itself."),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Show" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(
      screen.getByText("Pick a race from the BB2025 catalog, spend your 1M treasury, name your squad."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });
});
