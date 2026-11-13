import { describe, expect, it } from "vitest";

import { weatherFromRoll } from "@/lib/rules/weather";

import {
  actaDemoReducer,
  demoState,
  preMatchComplete,
  sideCompleteOf,
  type ActaDemoPreMatch,
  type ActaDemoState,
} from "./actaDemoReducer";
import type { PreMatchCommit } from "./actaPreMatchWizard";

/**
 * commitPreMatch — per-side capture (S2c): each coach commits ONLY their own
 * roll/cart («cada usuario deberia ver el suyo»); the reducer derives the
 * shared acta events (`fan_factor` merged per side, `weather` on the 2D6 sum)
 * and keeps the per-side progress so the «Lo que ha sucedido» report can
 * inform every confirmed fact.
 */

function run(commit: PreMatchCommit, from: ActaDemoState = demoState("inicio")) {
  return actaDemoReducer(from, {
    type: "commitPreMatch",
    commit,
  } as never);
}

describe("commitPreMatch — per-side capture (S2c)", () => {
  it("fanRoll commits my line and derives a merged fan_factor event (rival's line kept)", () => {
    const next = run({
      step: "fanRoll",
      side: "home",
      line: { base: 4, dice: 2, total: 6 },
    });
    const last = [...next.events].reverse().find((e) => e.kind === "fan_factor");
    expect(last?.payload).toMatchObject({
      home: { base: 4, dice: 2, total: 6 },
      away: { base: 3, dice: 2, total: 5 },
    });
  });

  it("weatherRoll from both coaches resolves the 2D6 weather event", () => {
    let next = run({ step: "weatherRoll", side: "home", die: 1 });
    expect(next.events.filter((e) => e.kind === "weather")).toHaveLength(1);
    next = run({ step: "weatherRoll", side: "away", die: 6 }, next);
    expect(next.events.filter((e) => e.kind === "weather")).toHaveLength(2);
    const last = [...next.events].reverse().find((e) => e.kind === "weather");
    expect(last?.payload).toMatchObject({
      roll: 7,
      value: weatherFromRoll(7).kind,
    });
  });

  it("inducements replace ONLY the committing side and mark that side done", () => {
    const next = run({
      step: "inducements",
      side: "home",
      items: [{ id: "bloodweiser-kegs", count: 1 }],
    });
    expect(next.inducements?.home).toEqual([
      { id: "bloodweiser-kegs", count: 1 },
    ]);
    // The fixture's away cart is untouched.
    expect(next.inducements?.away).toEqual([{ id: "weather-mage", count: 1 }]);
    expect(next.preMatch?.inducementsDone).toMatchObject({
      home: true,
      away: false,
    });
  });

  it("kickRoll + kicking record the opposed dice and the winner's decision", () => {
    let next = run({ step: "kickRoll", side: "home", die: 5 });
    next = run({ step: "kickRoll", side: "away", die: 3 }, next);
    expect(next.preMatch?.kickDice).toMatchObject({ home: 5, away: 3 });
    next = run({ step: "kicking", kicking: "home" }, next);
    expect(next.preMatch?.kicking).toBe("home");
  });

  it("kickTie clears both dice for the shared re-roll", () => {
    let next = run({ step: "kickRoll", side: "home", die: 4 });
    next = run({ step: "kickRoll", side: "away", die: 4 }, next);
    next = run({ step: "kickTie" }, next);
    expect(next.preMatch?.kickDice).toMatchObject({ home: null, away: null });
    expect(next.preMatch?.kicking).toBeNull();
  });
});

describe("sideCompleteOf — ONE side's derived completion (S7.3/S7.4)", () => {
  const full: ActaDemoPreMatch = {
    fans: {
      home: { base: 4, dice: 2, total: 6 },
      away: { base: 3, dice: 1, total: 4 },
    },
    weatherDice: { home: 3, away: 5 },
    kickDice: { home: 6, away: 2 },
    inducementsDone: { home: true, away: true },
    kicking: "away",
  };

  it("is true only when THAT side holds every mark; each single miss is incomplete", () => {
    expect(sideCompleteOf(full, "home")).toBe(true);
    expect(sideCompleteOf(full, "away")).toBe(true);
    // null is never complete.
    expect(sideCompleteOf(null, "home")).toBe(false);
    // Each single missing mark on MY side keeps my side incomplete.
    expect(
      sideCompleteOf({ ...full, fans: { home: null, away: full.fans.away } }, "home"),
    ).toBe(false);
    expect(
      sideCompleteOf({ ...full, weatherDice: { home: null, away: 5 } }, "home"),
    ).toBe(false);
    expect(
      sideCompleteOf({ ...full, inducementsDone: { home: false, away: true } }, "home"),
    ).toBe(false);
    expect(
      sideCompleteOf({ ...full, kickDice: { home: null, away: 2 } }, "home"),
    ).toBe(false);
    // A missing mark on the RIVAL side never blocks MY side.
    expect(
      sideCompleteOf({ ...full, fans: { home: full.fans.home, away: null } }, "home"),
    ).toBe(true);
  });

  it("the toss resolution: only the WINNING side waits for the kicking decision", () => {
    // Home wins 6–2 but the winner has not decided yet (kicking null).
    const undecided: ActaDemoPreMatch = {
      ...full,
      kickDice: { home: 6, away: 2 },
      kicking: null,
    };
    expect(sideCompleteOf(undecided, "home")).toBe(false);
    // The loser is complete regardless of the winner's decision.
    expect(sideCompleteOf(undecided, "away")).toBe(true);
    // The winner completes the moment the decision lands (whoever kicks).
    expect(sideCompleteOf({ ...undecided, kicking: "away" }, "home")).toBe(true);
    expect(sideCompleteOf({ ...undecided, kicking: "home" }, "home")).toBe(true);
  });

  it("a kick tie leaves the toss undecided: neither side waits on `kicking`", () => {
    const tied: ActaDemoPreMatch = {
      ...full,
      kickDice: { home: 4, away: 4 },
      kicking: null,
    };
    expect(sideCompleteOf(tied, "home")).toBe(true);
    expect(sideCompleteOf(tied, "away")).toBe(true);
  });
});

describe("preMatchComplete — the match really starts only when every mark is captured", () => {
  const full: ActaDemoPreMatch = {
    fans: {
      home: { base: 4, dice: 2, total: 6 },
      away: { base: 3, dice: 1, total: 4 },
    },
    weatherDice: { home: 3, away: 5 },
    kickDice: { home: 6, away: 2 },
    inducementsDone: { home: true, away: true },
    kicking: "home",
  };

  it("is true only when BOTH sides hold every mark; any single miss is incomplete", () => {
    expect(preMatchComplete(full)).toBe(true);
    // null is never complete.
    expect(preMatchComplete(null)).toBe(false);
    // Each single missing mark is enough to keep the match unstarted.
    expect(preMatchComplete({ ...full, kicking: null })).toBe(false);
    expect(
      preMatchComplete({ ...full, inducementsDone: { home: true, away: false } }),
    ).toBe(false);
    expect(preMatchComplete({ ...full, kickDice: { home: 6, away: null } })).toBe(
      false,
    );
    expect(
      preMatchComplete({ ...full, weatherDice: { home: null, away: 5 } }),
    ).toBe(false);
    expect(
      preMatchComplete({ ...full, fans: { home: null, away: full.fans.away } }),
    ).toBe(false);
  });
});
