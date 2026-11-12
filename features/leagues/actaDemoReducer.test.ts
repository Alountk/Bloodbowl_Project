import { describe, expect, it } from "vitest";

import type { LiveCommand } from "./api";
import { liveState, narrativeEvents } from "./actaFlow.fixtures";
import {
  actaDemoReducer,
  demoState,
  type ActaDemoAction,
  type ActaDemoState,
} from "./actaDemoReducer";

const MAX_FIXTURE_SEQ = Math.max(...narrativeEvents.map((e) => e.seq));

function state(overrides: Partial<ActaDemoState> = {}): ActaDemoState {
  return { ...demoState("inicio"), ...overrides };
}

function reduce(
  initial: ActaDemoState,
  ...actions: ActaDemoAction[]
): ActaDemoState {
  return actions.reduce(actaDemoReducer, initial);
}

describe("actaDemoReducer — demo match state machine (dual-view demo)", () => {
  it("registerEvent stamps seq/half/turn/at and bumps only the requested side's score", () => {
    const s0 = state();
    const initialHome = s0.homeScore;

    const s1 = actaDemoReducer(s0, {
      type: "registerEvent",
      kind: "td",
      side: "home",
      score: { side: "home" },
    });
    const e1 = s1.events[s1.events.length - 1];
    expect(s1.events).toHaveLength(s0.events.length + 1);
    expect(e1.kind).toBe("td");
    expect(e1.side).toBe("home");
    expect(e1.half).toBe(s0.half);
    expect(e1.turnNumber).toBe(s0.turnNumber);
    // seqs must sort AFTER every fixture sample (ordering is seq-descending).
    expect(e1.seq).toBeGreaterThan(MAX_FIXTURE_SEQ);
    expect(e1.at).toBeGreaterThanOrEqual(s0.startedAt ?? 0);
    expect(s1.homeScore).toBe(initialHome + 1);
    expect(s1.awayScore).toBe(s0.awayScore);

    const s2 = actaDemoReducer(s1, { type: "registerEvent", kind: "completion", side: "away" });
    const e2 = s2.events[s2.events.length - 1];
    expect(e2.seq).toBeGreaterThan(e1.seq);
    expect(s2.homeScore).toBe(initialHome + 1);
    expect(s2.awayScore).toBe(s0.awayScore);

    // The reducer is pure: the source state is never mutated.
    expect(s0.events).toHaveLength(0);
    expect(s0.homeScore).toBe(initialHome);
  });

  it("submitCommand td records a td event and bumps that side's score", () => {
    const s = reduce(state(), {
      type: "submitCommand",
      command: { type: "td", side: "away", playerRosterId: "p1" },
    });
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("td");
    expect(e.side).toBe("away");
    expect(e.playerRosterId).toBe("p1");
    expect(s.awayScore).toBe(1);
    expect(s.homeScore).toBe(0);
  });

  it("submitCommand casualty carries the injury payload and never bumps the score", () => {
    const cmd: LiveCommand = {
      type: "casualty",
      side: "home",
      victimRosterId: "v1",
      causerRosterId: "c1",
      cause: "block",
      roll16: 11,
    };
    const s = reduce(state(), { type: "submitCommand", command: cmd });
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("casualty");
    expect(e.payload).toMatchObject({
      victimRosterId: "v1",
      causerRosterId: "c1",
      cause: "block",
      roll16: 11,
    });
    expect(s.homeScore).toBe(0);
    expect(s.awayScore).toBe(0);
  });

  it("endTurn command advances the turn, flips the active side and records the reason", () => {
    const s0 = state({ half: 1, turnNumber: 2, activeSide: "home", autoFollow: false, viewerSide: "home" });
    const s = reduce(s0, {
      type: "submitCommand",
      command: { type: "endTurn", side: "home", reason: "turnover" },
    });
    expect(s.turnNumber).toBe(3);
    expect(s.activeSide).toBe("away");
    expect(s.half).toBe(1);
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("turnStart");
    expect(e.payload).toMatchObject({ reason: "turnover" });
  });

  it("auto-follow moves the viewer perspective to the new active side on endTurn", () => {
    const on = reduce(
      state({ autoFollow: true, viewerSide: "home", activeSide: "home" }),
      { type: "submitCommand", command: { type: "endTurn", side: "home" } },
    );
    expect(on.viewerSide).toBe("away");

    const off = reduce(
      state({ autoFollow: false, viewerSide: "home", activeSide: "home" }),
      { type: "submitCommand", command: { type: "endTurn", side: "home" } },
    );
    expect(off.viewerSide).toBe("home");
  });

  it("switchPerspective changes only the viewer side", () => {
    const s = reduce(
      state({ viewerSide: "home", activeSide: "home", homeScore: 2 }),
      { type: "switchPerspective", side: "away" },
    );
    expect(s.viewerSide).toBe("away");
    expect(s.activeSide).toBe("home");
    expect(s.homeScore).toBe(2);
  });

  it("endTurn rolls 1T turn 8 into 2T turn 1 and records endHalf", () => {
    const s = reduce(
      state({ half: 1, turnNumber: 8 }),
      { type: "submitCommand", command: { type: "endTurn", side: "home" } },
    );
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(1);
    expect(s.events[s.events.length - 1].kind).toBe("endHalf");
  });

  it("endTurn after 2T turn 8 finishes the match and records endMatch", () => {
    const s = reduce(
      state({ half: 2, turnNumber: 8, status: "live" }),
      { type: "submitCommand", command: { type: "endTurn", side: "away" } },
    );
    expect(s.status).toBe("finished");
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(8);
    expect(s.events[s.events.length - 1].kind).toBe("endMatch");
  });

  it("acknowledgeEvent marks the matching seq and adds no event", () => {
    const s0 = reduce(state(), {
      type: "registerEvent",
      kind: "td",
      side: "home",
      score: { side: "home" },
    });
    const target = s0.events[s0.events.length - 1];
    const s = reduce(s0, {
      type: "submitCommand",
      command: { type: "acknowledgeEvent", eventSeq: target.seq, status: "ok" },
    });
    expect(s.events).toHaveLength(s0.events.length);
    expect(s.events[s.events.length - 1].ackStatus).toBe("ok");
  });

  it("finish flips the status to finished", () => {
    const s = reduce(state({ status: "live" }), { type: "finish" });
    expect(s.status).toBe("finished");
  });

  it("openClosure is gated: only an unfinished-submission finished match opens it", () => {
    const live = reduce(state({ status: "live" }), { type: "openClosure" });
    expect(live.closureOpen).toBe(false);

    const done = reduce(state({ status: "finished" }), { type: "openClosure" });
    expect(done.closureOpen).toBe(true);
  });

  it("submitClosure records the single submitter (acta V2 semantics)", () => {
    const s = reduce(state({ status: "finished" }), {
      type: "submitClosure",
      side: "away",
    });
    expect(s.submittedBy).toBe("away");
  });

  it("reset(inicio) returns a clean kickoff: 1T turn 1, 0-0, no events", () => {
    const dirty = reduce(
      state(),
      { type: "submitCommand", command: { type: "td", side: "home", playerRosterId: "p1" } },
      { type: "finish" },
      { type: "openClosure" },
    );
    expect(dirty.closureOpen).toBe(true);

    const s = actaDemoReducer(dirty, { type: "reset", scenario: "inicio" });
    expect(s.status).toBe("live");
    expect(s.half).toBe(1);
    expect(s.turnNumber).toBe(1);
    expect(s.homeScore).toBe(0);
    expect(s.awayScore).toBe(0);
    expect(s.events).toHaveLength(0);
    expect(s.closureOpen).toBe(false);
    expect(s.submittedBy).toBeNull();
    expect(s.nextSeq).toBeGreaterThan(MAX_FIXTURE_SEQ);
  });

  it("reset(scenario) jumps to the scenario preset, dropping demo progress", () => {
    const s = actaDemoReducer(state({ status: "finished", closureOpen: true }), {
      type: "reset",
      scenario: "segundo-tercio",
    });
    expect(s.status).toBe("live");
    expect(s.closureOpen).toBe(false);
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(5);
    expect(s.events.length).toBeGreaterThan(0);
  });

  it("hydrate restores a saved state and fills fields a newer model adds", () => {
    const saved = { ...demoState("segundo-tercio"), homeScore: 4 };
    const stripped = { ...saved } as Partial<ActaDemoState>;
    delete stripped.autoFollow;
    delete stripped.submittedBy;

    const s = actaDemoReducer(state(), {
      type: "hydrate",
      saved: stripped as ActaDemoState,
    });
    expect(s.homeScore).toBe(4);
    expect(s.half).toBe(2);
    expect(s.autoFollow).toBe(true);
    expect(s.submittedBy).toBeNull();
    expect(s.nextSeq).toBeGreaterThan(MAX_FIXTURE_SEQ);
  });

  it("the finished preset starts finished with its closure still closed", () => {
    const s = demoState("finalizado");
    expect(s.status).toBe("finished");
    expect(s.closureOpen).toBe(false);
    expect(s.half).toBe(2);
  });

  it("every preset keeps the fixture viewer context the composition renders with", () => {
    const s = demoState("segundo-tercio");
    expect(s.viewerSide).toBe(liveState().viewerSide);
    expect(s.startedAt).toBe(liveState().startedAt);
  });
});
