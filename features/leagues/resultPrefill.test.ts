import { describe, expect, it } from "vitest";
import { buildResultPrefill } from "./resultPrefill";
import type { LiveMatchView } from "./api";

/**
 * Result prefill (LM-9/D8): maps a finished LiveMatch into the result modal's
 * INITIAL draft — scores + per-scorer TDs ONLY. MJP nominations, casualty
 * victims, and all other action counts stay coach input; the result POST's
 * validation (ΣTD == score, 6 MJP nominations, server rolls) stays authoritative.
 */

function finishedLive(): LiveMatchView {
  return {
    seq: 12,
    status: "finished",
    half: 2,
    turnNumber: 8,
    activeSide: "away",
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: 1000,
    elapsed: 3100,
    homeTurnMs: 1500,
    awayTurnMs: 1600,
    homeScore: 2,
    awayScore: 1,
    paused: false,
    finishedAt: 5000,
    events: [
      { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
      { seq: 2, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 2, payload: {}, at: 2000 },
      { seq: 3, kind: "td", side: "home", playerRosterId: "p1", half: 2, turnNumber: 1, payload: {}, at: 3000 },
      { seq: 4, kind: "td", side: "away", playerRosterId: "p3", half: 2, turnNumber: 6, payload: {}, at: 4000 },
      { seq: 5, kind: "casualty", side: "away", playerRosterId: "p3", half: 2, turnNumber: 1, payload: { band: "grave" }, at: 4500 },
      { seq: 6, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 5000 },
    ],
  };
}

describe("buildResultPrefill", () => {
  it("prefills home/away scores from the live scoreboard", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    expect(home.score).toBe(2);
    expect(away.score).toBe(1);
  });

  it("sets per-scorer TDs from the td events, summing repeat scorers", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    expect(home.players["p1"].tds).toBe(2); // p1 scored twice
    expect(away.players["p3"].tds).toBe(1);
  });

  it("does NOT touch MJP nominations, casualty victims, or other action counts", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    // MJP untouched (empty — coaches nominate 6).
    expect(home.mvpNominations).toEqual([]);
    expect(away.mvpNominations).toEqual([]);
    // Casualty victims untouched (the coach confirms/reports them).
    expect(home.casualties).toEqual([]);
    expect(away.casualties).toEqual([]);
    // A player who only caused a casualty gets 0 TDs; other actions stay 0.
    expect(away.players["p3"].casualties).toBe(0);
    expect(away.players["p3"].completions).toBe(0);
    expect(away.players["p3"].fouls).toBe(0);
    // A TD scorer's OTHER actions are untouched (only tds is set).
    expect(home.players["p1"].completions).toBe(0);
  });

  it("ignores non-td events and unknown roster ids", () => {
    const empty = buildResultPrefill({
      ...finishedLive(),
      events: [{ seq: 1, kind: "foul", side: "home", playerRosterId: "nope", half: 1, turnNumber: 1, payload: {}, at: 1 }],
      homeScore: 0,
      awayScore: 0,
    });
    expect(empty.home.players["nope"]).toBeUndefined();
    expect(empty.away.players).toEqual({});
  });

  it("produces a payload that satisfies the ΣTD == score guard", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    const homeTds = Object.values(home.players).reduce((s, a) => s + a.tds, 0);
    const awayTds = Object.values(away.players).reduce((s, a) => s + a.tds, 0);
    expect(homeTds).toBe(2);
    expect(awayTds).toBe(1);
  });
});
