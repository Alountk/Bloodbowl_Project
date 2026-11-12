import { describe, expect, it } from "vitest";

import {
  actingSideOf,
  turnSideOf,
  turnSideOfEvents,
  turnSidesOf,
  type TurnSideActive,
} from "./actaTurnSides";
import type { LiveMatchEventDto } from "./api";

/**
 * S3 («los turnos deberian tener el color de cada equipo»): the shared
 * turn → side derivation the timeline cards AND the header stepper pills
 * tint by. The rule under test:
 *  - every capture votes the side that ACTED (`actingSideOf`): scored
 *    actions vote their own side, a CAUSED casualty votes its CAUSER's side,
 *    a self-inflicted one votes nothing;
 *  - a turn's side is the unanimous non-null vote — mixed votes or no
 *    acting capture → null (AMBOS EQUIPOS / unknown);
 *  - the LIVE turn belongs to the active coach (`activeSide`) regardless of
 *    the vote; once not live the vote rules.
 */

let seq = 0;
function event(
  overrides: Partial<LiveMatchEventDto> & Pick<LiveMatchEventDto, "kind">,
): LiveMatchEventDto {
  seq += 1;
  return {
    seq,
    side: null,
    playerRosterId: null,
    half: 1,
    turnNumber: 1,
    payload: {},
    at: 0,
    ...overrides,
  };
}

/** The active slice; defaults to a finished half 2 so half 1 stays vote-only. */
function active(overrides: Partial<TurnSideActive> = {}): TurnSideActive {
  return { status: "finished", half: 2, turnNumber: 8, activeSide: "away", ...overrides };
}

describe("actingSideOf — the acting vote of one capture", () => {
  it("scored actions vote their own side; system cards vote nothing", () => {
    expect(actingSideOf(event({ kind: "td", side: "home" }))).toBe("home");
    expect(actingSideOf(event({ kind: "completion", side: "away" }))).toBe("away");
    expect(actingSideOf(event({ kind: "fan_factor", side: null }))).toBeNull();
    expect(actingSideOf(event({ kind: "weather", side: null }))).toBeNull();
  });

  it("a caused casualty votes its CAUSER's side and a self-inflicted one votes nothing", () => {
    const caused = event({
      kind: "casualty",
      side: "away",
      payload: { victimRosterId: "a2", causerRosterId: "h3", cause: "block" },
    });
    expect(actingSideOf(caused)).toBe("home");
    const selfInflicted = event({
      kind: "casualty",
      side: "away",
      payload: { victimRosterId: "a2", cause: "dodge", selfInflicted: true },
    });
    expect(actingSideOf(selfInflicted)).toBeNull();
  });
});

describe("turnSideOf — the turn → side derivation (S3)", () => {
  it("a turn's side is the unanimous acting vote of its captures", () => {
    const events = [
      event({ kind: "td", side: "home", turnNumber: 3 }),
      event({ kind: "completion", side: "home", turnNumber: 3 }),
    ];
    expect(turnSideOf(events, 1, 3, active())).toBe("home");
  });

  it("mixed acting votes fall back to null (AMBOS EQUIPOS)", () => {
    const events = [
      event({ kind: "td", side: "home", turnNumber: 3 }),
      event({ kind: "completion", side: "away", turnNumber: 3 }),
    ];
    expect(turnSideOf(events, 1, 3, active())).toBeNull();
  });

  it("a turn with no acting capture is null (unknown) — never invented", () => {
    const events = [
      event({ kind: "fan_factor", side: null, turnNumber: 3 }),
      event({ kind: "turnStart", side: "home", turnNumber: 3 }),
    ];
    expect(turnSideOf(events, 1, 3, active())).toBeNull();
  });

  it("the LIVE turn takes the active side even before any capture (or against the vote)", () => {
    const live = active({ status: "live", half: 1, turnNumber: 3, activeSide: "home" });
    expect(turnSideOf([], 1, 3, live)).toBe("home");
    // The live override is unconditional: the vote can never contradict
    // whose turn it is.
    const rivalCapture = [event({ kind: "td", side: "away", turnNumber: 3 })];
    expect(turnSideOf(rivalCapture, 1, 3, live)).toBe("home");
    // Only the ACTIVE round of the active half is overridden.
    expect(turnSideOf(rivalCapture, 1, 2, live)).toBeNull();
  });

  it("once not live the active round falls back to the event vote", () => {
    const events = [event({ kind: "completion", side: "home", turnNumber: 3 })];
    const finished = active({ status: "finished", half: 1, turnNumber: 3, activeSide: "away" });
    expect(turnSideOf(events, 1, 3, finished)).toBe("home");
  });

  it("turnSidesOf maps every turn of the half (index = turn - 1) and ignores the other half", () => {
    const events = [
      event({ kind: "td", side: "home", half: 1, turnNumber: 1 }),
      event({ kind: "td", side: "away", half: 2, turnNumber: 1 }),
      event({ kind: "completion", side: "away", half: 1, turnNumber: 8 }),
    ];
    const half1 = turnSidesOf(events, 1, active());
    expect(half1).toHaveLength(8);
    expect(half1[0]).toBe("home");
    expect(half1[7]).toBe("away");
    expect(half1[1]).toBeNull();
    // The same turn number of the OTHER half carries its own vote.
    const half2 = turnSidesOf(events, 2, active());
    expect(half2[0]).toBe("away");
  });

  it("turnSideOfEvents is the shared unanimous vote (exported seam)", () => {
    expect(turnSideOfEvents([event({ kind: "foul", side: "away" })])).toBe("away");
    expect(
      turnSideOfEvents([
        event({ kind: "foul", side: "away" }),
        event({ kind: "td", side: "home" }),
      ]),
    ).toBeNull();
    expect(turnSideOfEvents([])).toBeNull();
  });
});
