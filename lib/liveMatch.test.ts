import { describe, expect, it } from "vitest";
import {
  consentStart,
  retractConsent,
  beginMatch,
  applyEndTurn,
  applyTD,
  applyCompletion,
  applyEndMatch,
  proposeConcede,
  declineConcede,
  acceptConcede,
  proposeCasualty,
  confirmCasualty,
  toLiveViewState,
  deriveLiveClock,
  isDisplayEvent,
  parseResolutionState,
  EMPTY_RESOLUTION_STATE,
  type LiveMatchState,
  type LiveMatchTransitionEvent,
  type PendingCasualty,
} from "./liveMatch";

/**
 * Pure-transition tests for the live-match state machine with the two-phase
 * consent→ready→begin lifecycle (LM-11/LM-3), the unified server-owned clock
 * (LM-5), and the concession proposal/accept/decline (RAU-38). `lib/result.test.ts`
 * precedent: zero mocks, deterministic `now`.
 */

function state(overrides: Partial<LiveMatchState> = {}): LiveMatchState {
  return {
    seq: 5,
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
    pendingCasualty: null,
    mvpNominations: { home: null, away: null },
    resolutionState: EMPTY_RESOLUTION_STATE,
    events: [],
    ...overrides,
  };
}

function pending(overrides: Partial<LiveMatchState> = {}): LiveMatchState {
  return {
    seq: 0,
    status: "pending",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented: false,
    awayConsented: false,
    startedAt: null,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: null,
    finishedAt: null,
    concedeProposedBy: null,
    pendingCasualty: null,
    mvpNominations: { home: null, away: null },
    resolutionState: EMPTY_RESOLUTION_STATE,
    events: [],
    ...overrides,
  };
}

describe("consentStart — first consent creates a pending row (LM-11/LM-3)", () => {
  it("records the home consent and stays pending awaiting the away coach", () => {
    const next = consentStart(pending(), { side: "home" });
    expect(next.status).toBe("pending");
    expect(next.homeConsented).toBe(true);
    expect(next.awayConsented).toBe(false);
    // No clock runs before the first turn (LM-5).
    expect(next.startedAt).toBeNull();
    expect(next.clockStartedAt).toBeNull();
  });

  it("rejects consent on a played/result-loaded fixture (LM-3 replay rejected)", () => {
    expect(() => consentStart(pending({ status: "finished" }), { side: "home" })).toThrow("consent");
  });

  it("rejects consent on an already-live match (consent only pre-live)", () => {
    expect(() => consentStart(state(), { side: "away" })).toThrow("consent");
  });

  it("is a no-op when the same side already consented (idempotent)", () => {
    const base = pending({ homeConsented: true });
    const next = consentStart(base, { side: "home" });
    expect(next).toBe(base);
  });
});

describe("consentStart — second consent reaches ready (LM-11)", () => {
  it("becomes ready when both coaches have consented", () => {
    const next = consentStart(pending({ homeConsented: true }), { side: "away" });
    expect(next.status).toBe("ready");
    expect(next.homeConsented).toBe(true);
    expect(next.awayConsented).toBe(true);
  });

  it("waits indefinitely with no clock while exactly one coach consented", () => {
    const next = consentStart(pending(), { side: "home" });
    expect(next.status).toBe("pending");
    expect(next.startedAt).toBeNull();
  });
});

describe("retractConsent — clears the boolean and returns to pending (LM-11)", () => {
  it("clears a consented side's boolean and drops back to pending", () => {
    const next = retractConsent(pending({ homeConsented: true, status: "ready" }), { side: "home" });
    expect(next.homeConsented).toBe(false);
    expect(next.status).toBe("pending");
  });

  it("is a no-op when the side never consented", () => {
    const base = pending();
    const next = retractConsent(base, { side: "home" });
    expect(next).toBe(base);
  });
});

