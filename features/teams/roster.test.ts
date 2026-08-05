import { describe, expect, it } from "vitest";
import { getRaceById } from "./data/races";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeRosterCost,
  countPlayers,
  computeRosterCostFromPlayers,
  countPlayersFromEntries,
  summarizeRosterFromEntries,
} from "./roster";
import type { PlayerEntry, Team } from "./types";

describe("roster helpers", () => {
  it("exposes the BB2025 budget and roster limits", () => {
    expect(STARTING_TREASURY).toBe(1_000_000);
    expect(MIN_PLAYERS).toBe(3);
    expect(MAX_PLAYERS).toBe(16);
  });

  describe("computeRosterCost (legacy)", () => {
    it("sums each positional quantity multiplied by its cost", () => {
      const human = getRaceById("human")!;
      const cost = computeRosterCost(human, {
        lineman: 5, // 50k each
        blitzer: 2, // 85k each (BB2025)
        thrower: 1, // 75k each (BB2025)
      });
      expect(cost).toBe(5 * 50_000 + 2 * 85_000 + 1 * 75_000);
    });

    it("returns 0 when no players are selected", () => {
      const human = getRaceById("human")!;
      expect(computeRosterCost(human, {})).toBe(0);
    });

    it("ignores unknown quantity keys", () => {
      const human = getRaceById("human")!;
      expect(computeRosterCost(human, { cat: 3 })).toBe(0);
    });
  });

  describe("countPlayers (legacy)", () => {
    it("counts every selected player", () => {
      expect(countPlayers({ lineman: 7, blitzer: 4 })).toBe(11);
    });

    it("returns 0 when nothing is selected", () => {
      expect(countPlayers({})).toBe(0);
    });
  });

  describe("summarizeRoster (legacy)", () => {
    it("formats player count and each positional count in roster order", () => {
      const team: Team = {
        id: "1",
        name: "Reikland Reavers",
        raceId: "human",
        roster: [
          { id: "a", name: "Player 1", positionalKey: "lineman" },
          { id: "b", name: "Player 2", positionalKey: "lineman" },
          { id: "c", name: "Player 3", positionalKey: "lineman" },
          { id: "d", name: "Player 4", positionalKey: "lineman" },
          { id: "e", name: "Player 5", positionalKey: "lineman" },
          { id: "f", name: "Player 6", positionalKey: "lineman" },
          { id: "g", name: "Player 7", positionalKey: "lineman" },
          { id: "h", name: "Player 8", positionalKey: "blitzer" },
          { id: "i", name: "Player 9", positionalKey: "blitzer" },
          { id: "j", name: "Player 10", positionalKey: "blitzer" },
          { id: "k", name: "Player 11", positionalKey: "blitzer" },
        ],
      };
      expect(summarizeRosterFromEntries(team, [getRaceById("human")!])).toBe(
        "11 players · 7x Lineman · 4x Blitzer",
      );
    });

    it("renders the race name when a single positional type is used", () => {
      const players: PlayerEntry[] = Array.from({ length: 11 }, (_, i) => ({
        id: `p${i}`,
        name: `Player ${i + 1}`,
        positionalKey: "blitzer",
      }));
      const team: Team = {
        id: "2",
        name: "Orc Crushers",
        raceId: "orc",
        roster: players,
      };
      expect(summarizeRosterFromEntries(team, [getRaceById("orc")!])).toBe(
        "11 players · 11x Blitzer",
      );
    });
  });

  describe("computeRosterCostFromPlayers", () => {
    it("sums positional costs for each player entry", () => {
      const human = getRaceById("human")!;
      const players: PlayerEntry[] = [
        { id: "a", name: "Player 1", positionalKey: "lineman" },
        { id: "b", name: "Player 2", positionalKey: "lineman" },
        { id: "c", name: "Player 3", positionalKey: "blitzer" },
      ];
      const cost = computeRosterCostFromPlayers(human, players);
      expect(cost).toBe(2 * 50_000 + 85_000);
    });

    it("returns 0 for an empty player list", () => {
      const human = getRaceById("human")!;
      expect(computeRosterCostFromPlayers(human, [])).toBe(0);
    });

    it("ignores players with unknown positional keys", () => {
      const human = getRaceById("human")!;
      const players: PlayerEntry[] = [
        { id: "x", name: "Ghost", positionalKey: "unknown-key" },
      ];
      expect(computeRosterCostFromPlayers(human, players)).toBe(0);
    });
  });

  describe("countPlayersFromEntries", () => {
    it("returns the length of the player array", () => {
      const players: PlayerEntry[] = [
        { id: "a", name: "P1", positionalKey: "lineman" },
        { id: "b", name: "P2", positionalKey: "blitzer" },
      ];
      expect(countPlayersFromEntries(players)).toBe(2);
    });

    it("returns 0 for an empty array", () => {
      expect(countPlayersFromEntries([])).toBe(0);
    });
  });

  describe("summarizeRosterFromEntries", () => {
    it("groups players by positional name", () => {
      const human = getRaceById("human")!;
      const players: PlayerEntry[] = [
        { id: "a", name: "P1", positionalKey: "lineman" },
        { id: "b", name: "P2", positionalKey: "lineman" },
        { id: "c", name: "P3", positionalKey: "thrower" },
      ];
      const team: Team = { id: "1", name: "T", raceId: "human", roster: players };
      expect(summarizeRosterFromEntries(team, [human])).toBe(
        "3 players · 2x Lineman · 1x Thrower",
      );
    });

    it("returns '0 players' for an empty roster", () => {
      const human = getRaceById("human")!;
      const team: Team = { id: "1", name: "T", raceId: "human", roster: [] };
      expect(summarizeRosterFromEntries(team, [human])).toBe("0 players");
    });
  });
});
