import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TeamCard } from "./TeamCard";
import { fetchTeamProgression } from "./api";
import type { PlayerProgressionCore, Team } from "./types";
import { DEFAULT_COACHING } from "./types";

// The card owns its progression fetch: ONE call per card feeds both the
// ready-to-improve hint and the valueBonus side of the CTV calculation.
vi.mock("./api", () => ({
  fetchTeamProgression: vi.fn(),
}));

const fetchProgressionMock = fetchTeamProgression as ReturnType<typeof vi.fn>;

// 3 Human Linemen (50k), 2 Blitzers (85k), 1 Thrower (75k) + 1 reroll (50k).
const team: Team = {
  id: "team-1",
  name: "Reikland Reavers",
  raceId: "human",
  coaching: { ...DEFAULT_COACHING, rerolls: 1 },
  leagueId: null,
  treasury: 0,
  roster: [
    { id: "p1", name: "Player 1", positionalKey: "lineman" },
    { id: "p2", name: "Player 2", positionalKey: "lineman" },
    { id: "p3", name: "Player 3", positionalKey: "lineman" },
    { id: "p4", name: "Player 4", positionalKey: "blitzer" },
    { id: "p5", name: "Player 5", positionalKey: "blitzer" },
    { id: "p6", name: "Player 6", positionalKey: "thrower" },
  ],
};

function progression(overrides: Partial<PlayerProgressionCore> & { id: string }): PlayerProgressionCore {
  return {
    rosterPlayerId: overrides.id,
    pe: 0,
    skills: [],
    improvements: 0,
    valueBonus: 0,
    alive: true,
    missNextMatch: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchProgressionMock.mockReset();
  fetchProgressionMock.mockResolvedValue([]);
});

describe("TeamCard", () => {
  it("renders the emblem initial, team name, race name and roster composition", async () => {
    fetchProgressionMock.mockResolvedValue([]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    // Deterministic emblem shows the team's initial.
    expect(screen.getByTestId(`emblem-${team.id}`).textContent).toBe("R");
    // Name + race line.
    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    // Composition via summarizeRosterFromEntries: 6 players · 3x lineman · 2x blitzer · 1x thrower.
    await waitFor(() =>
      expect(
        screen.getByText("6 jugadores · 3x Human Lineman · 2x Human Blitzer · 1x Human Thrower"),
      ).toBeTruthy(),
    );
  });

  it("wraps the card in a link to /teams/[id]", async () => {
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    const link = screen.getByRole("link", { name: /reikland reavers/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/teams/team-1");
  });

  it("shows the league badge when the league name resolves", async () => {
    render(<TeamCard team={team} leagueName="Liga de Verano" onDeleteRequest={() => {}} />);
    expect(screen.getByText("Liga de Verano")).toBeTruthy();
  });

  it("hides the league badge when the league cannot be resolved (null/stale id)", async () => {
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);
    expect(screen.queryByText("Liga de Verano")).toBeNull();
  });

  it("shows '1 listo para mejorar' when exactly one player can improve", async () => {
    fetchProgressionMock.mockResolvedValue([
      // 0 acq -> cost 3; pe 3 ready.
      progression({ id: "p1", pe: 3 }),
      // 0 acq -> cost 3; pe 2 not ready.
      progression({ id: "p2", pe: 2 }),
    ]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    await waitFor(() => expect(screen.getByText("1 listo para mejorar")).toBeTruthy());
  });

  it("shows the plural 'N listos para mejorar' for several ready players", async () => {
    fetchProgressionMock.mockResolvedValue([
      progression({ id: "p1", pe: 3 }),
      progression({ id: "p2", pe: 4, improvements: 1 }), // cost 4 -> ready
    ]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    await waitFor(() => expect(screen.getByText("2 listos para mejorar")).toBeTruthy());
  });

  it("hides the hint when no player is ready to improve", async () => {
    fetchProgressionMock.mockResolvedValue([progression({ id: "p1", pe: 2 })]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    await waitFor(() => expect(screen.queryByText(/listo.*para mejorar/i)).toBeNull());
  });

  it("excludes dead players from the ready-to-improve count", async () => {
    fetchProgressionMock.mockResolvedValue([
      progression({ id: "p1", pe: 50, alive: false }),
      progression({ id: "p2", pe: 50 }), // alive -> ready
    ]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    await waitFor(() => expect(screen.getByText("1 listo para mejorar")).toBeTruthy());
  });

  it("computes CTV as roster cost + coaching + progression valueBonus", async () => {
    fetchProgressionMock.mockResolvedValue([
      progression({ id: "p4", valueBonus: 20_000 }),
    ]);
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    // roster 3*50k + 2*85k + 75k = 395k; coaching 1 reroll = 50k; valueBonus 20k.
    // CTV = 465 000.
    await waitFor(() => expect(screen.getByTestId("team-ctv").textContent).toBe("465 000"));
  });

  it("shows the spendable treasury via computeSpendableBalance", async () => {
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={() => {}} />);

    // 1 000 000 − 395 000 (roster) − 50 000 (coaching) = 555 000.
    await waitFor(() =>
      expect(screen.getByTestId("team-treasury").textContent).toContain("555 000"),
    );
  });

  it("fires onDeleteRequest when the delete icon is activated", async () => {
    const onDeleteRequest = vi.fn();
    render(<TeamCard team={team} leagueName={undefined} onDeleteRequest={onDeleteRequest} />);

    const btn = screen.getByRole("button", { name: "Eliminar Reikland Reavers" });
    fireEvent.click(btn);
    expect(onDeleteRequest).toHaveBeenCalledTimes(1);
  });
});