describe("beginMatch — ready→live ONLY via the first turn (LM-3/LM-11)", () => {
  it("requires ready + both consents before going live", () => {
    expect(() => beginMatch(pending(), 1000)).toThrow("ready");
    expect(() => beginMatch(pending({ homeConsented: true }), 1000)).toThrow("ready");
  });

  it("starts the first turn: live, half 1 turn 1 home active, kickoff anchor + segment start set", () => {
    const ready = pending({ homeConsented: true, awayConsented: true, status: "ready" });
    const next = beginMatch(ready, 1000);
    expect(next.status).toBe("live");
    expect(next.half).toBe(1);
    expect(next.turnNumber).toBe(1);
    expect(next.activeSide).toBe("home");
    expect(next.startedAt).toBe(1000);
    expect(next.clockStartedAt).toBe(1000);
    // The unified clock starts at the first-turn kickoff (LM-5).
    expect(next.homeTurnMs).toBe(0);
    expect(next.awayTurnMs).toBe(0);
  });

  it("appends a start event and a turnStart('home') event", () => {
    const ready = pending({ homeConsented: true, awayConsented: true, status: "ready" });
    const next = beginMatch(ready, 1000);
    const kinds = next.events.map((e) => e.kind);
    expect(kinds).toContain("start");
    expect(kinds).toContain("turnStart");
    const turnStart = next.events.find((e) => e.kind === "turnStart");
    expect(turnStart?.side).toBe("home");
  });

  it("rejects a begin on an already-live match", () => {
    expect(() => beginMatch(state(), 1000)).toThrow("begin");
  });

  it("splices kickoff events BEFORE start/turnStart with monotonic seqs and shares the same `at`", () => {
    const ready = pending({ homeConsented: true, awayConsented: true, status: "ready" });
    const kickoff: LiveMatchTransitionEvent[] = [
      {
        kind: "expensive_mistake" as const,
        side: "home",
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: { side: "home", roll: 1, bracket: "200k-295k", outcome: "minor-incident", amountLost: 20000, treasuryBefore: 234000, treasuryAfter: 214000 },
        at: 1000,
      },
      {
        kind: "expensive_mistake" as const,
        side: "away",
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: { side: "away", roll: 1, bracket: "500k-595k", outcome: "catastrophe", amountLost: 400000, treasuryBefore: 500000, treasuryAfter: 100000 },
        at: 1000,
      },
      {
        kind: "fan_factor" as const,
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } },
        at: 1000,
      },
    ];
    const next = beginMatch(ready, 1000, kickoff);
    // seq order: em(home), em(away), fan_factor, start, turnStart (LM-21).
    expect(next.events.map((e) => e.kind)).toEqual([
      "expensive_mistake",
      "expensive_mistake",
      "fan_factor",
      "start",
      "turnStart",
    ]);
    const withSeq = next.events.map((e) => [e.seq, e.kind]);
    expect(withSeq).toEqual([
      [1, "expensive_mistake"],
      [2, "expensive_mistake"],
      [3, "fan_factor"],
      [4, "start"],
      [5, "turnStart"],
    ]);
    // all five share the same `at` (= now) and half/turn 1/1.
    expect(next.events.every((e) => e.at === 1000)).toBe(true);
    expect(next.events.every((e) => e.half === 1 && e.turnNumber === 1)).toBe(true);
    const start = next.events.find((e) => e.kind === "start");
    const turnStart = next.events.find((e) => e.kind === "turnStart");
    expect(turnStart?.side).toBe("home");
    expect(start?.side).toBeNull();
  });

  it("begins without kickoff events (legacy/2-param call) with only start + turnStart", () => {
    const ready = pending({ homeConsented: true, awayConsented: true, status: "ready" });
    const next = beginMatch(ready, 1000);
    expect(next.events.map((e) => e.kind)).toEqual(["start", "turnStart"]);
  });
});

