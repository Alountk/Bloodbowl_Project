import { describe, expect, it } from "vitest";

import type { LiveMatchEventDto, MatchDetail } from "./api";
import { fanFactorOf, inducementsOf, latestWeather } from "./actaPreMatch";

function ev(seq: number, kind: string, payload: Record<string, unknown>): LiveMatchEventDto {
  return { seq, kind, side: null, playerRosterId: null, half: 1, turnNumber: 1, payload, at: 0 };
}

describe("actaPreMatch — feed derivations (S1/S4)", () => {
  it("latestWeather: the highest-seq weather event wins over earlier ones and the result", () => {
    const events = [
      ev(2, "weather", { value: "sun", roll: 4 }),
      ev(9, "weather", { value: "rain", roll: 2 }),
    ];
    expect(latestWeather(events, "blizzard")).toEqual({ value: "rain", roll: 2 });
  });

  it("latestWeather: no event falls back to the reported result weather with no roll", () => {
    expect(latestWeather([], "sun")).toEqual({ value: "sun", roll: null });
  });

  it("latestWeather: no event and no result resolves to empty (header renders Estándar)", () => {
    expect(latestWeather([], null)).toEqual({ value: null, roll: null });
  });

  it("fanFactorOf: reads the side rows of the latest fan_factor event", () => {
    const events = [
      ev(3, "fan_factor", {
        home: { base: 4, dice: 3, total: 7 },
        away: { base: 3, dice: 2, total: 5 },
      }),
      ev(8, "fan_factor", {
        home: { base: 5, dice: 1, total: 6 },
        away: { base: 3, dice: 4, total: 7 },
      }),
    ];
    expect(fanFactorOf(events, "home")).toEqual({ base: 5, dice: 1, total: 6 });
    expect(fanFactorOf(events, "away")).toEqual({ base: 3, dice: 4, total: 7 });
  });

  it("fanFactorOf: no event or a malformed side resolves to null (never invented)", () => {
    expect(fanFactorOf([], "home")).toBeNull();
    expect(fanFactorOf([ev(3, "fan_factor", { home: "oops", away: null })], "home")).toBeNull();
    expect(fanFactorOf([ev(3, "fan_factor", { home: "oops", away: null })], "away")).toBeNull();
  });

  it("inducementsOf: the live cart wins and maps ids to catalog display names", () => {
    const detail = {
      live: {
        inducements: {
          home: [{ id: "bribes", count: 1 }, { id: "bloodweiser-kegs", count: 2 }],
          away: [],
        },
      },
      result: null,
    } as unknown as Pick<MatchDetail, "live" | "result">;
    expect(inducementsOf(detail, "home")).toEqual([
      { name: "Sobornos", count: 1 },
      { name: "Barriles de Bloodweiser", count: 2 },
    ]);
    expect(inducementsOf(detail, "away")).toEqual([]);
  });

  it("inducementsOf: falls back to the result snapshot cards, then to empty", () => {
    const detail = {
      live: null,
      result: {
        scores: {
          away: { inducements: { budget: 50, cards: [{ name: "Sobornos", count: 1 }] } },
          home: { inducements: null },
        },
      },
    } as unknown as Pick<MatchDetail, "live" | "result">;
    expect(inducementsOf(detail, "away")).toEqual([{ name: "Sobornos", count: 1 }]);
    expect(inducementsOf(detail, "home")).toEqual([]);
  });
});
