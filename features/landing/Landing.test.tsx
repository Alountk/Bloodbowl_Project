import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("renders the public nav with Sign in and the section links", () => {
    render(<Landing />);

    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    const nav = screen.getByRole("navigation", { name: "Landing" });
    expect(nav).toBeTruthy();
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
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