describe("applyEndTurn — round-shared turn numbers (home T1 → away T1 → home T2)", () => {
  it("flips to the other side WITHOUT advancing the round (home T1 → away T1)", () => {
    const next = applyEndTurn(state(), { side: "home" }, 1100);
    expect(next.activeSide).toBe("away");
    expect(next.turnNumber).toBe(1);
    expect(next.half).toBe(1);
    expect(next.status).toBe("live");
  });

  it("advances the round ONLY when the turn returns to the round starter (away T1 → home T2)", () => {
    const atAwayTurn1 = state({ activeSide: "away", turnNumber: 1 });
    const next = applyEndTurn(atAwayTurn1, { side: "away" }, 1100);
    expect(next.activeSide).toBe("home");
    expect(next.turnNumber).toBe(2);
    expect(next.half).toBe(1);
  });

  it("rejects a double action (out-of-turn end)", () => {
    expect(() => applyEndTurn(state(), { side: "away" }, 1100)).toThrow("out");
  });

  it("keeps the round number when the half-1 FOLLOWER completes a turn (home T8 → away T8)", () => {
    const atHomeTurn8 = state({ activeSide: "home", half: 1, turnNumber: 8 });
    const next = applyEndTurn(atHomeTurn8, { side: "home" }, 1100);
    expect(next.half).toBe(1);
    expect(next.turnNumber).toBe(8);
    expect(next.activeSide).toBe("away");
    expect(next.status).toBe("live");
  });

  it("flips to half 2 when the round STARTER completes their half-1 turn 8 (away T8 → half 2, away starts turn 1)", () => {
    const atAwayTurn8 = state({ activeSide: "away", half: 1, turnNumber: 8 });
    const next = applyEndTurn(atAwayTurn8, { side: "away" }, 1100);
    expect(next.half).toBe(2);
    expect(next.turnNumber).toBe(1);
    expect(next.activeSide).toBe("away");
    expect(next.status).toBe("live");
  });

  it("half 2 starts with the away side and keeps the round while the follower plays (away T1 → home T1)", () => {
    const atAwayTurn1Half2 = state({ activeSide: "away", half: 2, turnNumber: 1 });
    const next = applyEndTurn(atAwayTurn1Half2, { side: "away" }, 1100);
    expect(next.activeSide).toBe("home");
    expect(next.turnNumber).toBe(1);
    expect(next.half).toBe(2);
    expect(next.status).toBe("live");
  });

  it("auto-finishes the match when the half-2 round STARTER completes turn 8 (home T8 ends)", () => {
    const atHomeTurn8Half2 = state({ activeSide: "home", half: 2, turnNumber: 8 });
    const next = applyEndTurn(atHomeTurn8Half2, { side: "home" }, 1100);
    expect(next.status).toBe("finished");
    expect(next.finishedAt).not.toBeNull();
    expect(next.turnNumber).toBe(8);
  });

  it("does NOT finish while the half-2 FOLLOWER plays turn 8 (away T8 → home T8)", () => {
    const atAwayTurn8Half2 = state({ activeSide: "away", half: 2, turnNumber: 8 });
    const next = applyEndTurn(atAwayTurn8Half2, { side: "away" }, 1100);
    expect(next.status).toBe("live");
    expect(next.activeSide).toBe("home");
    expect(next.turnNumber).toBe(8);
  });
});

describe("applyTD — records event, scores, and auto-ends the turn (D11)", () => {
  it("increments the scoring side's score and auto-ends the turn", () => {
    const next = applyTD(state(), { side: "home", playerRosterId: "p-1" }, 1100);
    expect(next.homeScore).toBe(1);
    expect(next.awayScore).toBe(0);
    expect(next.activeSide).toBe("away");
    expect(next.events.some((e) => e.kind === "td")).toBe(true);
  });

  it("finishes the match immediately when a TD is scored in half-2 turn 8 (D5)", () => {
    const atHalf2Turn8 = state({ half: 2, turnNumber: 8, activeSide: "away" });
    const next = applyTD(atHalf2Turn8, { side: "away", playerRosterId: "p-9" }, 1100);
    expect(next.awayScore).toBe(1);
    expect(next.status).toBe("finished");
  });

  it("rejects an out-of-turn TD", () => {
    expect(() => applyTD(state(), { side: "away", playerRosterId: "p-2" }, 1100)).toThrow("out");
  });
});

describe("applyCompletion — records a ★1 completion event WITHOUT flipping the turn (LM-15)", () => {
  it("appends a `completion` event with the next monotonic seq and ★1 payload, no turn flip", () => {
    const next = applyCompletion(state(), { side: "home", playerRosterId: "p-1" }, 1100);
    // seq is monotonic: current 5 → next event seq 6 (row seq untouched, no flip).
    expect(next.events).toHaveLength(1);
    expect(next.events[0].seq).toBe(6);
    expect(next.events[0].kind).toBe("completion");
    expect(next.events[0].side).toBe("home");
    expect(next.events[0].playerRosterId).toBe("p-1");
    expect(next.events[0].half).toBe(1);
    expect(next.events[0].turnNumber).toBe(1);
    expect(next.events[0].at).toBe(1100);
    // ★1 rides in the payload; no SPP field on the row itself.
    expect(next.events[0].payload.spp).toBe(1);
    // NO turn flip: activeSide, half, turnNumber, clock, and score stay identical.
    expect(next.activeSide).toBe("home");
    expect(next.half).toBe(1);
    expect(next.turnNumber).toBe(1);
    expect(next.clockStartedAt).toBe(1000);
    expect(next.homeScore).toBe(0);
    expect(next.awayScore).toBe(0);
    expect(next.status).toBe("live");
  });

  it("appends for the away side too, monotonic seq continues from prior events", () => {
    const prior = state({ seq: 5, events: [{ seq: 5, kind: "turn", side: "home", playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 }] });
    const next = applyCompletion(prior, { side: "away", playerRosterId: "p-9" }, 1200);
    expect(next.events).toHaveLength(2);
    const completion = next.events[1];
    expect(completion.seq).toBe(6);
    expect(completion.side).toBe("away");
    expect(completion.payload.spp).toBe(1);
    // The turn is STILL home's — a completion never flips.
    expect(next.activeSide).toBe("home");
    expect(next.seq).toBe(5);
  });
});

