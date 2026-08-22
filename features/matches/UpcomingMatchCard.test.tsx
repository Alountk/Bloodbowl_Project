import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { UpcomingFixture } from "./selectUpcomingFixtures";
import { UpcomingMatchCard } from "./UpcomingMatchCard";

/**
 * UpcomingMatchCard (Design B / MP-2): a light, whole-card link to the fixture
 * route showing the league name, "Jornada {round}", both team names (with the
 * i18n team fallback), the scheduled date (or a no-date placeholder when
 * undated), and an EN VIVO badge while the live match runs. No jest-dom — use
 * .textContent / regex assertions.
 */

function upcoming(overrides: Partial<UpcomingFixture> = {}): UpcomingFixture {
  return {
    id: "f1",
    leagueId: "l1",
    leagueName: "Liga de Verano",
    round: 3,
    homeTeamId: "h",
    awayTeamId: "a",
    homeTeamName: "Halfling Hopper",
    awayTeamName: "Wood Elf Wanderers",
    createdAt: "2026-02-01",
    scheduledAt: "2026-08-23T10:00:00Z",
    winnerId: null,
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    homeOwner: { id: "u1", name: "raul" },
    awayOwner: { id: "u2", name: "maria" },
    proposals: [],
    live: null,
    ...overrides,
  };
}

function renderCard(fixture: UpcomingFixture) {
  render(<UpcomingMatchCard fixture={fixture} />);
}

describe("UpcomingMatchCard", () => {
  it("shows the league, Jornada, both team names and the date, and links to the fixture", () => {
    renderCard(upcoming());

    expect(screen.getByText("Liga de Verano")).toBeTruthy();
    expect(screen.getByText(/Jornada\s+3/)).toBeTruthy();
    expect(screen.getByText("Halfling Hopper")).toBeTruthy();
    expect(screen.getByText("Wood Elf Wanderers")).toBeTruthy();

    // 2026-08-23T10:00:00Z formatted by formatMatchDate as DD/MM/YYYY HH:MM.
    expect(screen.getByText(/23\/08\/2026/)).toBeTruthy();

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f1");
  });

  it("renders the no-date placeholder when the fixture is undated", () => {
    renderCard(upcoming({ scheduledAt: null, status: "pending" }));

    expect(screen.getByText("No date set")).toBeTruthy();
    expect(screen.queryByText(/23\/08\/2026/)).toBeNull();
  });

  it("falls back to the team name placeholder when a team is unresolvable", () => {
    renderCard(upcoming({ awayTeamName: undefined }));

    expect(screen.getByText("Halfling Hopper")).toBeTruthy();
    expect(screen.getByText("Equipo")).toBeTruthy(); // match.teamFallback (es)
  });

  it("shows the EN VIVO badge only while the live match runs", () => {
    renderCard(upcoming({ live: { status: "live", homeScore: 1, awayScore: 0, half: 1, turnNumber: 3 } }));
    expect(screen.getByText("EN VIVO")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/leagues/l1/fixtures/f1");
  });

  it("hides the EN VIVO badge when the live match has finished or there is no live row", () => {
    renderCard(
      upcoming({ live: { status: "finished", homeScore: 1, awayScore: 0, half: 2, turnNumber: 8 } }),
    );
    expect(screen.queryByText("EN VIVO")).toBeNull();

    const { rerender } = render(<UpcomingMatchCard fixture={upcoming()} />);
    expect(screen.queryByText("EN VIVO")).toBeNull();
    rerender(<UpcomingMatchCard fixture={upcoming({ live: { status: "ready", homeScore: 0, awayScore: 0, half: 0, turnNumber: 0 } })} />);
    expect(screen.queryByText("EN VIVO")).toBeNull();
  });

  it("wraps the whole card in a single link to the fixture route", () => {
    renderCard(upcoming());

    const link = screen.getByRole("link");
    const linkText = within(link).getByText("Liga de Verano");
    expect(linkText).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/leagues/l1/fixtures/f1");
  });
});
