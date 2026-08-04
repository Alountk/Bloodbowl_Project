import { describe, expect, it } from "vitest";
import { getRaceById } from "./data/races";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeRosterCost,
  countPlayers,
  summarizeRoster,
} from "./roster";
import type { Team } from "./types";

describe("roster helpers", () => {
  it("exposes the BB2020 budget and roster limits", () => {
    expect(STARTING_TREASURY).toBe(1_000_000);
    expect(MIN_PLAYERS).toBe(3);
    expect(MAX_PLAYERS).toBe(16);
  });

  describe("computeRosterCost", () => {
    it("sums each positional quantity multiplied by its cost", () => {
      const human = getRaceById("human")!;
      const cost = computeRosterCost(human, {
        lineman: 5, // 50k each
        blitzer: 2, // 90k each
        thrower: 1, // 80k each
      });
      expect(cost).toBe(5 * 50_000 + 2 * 90_000 + 1 * 80_000);
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

  describe("countPlayers", () => {
    it("counts every selected player", () => {
      expect(countPlayers({ lineman: 7, blitzer: 4 })).toBe(11);
    });

    it("returns 0 when nothing is selected", () => {
      expect(countPlayers({})).toBe(0);
    });
  });

  describe("summarizeRoster", () => {
    it("formats player count and each positional count in roster order", () => {
      const team: Team = {
        id: 1,
        name: "Reikland Reavers",
        raceId: "human",
        roster: [
          { positionalKey: "lineman", quantity: 7 },
          { positionalKey: "blitzer", quantity: 4 },
        ],
      };
      expect(summarizeRoster(team, [getRaceById("human")!])).toBe(
        "11 players · 7x Lineman · 4x Blitzer",
      );
    });

    it("renders the race name when a single positional type is used", () => {
      const team: Team = {
        id: 2,
        name: "Orc Crushers",
        raceId: "orc",
        roster: [{ positionalKey: "blitzer", quantity: 11 }],
      };
      expect(summarizeRoster(team, [getRaceById("orc")!])).toBe("11 players · 11x Blitzer");
    });
  });
});