describe("isDisplayEvent — server-side feed filter (LM-16)", () => {
  it("accepts exactly the 11 display kinds incl. the kickoff kinds and concede (start|td|completion|casualty|foul|endHalf|endMatch|mvp|expensive_mistake|fan_factor|concede)", () => {
    const displayKinds = ["start", "td", "completion", "casualty", "foul", "endHalf", "endMatch", "mvp", "expensive_mistake", "fan_factor", "concede"];
    for (const kind of displayKinds) {
      expect(isDisplayEvent(kind)).toBe(true);
    }
    // every non-display kind the model can persist is excluded
    for (const kind of ["turn", "turnStart", "requestTurn"]) {
      expect(isDisplayEvent(kind)).toBe(false);
    }
  });

  it("does NOT rely on a static allow-list for unknown future kinds (explicit rejection)", () => {
    // Unknown kinds are not display-worthy; the predicate must reject them so a
    // feed never leaks a new raw kind without a deliberate filter change.
    expect(isDisplayEvent("interception")).toBe(false);
    expect(isDisplayEvent("")).toBe(false);
    expect(isDisplayEvent("blitz")).toBe(false);
  });
});

describe("proposeConcede — only while live, one proposal at a time (RAU-38)", () => {
  it("sets concedeProposedBy to the proposing side on a live match", () => {
    const next = proposeConcede(state(), "home");
    expect(next.concedeProposedBy).toBe("home");
    // No event and no other state change — the proposal is purely the flag.
    expect(next.events).toHaveLength(0);
    expect(next.status).toBe("live");
  });

  it("is an idempotent no-op when the SAME side retries while the proposal is pending", () => {
    const base = state({ concedeProposedBy: "home" });
    const next = proposeConcede(base, "home");
    expect(next).toBe(base);
  });

  it("rejects a second proposal from the OTHER side while one is pending", () => {
    expect(() => proposeConcede(state({ concedeProposedBy: "home" }), "away")).toThrow("already");
  });

  it("rejects a propose outside live (pending/ready/finished)", () => {
    expect(() => proposeConcede(pending(), "home")).toThrow("live");
    expect(() => proposeConcede(pending({ status: "ready" }), "home")).toThrow("live");
    expect(() => proposeConcede(state({ status: "finished", concedeProposedBy: null }), "home")).toThrow("live");
  });
});

describe("declineConcede — the NON-proposer clears the proposal (RAU-38)", () => {
  it("clears concedeProposedBy so the match continues", () => {
    const next = declineConcede(state({ concedeProposedBy: "home" }), "away");
    expect(next.concedeProposedBy).toBeNull();
    expect(next.status).toBe("live");
    expect(next.events).toHaveLength(0);
  });

  it("is a no-op when no proposal is pending (retry-safe)", () => {
    const base = state();
    expect(declineConcede(base, "home")).toBe(base);
  });

  it("rejects the PROPOSER declining their own proposal", () => {
    expect(() => declineConcede(state({ concedeProposedBy: "home" }), "home")).toThrow("own");
  });
});

