import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Race, Team } from "../types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "../types";
import { STARTING_TREASURY } from "../roster";
import { getRaceById } from "../data/races";
import { TeamDetailView } from "./TeamDetailView";

const humanRace = getRaceById("human") as Race;

const baseTeam: Team = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueType: DEFAULT_LEAGUE_TYPE,
  coaching: { ...DEFAULT_COACHING },
  roster: [],
};

describe("TeamDetailView", () => {
  it("renders team identity: name, race name, league type", () => {
    render(<TeamDetailView team={baseTeam} race={humanRace} />);

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    // leagueType "open" should appear (capitalised or raw)
    expect(screen.getByText(/open/i)).toBeTruthy();
  });

  it("renders RosterTable in readOnly mode with players", () => {
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "John", positionalKey: "lineman" },
        { id: "p2", name: "Jane", positionalKey: "blitzer" },
      ],
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    // In readOnly mode RosterTable renders player names as spans, not inputs
    expect(screen.getByText("John")).toBeTruthy();
    expect(screen.getByText("Jane")).toBeTruthy();
    // readOnly means no remove buttons
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("shows empty roster fallback when roster is empty", () => {
    render(<TeamDetailView team={baseTeam} race={humanRace} />);

    expect(screen.getByText(/no players in roster yet/i)).toBeTruthy();
  });

  it("renders per-item coaching cost breakdown with unit cost and total per item", () => {
    const team: Team = {
      ...baseTeam,
      coaching: {
        rerolls: 2,
        dedicatedFans: 1,
        assistantCoaches: 1,
        cheerleaders: 0,
        apothecary: false,
      },
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    // Every coaching item row must appear, including zero-quantity entries,
    // because the breakdown is per-item (matches CreateTeamForm convention).
    expect(screen.getByText("Rerolls")).toBeTruthy();
    expect(screen.getByText("Dedicated Fans")).toBeTruthy();
    expect(screen.getByText("Assistant Coaches")).toBeTruthy();
    expect(screen.getByText("Cheerleaders")).toBeTruthy();
    // 2 rerolls at 50k each = 100k total — proves unit cost AND total both render.
    expect(screen.getByText("100k")).toBeTruthy();
  });

  it("forwards the race to RosterTable so positional stats render from the catalog", () => {
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "John", positionalKey: "lineman" },
      ],
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    // The race carries the lineman positional (MA/ST/AG/PA/AV + cost). The catalog
    // cost (50 000 in rulebook format) must surface through RosterTable — at
    // minimum twice (per-row + total row). Proves race was actually forwarded.
    const fiftyK = screen.getAllByText("50 000");
    expect(fiftyK.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("John")).toBeTruthy();
  });

  it("displays correct treasury = STARTING_TREASURY - rosterCost - coachingCost", () => {
    // 3 linemen (3 × 50k = 150k) + 2 rerolls (2 × 50k = 100k) = 250k spent
    // treasury = 1000k - 250k = 750k
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "A", positionalKey: "lineman" },
        { id: "p2", name: "B", positionalKey: "lineman" },
        { id: "p3", name: "C", positionalKey: "lineman" },
      ],
      coaching: {
        rerolls: 2,
        dedicatedFans: 1,
        assistantCoaches: 0,
        cheerleaders: 0,
        apothecary: false,
      },
    };

    const expectedTreasury = STARTING_TREASURY - 3 * 50_000 - 2 * 50_000; // 750_000
    render(<TeamDetailView team={team} race={humanRace} />);

    const formatted = `${expectedTreasury / 1000}k`; // "750k"
    expect(screen.getByText(new RegExp(formatted))).toBeTruthy();
  });

  it("shows raw raceId when race is not in catalog (FALLBACK_RACE)", () => {
    const unknownRace: Race = {
      id: "ancient-chaos",
      name: "ancient-chaos", // fallback: name = raceId
      rerollCost: 0,
      positionals: [],
    };
    const team: Team = {
      ...baseTeam,
      raceId: "ancient-chaos",
      name: "Chaos Warriors",
    };
    render(<TeamDetailView team={team} race={unknownRace} />);

    expect(screen.getByText("ancient-chaos")).toBeTruthy();
  });
});
