import { describe, expect, it } from "vitest";

import {
  actingSideOf,
  captureAuthorOf,
  gameTurnSidesOf,
  turnSideOf,
  turnSideOfEvents,
  turnSidesOf,
  type TurnSideActive,
} from "./actaTurnSides";
import type { LiveMatchEventDto } from "./api";

/**
 * S3 («los turnos deberian tener el color de cada equipo»): the shared
 * turn → side derivation the header stepper pills tint by. The rule under
 * test:
 *  - every capture votes the side that ACTED (`actingSideOf`): scored
 *    actions vote their own side, a CAUSED casualty votes its CAUSER's side,
 *    a self-inflicted one votes nothing;
 *  - a turn's side is the unanimous non-null vote — mixed votes or no
 *    acting capture → null (AMBOS EQUIPOS / unknown);
 *  - the LIVE turn belongs to the active coach (`activeSide`) regardless of
 *    the vote; once not live the vote rules.
 *
 * S10.4 (T16 — L54 supersedes T8's capture-author grouping): the CARDS no
 * longer group by these votes. They group by the GAME TURN (`gameTurnSidesOf`)
 * and the vote seam now feeds the capture-author BADGE (`captureAuthorOf`) —
 * "quién la registró" (S10.4.2 role transparency). The tests below keep
 * pinning the vote contract (its consumer changed, its semantics did not).
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
  // WHY unchanged (T16): these assertions pin the CAPTURE AUTHOR, which the
  // regrouping did not change — its consumer moved from card grouping to the
  // capture-author badge (S10.4.2).
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
  // WHY unchanged (T16): this vote derivation still feeds the HEADER STEPPER
  // pills (`turnSidesOf` → ActaSheetHeader); the turn CARDS moved to the
  // game-turn rule (`gameTurnSidesOf`, below) and the vote's grouping role is
  // history (L54). The stepper contract is untouched by this change.
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

describe("captureAuthorOf — quién la registró (S10.4.2 badge source)", () => {
  it("is the acting side of the capture (a caused casualty → its CAUSER's side)", () => {
    const caused = event({
      kind: "casualty",
      side: "away",
      payload: { victimRosterId: "a2", causerRosterId: "h3", cause: "block" },
    });
    expect(captureAuthorOf(caused)).toBe("home");
    // A self-inflicted record falls back to its own side — the victim's coach
    // is the one who registered it.
    const selfInflicted = event({
      kind: "casualty",
      side: "away",
      payload: { victimRosterId: "a2", cause: "dodge" },
    });
    expect(captureAuthorOf(selfInflicted)).toBe("away");
  });
});

describe("gameTurnSidesOf — the GAME TURN of each capture (S10.4 / T16)", () => {
  const liveAt = (overrides: Partial<TurnSideActive> = {}) =>
    active({ status: "live", half: 1, turnNumber: 5, activeSide: "home", ...overrides });

  it("a capture lands on the half-turn its next «Fin Turno» boundary closes (demo feed)", () => {
    // The demo reducer stamps ONE `turnStart` per pass, AFTER the half-turn's
    // captures (actaDemoReducer endTurn — trailing marker naming the coach
    // whose turn just ended).
    const events = [
      event({ kind: "td", side: "home", turnNumber: 5 }),
      event({ kind: "turnStart", side: "home", turnNumber: 5 }),
      event({ kind: "completion", side: "away", turnNumber: 5 }),
      event({ kind: "turnStart", side: "away", turnNumber: 5 }),
    ];
    const sides = gameTurnSidesOf(events, active({ status: "live", half: 1, turnNumber: 6 }));
    expect(sides.get(events[0].seq)).toBe("home");
    expect(sides.get(events[2].seq)).toBe("away");
  });

  it("a victim-side injury captured during the attacker's turn lands on the ATTACKER's game turn (S10.4.1)", () => {
    // A placa a B: A's half-turn is being played; B (the victim's owner)
    // registers the injury of its own knocked-down player. The row belongs to
    // A's game turn — but its capture author (the badge) is B.
    const injury = event({
      kind: "casualty",
      side: "away",
      turnNumber: 5,
      payload: { victimRosterId: "a2", cause: "dodge" },
    });
    const passed = event({ kind: "turnStart", side: "home", turnNumber: 5 });
    const sides = gameTurnSidesOf([injury, passed], active({ status: "live", half: 1, turnNumber: 6 }));
    expect(sides.get(injury.seq)).toBe("home");
    expect(captureAuthorOf(injury)).toBe("away");
  });

  it("the half-turn being played resolves to the active coach mid-run — no re-group once the boundary lands", () => {
    const injury = event({
      kind: "casualty",
      side: "away",
      turnNumber: 5,
      payload: { victimRosterId: "a2", cause: "dodge" },
    });
    // Before any boundary: the open run IS the active coach's half-turn.
    expect(gameTurnSidesOf([injury], liveAt()).get(injury.seq)).toBe("home");
    // After the pass boundary lands the attribution is unchanged (no flicker).
    const passed = event({ kind: "turnStart", side: "home", turnNumber: 5 });
    expect(gameTurnSidesOf([injury, passed], liveAt()).get(injury.seq)).toBe("home");
  });

  it("marker-less feeds outside the live turn keep the capture-author attribution (legacy v5 saves)", () => {
    const caused = event({
      kind: "casualty",
      side: "away",
      turnNumber: 5,
      payload: { victimRosterId: "a2", causerRosterId: "h3", cause: "block" },
    });
    const sides = gameTurnSidesOf([caused], active({ status: "live", half: 1, turnNumber: 6 }));
    expect(sides.get(caused.seq)).toBe("home");
  });

  it("the live store's leading boundary pair (turn + turnStart) opens the half-turn it names", () => {
    // lib/liveMatch turnTransition stamps `turn` + `turnStart(nextActive)` at
    // the OPENING of the new half-turn (side = the INCOMING coach) — mirrored
    // demo convention; the `turn` row is its signature (demo feeds never).
    const events = [
      event({ kind: "turn", side: null, turnNumber: 5 }),
      event({ kind: "turnStart", side: "home", turnNumber: 5 }),
      event({ kind: "td", side: "home", turnNumber: 5 }),
      event({ kind: "turn", side: null, turnNumber: 5 }),
      event({ kind: "turnStart", side: "away", turnNumber: 5 }),
      event({ kind: "completion", side: "away", turnNumber: 5 }),
    ];
    const sides = gameTurnSidesOf(events, active({ status: "live", half: 1, turnNumber: 6 }));
    expect(sides.get(events[2].seq)).toBe("home");
    expect(sides.get(events[5].seq)).toBe("away");
  });

  it("neutral (side-null) captures carry no game turn — they stay on the AMBOS EQUIPOS card", () => {
    const weather = event({ kind: "weather", side: null, turnNumber: 5 });
    const sides = gameTurnSidesOf([weather], liveAt());
    expect(sides.has(weather.seq)).toBe(false);
  });
});