describe("acceptConcede — the NON-proposer accepts → finished + concede event (RAU-38)", () => {
  it("finishes the match, records the acceptor as winner in the payload and nulls the proposal", () => {
    const next = acceptConcede(state({ concedeProposedBy: "home", homeScore: 1, awayScore: 0 }), "away", 1100);
    expect(next.status).toBe("finished");
    expect(next.finishedAt).toBe(1100);
    expect(next.concedeProposedBy).toBeNull();
    // The concede event side is the SURRENDERING side (the proposer, home).
    const concede = next.events.find((e) => e.kind === "concede");
    expect(concede).toBeTruthy();
    expect(concede!.side).toBe("home");
    expect(concede!.payload.winnerSide).toBe("away");
    expect(concede!.seq).toBe(6);
    expect(concede!.at).toBe(1100);
    expect(concede!.half).toBe(1);
    expect(concede!.turnNumber).toBe(1);
    // The scoreboard stays untouched — a concession records the victory on the
    // fixture, never the live scoreboard.
    expect(next.homeScore).toBe(1);
    expect(next.awayScore).toBe(0);
  });

  it("rejects when the ACCEPTOR is the proposer", () => {
    expect(() => acceptConcede(state({ concedeProposedBy: "home" }), "home", 1100)).toThrow("own");
  });

  it("rejects when no proposal is pending", () => {
    expect(() => acceptConcede(state(), "away", 1100)).toThrow("no concede");
  });

  it("rejects when the match is not live (already finished or never begun)", () => {
    expect(() => acceptConcede(state({ status: "finished", concedeProposedBy: "home" }), "away", 1100)).toThrow("live");
    expect(() => acceptConcede(pending({ concedeProposedBy: "home" }), "away", 1100)).toThrow("live");
  });

  it("bumps the ACTIVE accumulator before finishing (LM-5 parity with applyEndMatch)", () => {
    // home active, clockStartedAt 1000 → accepting at 1100 banks +100ms for home.
    const next = acceptConcede(state({ concedeProposedBy: "away" }), "home", 1100);
    expect(next.homeTurnMs).toBe(100);
    expect(next.clockStartedAt).toBeNull();
    expect(next.paused).toBe(false);
  });
});

describe("proposeCasualty — active coach proposes, one pending at a time (RAU-39)", () => {
  const proposal = {
    side: "home" as const,
    victimRosterId: "p9",
    causerRosterId: "p1",
    cause: "blitz" as const,
    roll16: 13,
    roll6: 4,
  };

  it("sets pendingCasualty on a live match when the caller is the ACTIVE side", () => {
    const next = proposeCasualty(state(), proposal);
    expect(next.pendingCasualty).toEqual({
      proposerSide: "home",
      victimRosterId: "p9",
      causerRosterId: "p1",
      cause: "blitz",
      roll16: 13,
      roll6: 4,
    });
    // No event and no other state change — the proposal is purely the flag.
    expect(next.events).toHaveLength(0);
    expect(next.status).toBe("live");
    expect(next.activeSide).toBe("home");
  });

  it("omits roll6 when the attacker did not roll it (non-permanent likely)", () => {
    const next = proposeCasualty(state(), { ...proposal, roll6: undefined });
    expect(next.pendingCasualty).toEqual({
      proposerSide: "home",
      victimRosterId: "p9",
      causerRosterId: "p1",
      cause: "blitz",
      roll16: 13,
    });
    expect("roll6" in next.pendingCasualty!).toBe(false);
  });

  it("rejects a propose outside live (pending/ready/finished)", () => {
    expect(() => proposeCasualty(pending(), proposal)).toThrow("live");
    expect(() => proposeCasualty(pending({ status: "ready" }), proposal)).toThrow("live");
    expect(() => proposeCasualty(state({ status: "finished" }), proposal)).toThrow("live");
  });

  it("rejects a second proposal while one is pending (no idempotent retry — the rolls differ)", () => {
    const pendingState = state({
      pendingCasualty: { proposerSide: "home", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13 },
    });
    expect(() => proposeCasualty(pendingState, proposal)).toThrow("already");
  });

  it("rejects a propose from the NON-active side (out-of-turn)", () => {
    expect(() => proposeCasualty(state(), { ...proposal, side: "away" })).toThrow("active");
  });

  it("rejects invalid rolls: roll16 must be an integer in 1..16, roll6 in 1..6", () => {
    expect(() => proposeCasualty(state(), { ...proposal, roll16: 0 })).toThrow("roll16");
    expect(() => proposeCasualty(state(), { ...proposal, roll16: 17 })).toThrow("roll16");
    expect(() => proposeCasualty(state(), { ...proposal, roll16: 1.5 })).toThrow("roll16");
    expect(() => proposeCasualty(state(), { ...proposal, roll6: 0 })).toThrow("roll6");
    expect(() => proposeCasualty(state(), { ...proposal, roll6: 7 })).toThrow("roll6");
  });
});

