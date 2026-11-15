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

  it("the receiver decision comes AFTER the sequence: no side waits on `kicking`", () => {
    // Home wins 6–2 and the winner has not picked the receiver yet.
    const undecided: ActaDemoPreMatch = {
      ...full,
      kickDice: { home: 6, away: 2 },
      kicking: null,
    };
    // Both sides read complete from their own marks alone (S7.9): the
    // receiver picker lives outside the sequence.
    expect(sideCompleteOf(undecided, "home")).toBe(true);
    expect(sideCompleteOf(undecided, "away")).toBe(true);
    expect(sideCompleteOf({ ...undecided, kicking: "away" }, "home")).toBe(true);
    expect(sideCompleteOf({ ...undecided, kicking: "home" }, "home")).toBe(true);
    // The MATCH, however, still waits for the receiver decision.
    expect(preMatchComplete(undecided)).toBe(false);
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

/**
 * T9 · L39 — the kickoff is OUT of the demo flow: «…omitiremos la patada
 * inicial, eso se hara de manera externa». Confirming the receiver (the
 * «quién recibe» pick, `step: "kicking"`) resolves the initial kick
 * EXTERNALLY and starts the match DIRECTLY in turn 1 with the RECEIVING team
 * active. The kickoff machinery (gate, 2D6 table, duel actions) stays in the
 * codebase as reversible infrastructure — never reached by the flow.
 */
function fresh(): ActaDemoState {
  return actaDemoReducer(demoState("inicio"), {
    type: "reset",
    scenario: "inicio",
  });
}

describe("kicking → match start (T9 · L39: the kickoff is resolved externally)", () => {
  it("confirming the receiver starts the match DIRECTLY in turn 1 with the RECEIVER active", () => {
    let next = run({ step: "kickRoll", side: "home", die: 6 }, fresh());
    next = run({ step: "kickRoll", side: "away", die: 2 }, next);
    // Home wins the toss 6–2 and gives the ball away: away RECEIVES.
    next = run({ step: "kicking", kicking: "home" }, next);

    // Turn 1 with the RECEIVING team active (the one that keeps the ball /
    // attacks first) — never the kicker, never a stale fixture side.
    expect(next.matchStarted).toBe(true);
    expect(next.half).toBe(1);
    expect(next.turnNumber).toBe(1);
    expect(next.activeSide).toBe("away");
    expect(next.turnStarter).toBe("away");
    // The demo camera follows the active coach (same rule as endTurn).
    expect(next.viewerSide).toBe("away");

    // The inverse mapping: kicking "away" → home receives and opens turn 1.
    const inverse = run({ step: "kicking", kicking: "away" }, fresh());
    expect(inverse.activeSide).toBe("home");
    expect(inverse.turnStarter).toBe("home");
    expect(inverse.viewerSide).toBe("home");
  });

  it("the kickoff is resolved externally: no gate state left open and NO kickoff events recorded", () => {
    let next = run({ step: "kickRoll", side: "home", die: 6 }, fresh());
    next = run({ step: "kickRoll", side: "away", die: 2 }, next);
    next = run({ step: "kicking", kicking: "home" }, next);

    // The gate reads RESOLVED (it can never open) and the acta records NO
    // kickoff rows — the kick happened outside the app.
    expect(next.kickoff.registered).toBe(true);
    expect(next.kickoff.d1).toBeNull();
    expect(next.kickoff.d2).toBeNull();
    expect(next.events.filter((e) => e.kind === "kickoff")).toHaveLength(0);
  });

  it("the match does NOT start before the receiver decision", () => {
    let next = run({ step: "kickRoll", side: "home", die: 6 }, fresh());
    next = run({ step: "kickRoll", side: "away", die: 2 }, next);
    expect(next.matchStarted).toBe(false);
    expect(next.kickoff.registered).toBe(false);
  });
});
