import { describe, expect, it } from "vitest";
import { buildResultPrefill } from "./resultPrefill";
import type { LiveMatchView, LiveMatchEventDto } from "./api";
import { actaPrefill } from "./acta/actaState";
import { planBajas } from "./acta/bajasPlan";
import { buildScoredCommand } from "./liveActionEntry";
import { applyScoredAction, type LiveMatchState } from "@/lib/liveMatch";

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
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null }, resolutionState: { home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false }, away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false } },
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

  it("carries casualty victims and every action count; MJP nominations stay coach input", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    // MJP untouched (empty — coaches nominate 6; it is missing data, asked at closure).
    expect(home.mvpNominations).toEqual([]);
    expect(away.mvpNominations).toEqual([]);
    // The casualty victim IS carried now (LM-13: no captured event is re-keyed).
    // The fixture's legacy-style casualty (no roll16) stays PENDING.
    expect(home.casualties).toEqual([]);
    expect(away.casualties).toEqual([
      { team: "away", rosterPlayerId: "p3", injuryRoll: null, permanentRoll: null },
    ]);
    // The victim is not credited a CAUSED casualty (no causer on the event).
    expect(away.players["p3"].casualties).toBe(0);
    expect(away.players["p3"].completions).toBe(0);
    expect(away.players["p3"].fouls).toBe(0);
    // A TD scorer's OTHER actions stay 0 when they recorded none.
    expect(home.players["p1"].completions).toBe(0);
  });

  it("carries every captured action even for roster ids it cannot validate (the result POST stays authoritative)", () => {
    const carried = buildResultPrefill({
      ...finishedLive(),
      events: [{ seq: 1, kind: "foul", side: "home", playerRosterId: "nope", half: 1, turnNumber: 1, payload: {}, at: 1 }],
      homeScore: 0,
      awayScore: 0,
    });
    // A captured foul is carried, never dropped — roster membership is the
    // server-side result POST's validation, not the prefill's (S3 no re-keying).
    expect(carried.home.players["nope"].fouls).toBe(1);
    expect(carried.away.players).toEqual({});
  });

  it("produces a payload that satisfies the ΣTD == score guard", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    const homeTds = Object.values(home.players).reduce((s, a) => s + a.tds, 0);
    const awayTds = Object.values(away.players).reduce((s, a) => s + a.tds, 0);
    expect(homeTds).toBe(2);
    expect(awayTds).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Slice E (T4) — LM-13 / match-result deltas: the prefill carries EVERY kind.
// ---------------------------------------------------------------------------

function ev(
  seq: number,
  kind: string,
  side: "home" | "away" | null,
  playerRosterId: string | null,
  payload: Record<string, unknown> = {},
): LiveMatchEventDto {
  return { seq, kind, side, playerRosterId, half: 1, turnNumber: 1, payload, at: 1000 + seq };
}

/**
 * The match-result delta scenario VERBATIM: a live match with 2 TDs,
 * 1 completion, 1 casualty and 1 foul. Score 2-0 so ΣTD == score holds.
 */
function fiveEventsLive(): LiveMatchView {
  return {
    ...finishedLive(),
    homeScore: 2,
    awayScore: 0,
    events: [
      ev(1, "td", "home", "p1"),
      ev(2, "td", "home", "p2"),
      ev(3, "completion", "home", "p3"),
      // Roll-inclusive captured casualty: home p4 caused it on away a1 (roll16 11 → grave).
      ev(4, "casualty", "away", "a1", {
        victimRosterId: "a1",
        causerRosterId: "p4",
        cause: "block",
        roll16: 11,
        band: "grave",
      }),
      ev(5, "foul", "home", "p5", { victimRosterId: "a2" }),
      ev(6, "endMatch", null, null),
    ],
  };
}

describe("buildResultPrefill — LM-13: prefill carries every kind (Slice E)", () => {
  it("Scenario (match-result): 2 TDs + 1 completion + 1 casualty + 1 foul all appear in the pre-filled acta actions", () => {
    const draft = buildResultPrefill(fiveEventsLive());
    // Draft level: every captured action is carried per player (no re-keying).
    expect(draft.home.players["p1"].tds).toBe(1);
    expect(draft.home.players["p2"].tds).toBe(1);
    expect(draft.home.players["p3"].completions).toBe(1);
    expect(draft.home.players["p4"].casualties).toBe(1);
    expect(draft.home.players["p5"].fouls).toBe(1);
    // The casualty victim is carried too (never re-keyed).
    expect(draft.home.casualties).toEqual([
      {
        team: "away",
        rosterPlayerId: "a1",
        causerRosterPlayerId: "p4",
        injuryRoll: 11,
        permanentRoll: null,
      },
    ]);

    // Acta level: all FIVE events appear as pre-filled acta action lines.
    const state = actaPrefill(draft);
    const homeKinds = state.home.actions.map((l) => l.kind).sort();
    expect(homeKinds).toEqual(["casualty", "completion", "foul", "td", "td"]);
    expect(state.home.actions.filter((l) => l.kind === "casualty")).toEqual([
      expect.objectContaining({
        rosterPlayerId: "p4",
        victimTeam: "away",
        victimRosterPlayerId: "a1",
      }),
    ]);
  });

  it("Scenario (match-result, no double entry): captured rolls are not re-asked; only missing data stays open", () => {
    const state = actaPrefill(buildResultPrefill(fiveEventsLive()));
    // The captured 1D16 rides into the Bajas slot — not asked again.
    expect(state.home.injuryRoll).toEqual([11]);
    const plan = planBajas(state);
    expect(plan.home[0]).toMatchObject({ injuryRoll: 11, band: "grave", victimRosterPlayerId: "a1" });
    // Missing data stays for the closure surface: MVP + fans are asked.
    expect(state.home.mvpGrantee).toBe("");
    expect(state.home.fanRoll).toBeNull();
  });

  it("Scenario (LM-13): touchdowns, a completion, an interception, a casualty and a foul all appear without re-entry", () => {
    const live: LiveMatchView = {
      ...fiveEventsLive(),
      events: [
        ev(1, "td", "home", "p1"),
        ev(2, "completion", "home", "p3"),
        ev(3, "interception", "away", "a3"),
        ev(4, "casualty", "away", "a1", {
          victimRosterId: "a1",
          causerRosterId: "p4",
          cause: "block",
          roll16: 9,
          band: "apaleado",
        }),
        ev(5, "foul", "home", "p5", { victimRosterId: "a2" }),
        ev(6, "endMatch", null, null),
      ],
    };
    const draft = buildResultPrefill(live);
    expect(draft.home.players["p1"].tds).toBe(1);
    expect(draft.home.players["p3"].completions).toBe(1);
    expect(draft.away.players["a3"].interceptions).toBe(1);
    expect(draft.home.players["p4"].casualties).toBe(1);
    expect(draft.home.players["p5"].fouls).toBe(1);
    const state = actaPrefill(draft);
    const kinds = [...state.home.actions, ...state.away.actions].map((l) => l.kind).sort();
    expect(kinds).toEqual(["casualty", "completion", "foul", "interception", "td"]);
  });

  it("Scenario (LM-13): a casualty with a PENDING injury roll survives derivation as pending", () => {
    const live: LiveMatchView = {
      ...fiveEventsLive(),
      events: [
        ev(1, "casualty", "away", "a1", {
          victimRosterId: "a1",
          causerRosterId: "p4",
          cause: "blitz",
        }),
        ev(2, "endMatch", null, null),
      ],
    };
    const draft = buildResultPrefill(live);
    // Carried (not dropped) and PENDING (never silently resolved).
    expect(draft.home.casualties).toEqual([
      {
        team: "away",
        rosterPlayerId: "a1",
        causerRosterPlayerId: "p4",
        injuryRoll: null,
        permanentRoll: null,
      },
    ]);
    // The acta keeps the casualty line and asks the roll in the closure surface.
    const state = actaPrefill(draft);
    expect(state.home.actions).toEqual([
      expect.objectContaining({ kind: "casualty", victimRosterPlayerId: "a1" }),
    ]);
    const plan = planBajas(state);
    expect(plan.home[0]).toMatchObject({ injuryRoll: null, band: null, victimRosterPlayerId: "a1" });
  });

  it("round-trip (capture → prefill) for the new kinds: interception, throw-team-mate, landed-safe", () => {
    // Capture through the real command entry + pure recorder, then derive.
    const base = liveStateForCapture();
    const cmds = [
      buildScoredCommand("interception", "home", "p3"),
      buildScoredCommand("throwTeamMate", "home", "p4"),
      buildScoredCommand("landedSafe", "home", "p6"),
    ];
    let state = base;
    for (const cmd of cmds) {
      if (cmd.type !== "interception" && cmd.type !== "throwTeamMate" && cmd.type !== "landedSafe") {
        throw new Error("unexpected capture command");
      }
      state = applyScoredAction(
        state,
        { kind: cmd.type, side: cmd.side, playerRosterId: cmd.playerRosterId },
        5000,
      );
    }
    const events: LiveMatchEventDto[] = state.events.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      side: e.side,
      playerRosterId: e.playerRosterId,
      half: e.half,
      turnNumber: e.turnNumber,
      payload: e.payload,
      at: e.at,
    }));
    const draft = buildResultPrefill({ ...fiveEventsLive(), events });
    expect(draft.home.players["p3"].interceptions).toBe(1);
    expect(draft.home.players["p4"].throwTeamMates).toBe(1);
    expect(draft.home.players["p6"].landedSafe).toBe(1);
    const stateActa = actaPrefill(draft);
    const kinds = stateActa.home.actions.map((l) => l.kind).sort();
    expect(kinds).toEqual(["interception", "landedSafe", "throwTeamMate"]);
  });

  it("keeps the existing TD/score prefill shape unchanged (kinds it already carried)", () => {
    const { home, away } = buildResultPrefill(finishedLive());
    expect(home.score).toBe(2);
    expect(away.score).toBe(1);
    expect(home.players["p1"]).toEqual({
      tds: 2,
      casualties: 0,
      completions: 0,
      interceptions: 0,
      fouls: 0,
      throwTeamMates: 0,
      landedSafe: 0,
    });
  });

  it("carries a self-inflicted casualty (no causer) on the victim's own team with no PE count", () => {
    const live: LiveMatchView = {
      ...fiveEventsLive(),
      events: [
        ev(1, "casualty", "home", "p2", {
          victimRosterId: "p2",
          cause: "crowd",
          roll16: 3,
          band: "bruise",
        }),
        ev(2, "endMatch", null, null),
      ],
    };
    const draft = buildResultPrefill(live);
    expect(draft.home.casualties).toEqual([
      {
        team: "home",
        rosterPlayerId: "p2",
        injuryRoll: 3,
        permanentRoll: null,
      },
    ]);
    // Nobody is credited a caused casualty (bb2025: self-inflicted awards no PE).
    expect(draft.home.players).toEqual({});
  });

  it("dedupes one victim into one injury: a later resolved capture supersedes the pending record", () => {
    const live: LiveMatchView = {
      ...fiveEventsLive(),
      events: [
        ev(1, "casualty", "away", "a1", {
          victimRosterId: "a1",
          causerRosterId: "p4",
          cause: "block",
        }),
        ev(2, "casualty", "away", "a1", {
          victimRosterId: "a1",
          causerRosterId: "p5",
          cause: "blitz",
          roll16: 16,
          band: "dead",
        }),
        ev(3, "endMatch", null, null),
      ],
    };
    const draft = buildResultPrefill(live);
    expect(draft.home.casualties).toEqual([
      {
        team: "away",
        rosterPlayerId: "a1",
        causerRosterPlayerId: "p5",
        injuryRoll: 16,
        permanentRoll: null,
      },
    ]);
    // One wound = one casualty count (the superseded pending capture adds none).
    expect(draft.home.players["p4"]?.casualties ?? 0).toBe(0);
    expect(draft.home.players["p5"].casualties).toBe(1);
  });
});

/** A minimal live state for pure-capture round trips (home active, half 1 turn 1). */
function liveStateForCapture(): LiveMatchState {
  return {
    seq: 0,
    status: "live",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: 1000,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: 1000,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: {
      home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
    },
    lastTurnReason: null,
    events: [],
  };
}