describe("confirmCasualty — the defender confirms, band derived server-side (RAU-39)", () => {
  function withPending(over: Partial<PendingCasualty> = {}): LiveMatchState {
    return state({
      pendingCasualty: {
        proposerSide: "home",
        victimRosterId: "p9",
        causerRosterId: "p1",
        cause: "blitz",
        roll16: 13,
        roll6: 4,
        ...over,
      },
    });
  }

  it("appends the casualty event on the VICTIM's side and clears the proposal", () => {
    const next = confirmCasualty(withPending(), "away", 1100);
    expect(next.pendingCasualty).toBeNull();
    expect(next.events).toHaveLength(1);
    const ev = next.events[0];
    expect(ev.kind).toBe("casualty");
    // side = the VICTIM's side = the OPPOSITE of the proposer (home).
    expect(ev.side).toBe("away");
    expect(ev.playerRosterId).toBe("p9");
    expect(ev.seq).toBe(6);
    expect(ev.at).toBe(1100);
    expect(ev.half).toBe(1);
    expect(ev.turnNumber).toBe(1);
    expect(ev.payload).toEqual({
      victimRosterId: "p9",
      causerRosterId: "p1",
      cause: "blitz",
      roll16: 13,
      roll6: 4,
      band: "permanent",
      permanentAttribute: "ps",
    });
    // No turn flip, no clock change — the match continues on the same turn.
    expect(next.activeSide).toBe("home");
    expect(next.clockStartedAt).toBe(1000);
    expect(next.status).toBe("live");
  });

  it("derives the band from the 1D16 table: 8→bruise, 10→apaleado, 12→grave, 14→permanent, 16→dead", () => {
    const cases: [number, string][] = [
      [8, "bruise"],
      [9, "apaleado"],
      [10, "apaleado"],
      [11, "grave"],
      [12, "grave"],
      [13, "permanent"],
      [14, "permanent"],
      [15, "dead"],
      [16, "dead"],
    ];
    for (const [roll16, band] of cases) {
      const permanent = roll16 === 13 || roll16 === 14;
      const next = confirmCasualty(
        withPending({ roll16, roll6: permanent ? 3 : undefined }),
        "away",
        1100,
      );
      expect(next.events[0].payload.band).toBe(band);
    }
  });

  it("resolves the permanent attribute from the roll6 (1-2→ar, 3→mv, 4→ps, 5→ag, 6→st)", () => {
    const cases: [number, string][] = [
      [1, "ar"],
      [2, "ar"],
      [3, "mv"],
      [4, "ps"],
      [5, "ag"],
      [6, "st"],
    ];
    for (const [roll6, attr] of cases) {
      const next = confirmCasualty(withPending({ roll16: 14, roll6 }), "away", 1100);
      expect(next.events[0].payload.permanentAttribute).toBe(attr);
    }
  });

  it("rejects a permanent band without the roll6 attribute roll", () => {
    expect(() => confirmCasualty(withPending({ roll16: 13, roll6: undefined }), "away", 1100)).toThrow("roll6");
  });

  it("rejects the PROPOSER confirming their own proposal", () => {
    expect(() => confirmCasualty(withPending(), "home", 1100)).toThrow("own");
  });

  it("rejects a confirm with no pending proposal", () => {
    expect(() => confirmCasualty(state(), "away", 1100)).toThrow("no casualty");
  });

  it("rejects a confirm outside live (finished or pre-live)", () => {
    expect(() =>
      confirmCasualty(state({ status: "finished", pendingCasualty: withPending().pendingCasualty }), "away", 1100),
    ).toThrow("live");
    expect(() => confirmCasualty(pending({ pendingCasualty: withPending().pendingCasualty }), "away", 1100)).toThrow("live");
  });
});

describe("end-of-match", () => {
  it("applyEndMatch finishes the match with the current scoreboard", () => {
    const next = applyEndMatch(state({ homeScore: 1, awayScore: 0 }), 1100);
    expect(next.status).toBe("finished");
    expect(next.finishedAt).not.toBeNull();
  });
});

