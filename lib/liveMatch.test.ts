import { describe, expect, it } from "vitest";
import {
  startMatch,
  applyEndTurn,
  applyTD,
  applyEndMatch,
  toLiveViewState,
  canStart,
  type LiveMatchState,
} from "./liveMatch";

/**
 * Pure-transition tests for the live-match state machine (LM-3/LM-4, D4/D5/D11).
 * `lib/result.test.ts` precedent — zero mocks, deterministic `now` values.
 */

const leagueEnabled = () => ({ turnClockEnabled: true, turnClockSeconds: 240 as const });
const leagueDisabled = () => ({ turnClockEnabled: false, turnClockSeconds: 240 as const });

function state(overrides: Partial<LiveMatchState> = {}): LiveMatchState {
  return {
    seq: 5,
    status: "live",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeClock: 240,
    awayClock: 240,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: 1000,
    finishedAt: null,
    league: leagueEnabled(),
    events: [],
    ...overrides,
  };
}

const scheduledFixture = { scheduled: true, played: false, result: false };
const playedFixture = { scheduled: true, played: true, result: false };
const pendingFixture = { scheduled: false, played: false, result: false };
const resultedFixture = { scheduled: true, played: true, result: true };

describe("startMatch / canStart — lifecycle guard (LM-3)", () => {
  it("starts a match only from a scheduled fixture with no result", () => {
    const started = startMatch(state({ status: "pending" }), scheduledFixture);
    expect(started.status).toBe("live");
    expect(started.half).toBe(1);
    expect(started.turnNumber).toBe(1);
    expect(started.activeSide).toBe("home");
  });

  it("rejects starting from a pending (unscheduled) fixture", () => {
    expect(() => startMatch(state({ status: "pending" }), pendingFixture)).toThrow("start");
  });

  it("rejects starting a played fixture or one carrying a result (409 semantics)", () => {
    expect(() => startMatch(state({ status: "pending" }), playedFixture)).toThrow("start");
    expect(() => startMatch(state({ status: "pending" }), resultedFixture)).toThrow("start");
  });

  it("rejects starting an already-live or finished match", () => {
    expect(canStart("live", scheduledFixture, leagueEnabled())).toBe(false);
    expect(canStart("finished", scheduledFixture, leagueEnabled())).toBe(false);
  });
});

describe("applyEndTurn — alternation + turn cap + half flip (LM-4)", () => {
  it("flips the active side and increments the turn", () => {
    const next = applyEndTurn(state(), { side: "home" });
    expect(next.activeSide).toBe("away");
    expect(next.turnNumber).toBe(2);
  });

  it("rejects a double action (out-of-turn end)", () => {
    expect(() => applyEndTurn(state(), { side: "away" })).toThrow("out");
  });

  it("flips to half 2 and away starts when half-1 turn 8 completes", () => {
    const atHalf1Turn8 = state({ activeSide: "home", half: 1, turnNumber: 8 });
    const next = applyEndTurn(atHalf1Turn8, { side: "home" });
    expect(next.half).toBe(2);
    expect(next.turnNumber).toBe(1);
    expect(next.activeSide).toBe("away");
  });

  it("auto-finishes the match when half-2 turn 8 completes", () => {
    const atHalf2Turn8 = state({ activeSide: "away", half: 2, turnNumber: 8 });
    const next = applyEndTurn(atHalf2Turn8, { side: "away" });
    expect(next.status).toBe("finished");
    expect(next.finishedAt).not.toBeNull();
  });
});

describe("applyTD — records event, scores, and auto-ends the turn (D11)", () => {
  it("increments the scoring side's score and auto-ends the turn", () => {
    const next = applyTD(state(), { side: "home", playerRosterId: "p-1" });
    expect(next.homeScore).toBe(1);
    expect(next.awayScore).toBe(0);
    expect(next.activeSide).toBe("away");
    // A turn event follows the TD (auto turn end per D11).
    expect(next.events.some((e) => e.kind === "td")).toBe(true);
  });

  it("finishes the match immediately when a TD is scored in half-2 turn 8 (D5)", () => {
    const atHalf2Turn8 = state({ half: 2, turnNumber: 8, activeSide: "away" });
    const next = applyTD(atHalf2Turn8, { side: "away", playerRosterId: "p-9" });
    expect(next.awayScore).toBe(1);
    expect(next.status).toBe("finished");
  });

  it("rejects an out-of-turn TD", () => {
    expect(() => applyTD(state(), { side: "away", playerRosterId: "p-2" })).toThrow("out");
  });
});

describe("end-of-match + clocks behavior", () => {
  it("applyEndMatch finishes the match with the current scoreboard", () => {
    const next = applyEndMatch(state({ homeScore: 1, awayScore: 0 }));
    expect(next.status).toBe("finished");
    expect(next.finishedAt).not.toBeNull();
  });

  it("toLiveViewState derives clockSeconds from state, not a constant (LM-5)", () => {
    // Home is active at clockStartedAt=1000. At now=1010, 10s elapsed → 230 left.
    const view = toLiveViewState(state({ homeClock: 240, awayClock: 240, clockStartedAt: 1000 }), 1010);
    expect(view.turnClockEnabled).toBe(true);
    expect(view.homeClock).toBe(230);
    expect(view.awayClock).toBe(240); // non-active clock never changes
    expect(view.paused).toBe(false);
  });

  it("leaves clock fields inert/null when the league disables clocks (LM-5)", () => {
    const view = toLiveViewState(
      state({ league: leagueDisabled(), homeClock: 120, awayClock: 120 }),
      1010,
    );
    expect(view.turnClockEnabled).toBe(false);
    expect(view.homeClock).toBeNull();
    expect(view.awayClock).toBeNull();
    expect(view.paused).toBeNull();
  });
});
