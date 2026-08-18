import { describe, expect, it } from "vitest";
import { getRaceById } from "./data/races";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_COST,
  ASSISTANT_COACH_MAX,
  CHEERLEADER_COST,
  CHEERLEADER_MAX,
  DEDICATED_FAN_IMPROVEMENT_COST,
  DEDICATED_FANS_MAX,
  DEDICATED_FANS_START,
  MAX_PLAYERS,
  MAX_REROLLS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeCoachingCost,
  computeCoachingCostItems,
  computeRosterCost,
  countPlayers,
  computeRosterCostFromPlayers,
  countPlayersFromEntries,
  summarizeRosterFromEntries,
} from "./roster";
import type { PlayerEntry, Team } from "./types";
import { DEFAULT_COACHING } from "./types";

describe("roster helpers", () => {
  it("exposes the BB2025 budget and roster limits", () => {
    expect(STARTING_TREASURY).toBe(1_000_000);
    expect(MIN_PLAYERS).toBe(11);
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
        coaching: { ...DEFAULT_COACHING },
        leagueId: null,
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
        "11 jugadores · 7x Human Lineman · 4x Human Blitzer",
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
        coaching: { ...DEFAULT_COACHING },
        leagueId: null,
        roster: players,
      };
      expect(summarizeRosterFromEntries(team, [getRaceById("orc")!])).toBe(
        "11 jugadores · 11x Orc Blitzer",
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
      const team: Team = {
        id: "1",
        name: "T",
        raceId: "human",
        coaching: { ...DEFAULT_COACHING },
        leagueId: null,
        roster: players,
      };
      expect(summarizeRosterFromEntries(team, [human])).toBe(
        "3 jugadores · 2x Human Lineman · 1x Human Thrower",
      );
    });

    it("returns '0 players' for an empty roster", () => {
      const human = getRaceById("human")!;
      const team: Team = {
        id: "1",
        name: "T",
        raceId: "human",
        coaching: { ...DEFAULT_COACHING },
        leagueId: null,
        roster: [],
      };
      expect(summarizeRosterFromEntries(team, [human])).toBe("0 jugadores");
    });
  });

  describe("coaching staff costs", () => {
    const human = getRaceById("human")!; // rerollCost = 50k

    it("exposes the standard BB2025 coaching costs and limits", () => {
      expect(DEDICATED_FAN_IMPROVEMENT_COST).toBe(5_000);
      expect(ASSISTANT_COACH_COST).toBe(10_000);
      expect(CHEERLEADER_COST).toBe(10_000);
      expect(APOTHECARY_COST).toBe(50_000);
      expect(ASSISTANT_COACH_MAX).toBe(6);
      expect(CHEERLEADER_MAX).toBe(6);
      expect(MAX_REROLLS).toBe(8);
      expect(DEDICATED_FANS_START).toBe(1);
      expect(DEDICATED_FANS_MAX).toBe(3);
    });

    it("costs rerolls at the race reroll cost", () => {
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING, rerolls: 3 })).toBe(3 * 50_000);
    });

    it("costs staff positions at their fixed unit price", () => {
      const staff = { ...DEFAULT_COACHING, assistantCoaches: 1, cheerleaders: 3 };
      expect(computeCoachingCost(human, staff)).toBe(10_000 + 3 * 10_000);
    });

    it("charges only for Dedicated Fan improvements above the starting 1", () => {
      // BB2025: start at 1 free; 1 -> 3 = two upgrades at 5k each.
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING, dedicatedFans: 1 })).toBe(0);
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING, dedicatedFans: 2 })).toBe(5_000);
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING, dedicatedFans: 3 })).toBe(10_000);
    });

    it("charges a flat fee when the apothecary is purchased", () => {
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING, apothecary: true })).toBe(50_000);
    });

    it("returns 0 for a default (empty) coaching set", () => {
      expect(computeCoachingCost(human, { ...DEFAULT_COACHING })).toBe(0);
    });

    it("breaks costs down per item with running totals", () => {
      const items = computeCoachingCostItems(human, {
        ...DEFAULT_COACHING,
        rerolls: 2,
        dedicatedFans: 3,
      });
      const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
      expect(byKey.rerolls).toMatchObject({ unitCost: 50_000, quantity: 2, total: 100_000 });
      expect(byKey.dedicatedFans).toMatchObject({ unitCost: 5_000, quantity: 3, total: 10_000 });
      expect(byKey.assistantCoaches).toMatchObject({ unitCost: 10_000, quantity: 0, total: 0 });
    });
  });
});