describe("unified clock — deriveLiveClock recomputes server-side (LM-5)", () => {
  it("derives inFlight for the active side only since the segment start", () => {
    const clock = deriveLiveClock(
      { status: "live", activeSide: "home", paused: false, clockStartedAt: 1000, homeTurnMs: 5000, awayTurnMs: 3000 },
      1100,
    );
    expect(clock.homeTurnMs).toBe(5100); // 5000 + 100ms in-flight
    expect(clock.awayTurnMs).toBe(3000); // non-active untouched
  });

  it("excludes pause time (no in-flight while paused); recomputes from persisted values", () => {
    const clock = deriveLiveClock(
      { status: "live", activeSide: "home", paused: true, clockStartedAt: 1000, homeTurnMs: 5000, awayTurnMs: 3000 },
      1200,
    );
    expect(clock.paused).toBe(true);
    expect(clock.homeTurnMs).toBe(5000);
    expect(clock.awayTurnMs).toBe(3000);
  });

  it("computes elapsed as the sum of both accumulated sides", () => {
    const clock = deriveLiveClock(
      { status: "live", activeSide: "away", paused: false, clockStartedAt: 1000, homeTurnMs: 5000, awayTurnMs: 3000 },
      1100,
    );
    expect(clock.homeTurnMs).toBe(5000);
    expect(clock.awayTurnMs).toBe(3100);
    expect(clock.elapsed).toBe(8100);
  });
});

describe("toLiveViewState — unified-clock DTO (LM-5, D19)", () => {
  it("exposes per-side accumulators, elapsed, consents, startedAt — no per-turn clock fields", () => {
    const view = toLiveViewState(
      state({ status: "pending", activeSide: "home", homeConsented: true, awayConsented: false, startedAt: null, paused: false, clockStartedAt: null }),
      Date.now(),
    );
    expect(view.homeTurnMs).toBe(0);
    expect(view.awayTurnMs).toBe(0);
    expect(view.elapsed).toBe(0);
    expect(view.homeConsented).toBe(true);
    expect(view.awayConsented).toBe(false);
    expect(view.status).toBe("pending");
    // The deprecated per-turn fields are gone from the DTO.
    expect("turnClockEnabled" in view).toBe(false);
    expect("homeClock" in view).toBe(false);
    expect("awayClock" in view).toBe(false);
  });

  it("propagates a per-viewer viewerSide and derived accumulators at time of read", () => {
    const view = toLiveViewState(
      state({ status: "live", activeSide: "home", homeConsented: true, awayConsented: true, startedAt: 1000, clockStartedAt: 1000, homeTurnMs: 5000, awayTurnMs: 3000, paused: false }),
      1100,
      { viewerSide: "home" },
    );
    expect(view.viewerSide).toBe("home");
    expect(view.homeTurnMs).toBe(5100);
    expect(view.awayTurnMs).toBe(3000);
  });

  it("exposes the per-side resolution wizard state (defaults while unfinished)", () => {
    const view = toLiveViewState(state({ status: "finished" }), 2000);
    expect(view.resolutionState).toEqual(EMPTY_RESOLUTION_STATE);
  });
});

describe("parseResolutionState — the per-side resolution wizard cursor (additive)", () => {
  it("collapses null / malformed values to the EMPTY per-side state (never crashes)", () => {
    expect(parseResolutionState(null)).toEqual(EMPTY_RESOLUTION_STATE);
    expect(parseResolutionState("junk")).toEqual(EMPTY_RESOLUTION_STATE);
    expect(parseResolutionState([])).toEqual(EMPTY_RESOLUTION_STATE);
    expect(parseResolutionState({ home: "x" })).toEqual(EMPTY_RESOLUTION_STATE);
  });

  it("parses a persisted per-side shape and keeps the recorded progress", () => {
    const parsed = parseResolutionState({
      home: { step: "fans", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      away: { step: "mvp", fansDone: true, fans: { roll: 4, before: 3, after: 4, direction: "up" }, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
    });
    expect(parsed.home.step).toBe("fans");
    expect(parsed.away.step).toBe("mvp");
    expect(parsed.away.fans).toEqual({ roll: 4, before: 3, after: 4, direction: "up" });
    expect(parsed.home.fans).toBeNull();
  });

  it("defaults a side whose entry is missing/malformed without crashing the other", () => {
    const parsed = parseResolutionState({
      home: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
    });
    expect(parsed.home.step).toBe("done");
    expect(parsed.away).toEqual(EMPTY_RESOLUTION_STATE.away);
  });
});
