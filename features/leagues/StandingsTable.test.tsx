import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { StandingsTable, type StandingsTableProps } from "./StandingsTable";
import type { FixtureDraft, LeagueMemberTeam } from "./api";

/**
 * StandingsTable (RAU-40 UI): renders the 3/1/0 table from the league fixtures
 * using the same pure `computeStandings` the season-close logic uses. The copy
 * under test is Spanish (league-detail convention), so every render pins the
 * locale explicitly (the bare-mount i18n fallback is also Spanish, but the
 * global default is English — explicit beats implicit).
 */

const TEAMS: LeagueMemberTeam[] = [
  { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", userId: "u1", roster: [], coaching: null },
  { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l1", userId: "u2", roster: [], coaching: null },
  { id: "t3", name: "Zombies", raceId: "necromantic", leagueId: "l1", userId: "u3", roster: [], coaching: null },
];

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    status: "pending",
    homeOwner: { id: "u1", name: "raul" },
    awayOwner: { id: "u2", name: "maria" },
    proposals: [],
    ...overrides,
  };
}

function renderTable(props: Partial<StandingsTableProps> = {}) {
  return render(
    <I18nProvider initialLocale="es">
      <StandingsTable teams={TEAMS} fixtures={[]} {...props} />
    </I18nProvider>,
  );
}

describe("StandingsTable", () => {
  it("shows the empty state when no fixture has both scores", () => {
    renderTable({
      fixtures: [
        fixture({ status: "scheduled", scheduledAt: "2026-02-05", homeScore: null, awayScore: null }),
      ],
    });

    expect(screen.getByRole("heading", { name: "Clasificación" })).toBeTruthy();
    expect(screen.getByText("Aún no hay resultados.")).toBeTruthy();
    expect(screen.queryByTestId("standings-table")).toBeNull();
  });

  it("renders the sorted table with played/W/D/L, points and TD diff", () => {
    renderTable({
      fixtures: [
        fixture({ id: "f1", round: 1, homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1", status: "played" }),
        fixture({ id: "f2", round: 2, homeTeamId: "t3", awayTeamId: "t1", homeScore: 1, awayScore: 1, winnerId: null, status: "played" }),
        fixture({ id: "f3", round: 2, homeTeamId: "t2", awayTeamId: "t3", homeScore: 0, awayScore: 3, winnerId: "t3", status: "played" }),
      ],
    });

    const table = screen.getByTestId("standings-table");
    // Reavers: W (3 pts) + D (1 pt) = 4 · TDs 3–2 = +1
    // Zombies: D (1) + W (3) = 4 · TDs 4–1 = +3 → first on TD diff
    // Orcs: L 0 + L 0 = 0 · TDs 1–5 = −4
    const rows = within(table).getAllByRole("row").slice(1); // drop the header
    expect(rows).toHaveLength(3);

    const firstText = rows[0].textContent ?? "";
    expect(firstText).toContain("Zombies");
    expect(firstText).toContain("+3"); // td diff
    expect(firstText).toContain("4"); // points

    const secondText = rows[1].textContent ?? "";
    expect(secondText).toContain("Reavers");

    const thirdText = rows[2].textContent ?? "";
    expect(thirdText).toContain("Orcs");
    expect(thirdText).toContain("-4");
  });

  it("shows the race line under each team name", () => {
    renderTable({
      fixtures: [fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1", status: "played" })],
    });

    const table = screen.getByTestId("standings-table");
    expect(within(table).getByText("Human")).toBeTruthy();
    expect(within(table).getByText("Orc")).toBeTruthy();
  });

  it("highlights the stored champion row when the league finished", () => {
    const { unmount } = renderTable({
      championTeamId: "t2",
      fixtures: [
        fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 2, winnerId: "t2", status: "played" }),
        fixture({ id: "f2", homeTeamId: "t2", awayTeamId: "t3", homeScore: 2, awayScore: 1, winnerId: "t2", status: "played" }),
      ],
    });

    // t2 is both #1 and the stored champion → the same row carries the marker.
    const championRow = screen.getByTestId("standings-champion-row");
    expect(within(championRow).getByText("Orcs")).toBeTruthy();
    expect(championRow.textContent).toContain("6"); // 3+3 points
    unmount();

    // A different stored champion (not the computed leader) is still highlighted.
    renderTable({
      championTeamId: "t1",
      fixtures: [fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1", status: "played" })],
    });
    expect(screen.getByTestId("standings-champion-row").textContent).toContain("Reavers");
  });
});
