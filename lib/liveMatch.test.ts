import { describe, expect, it } from "vitest";
import {
  consentStart,
  retractConsent,
  beginMatch,
  applyEndTurn,
  applyTD,
  applyCompletion,
  applyEndMatch,
  toLiveViewState,
  deriveLiveClock,
  isDisplayEvent,
  type LiveMatchState,
  type LiveMatchTransitionEvent,
} from "./liveMatch";

/**
 * Pure-transition tests for the live-match state machine with the two-phase
 * consent→ready→begin lifecycle (LM-11/LM-3) and the unified server-owned clock
 * (LM-5). `lib/result.test.ts` precedent: zero mocks, deterministic `now`.
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

describe("applyEndTurn — alternation + turn cap + half flip (LM-4)", () => {
  it("flips the active side and increments the turn", () => {
    const next = applyEndTurn(state(), { side: "home" }, 1100);
    expect(next.activeSide).toBe("away");
    expect(next.turnNumber).toBe(2);
  });

  it("rejects a double action (out-of-turn end)", () => {
    expect(() => applyEndTurn(state(), { side: "away" }, 1100)).toThrow("out");
  });

  it("flips to half 2 and away starts when half-1 turn 8 completes", () => {
    const atHalf1Turn8 = state({ activeSide: "home", half: 1, turnNumber: 8 });
    const next = applyEndTurn(atHalf1Turn8, { side: "home" }, 1100);
    expect(next.half).toBe(2);
    expect(next.turnNumber).toBe(1);
    expect(next.activeSide).toBe("away");
  });

  it("auto-finishes the match when half-2 turn 8 completes", () => {
    const atHalf2Turn8 = state({ activeSide: "away", half: 2, turnNumber: 8 });
    const next = applyEndTurn(atHalf2Turn8, { side: "away" }, 1100);
    expect(next.status).toBe("finished");
    expect(next.finishedAt).not.toBeNull();
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
  it("accepts exactly the 10 display kinds incl. the kickoff kinds (start|td|completion|casualty|foul|endHalf|endMatch|mvp|expensive_mistake|fan_factor)", () => {
    const displayKinds = ["start", "td", "completion", "casualty", "foul", "endHalf", "endMatch", "mvp", "expensive_mistake", "fan_factor"];
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
});
