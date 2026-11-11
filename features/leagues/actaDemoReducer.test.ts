import { describe, expect, it } from "vitest";

import { liveState, narrativeEvents } from "./actaFlow.fixtures";
import {
  actaDemoReducer,
  demoState,
  type ActaDemoAction,
  type ActaDemoState,
} from "./actaDemoReducer";

function state(overrides: Partial<ActaDemoState> = {}): ActaDemoState {
  return { ...demoState("primer-tercio"), ...overrides };
}

function reduce(
  initial: ActaDemoState,
  ...actions: ActaDemoAction[]
): ActaDemoState {
  return actions.reduce(actaDemoReducer, initial);
}

describe("actaDemoReducer — demo state machine (Phase 1)", () => {
  it("registerEvent appends the event in order and bumps only the requested side's score", () => {
    const s0 = state();
    const initialHome = s0.homeScore;
    const initialEvents = s0.events.length;
    const e1 = narrativeEvents[0];
    const e2 = narrativeEvents[1] ?? narrativeEvents[0];

    const s1 = reduce(s0, { type: "registerEvent", event: e1 });
    expect(s1.events).toEqual([...s0.events, e1]);
    expect(s1.homeScore).toBe(s0.homeScore);
    expect(s1.awayScore).toBe(s0.awayScore);

    const s2 = reduce(s1, {
      type: "registerEvent",
      event: e2,
      score: { side: "home" },
    });
    expect(s2.events).toEqual([...s0.events, e1, e2]);
    expect(s2.homeScore).toBe(s0.homeScore + 1);
    expect(s2.awayScore).toBe(s0.awayScore);

    // The reducer is pure: the source state is never mutated.
    expect(s0.events).toHaveLength(initialEvents);
    expect(s0.homeScore).toBe(initialHome);
  });

  it("endTurn advances the turn and flips the active side", () => {
    const s = reduce(
      state({ half: 1, turnNumber: 2, activeSide: "home" }),
      { type: "endTurn" },
    );
    expect(s.turnNumber).toBe(3);
    expect(s.activeSide).toBe("away");
    expect(s.half).toBe(1);
  });

  it("endTurn rolls 1T turn 8 into 2T turn 1", () => {
    const s = reduce(state({ half: 1, turnNumber: 8 }), { type: "endTurn" });
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(1);
  });

  it("endTurn after 2T turn 8 finishes the match instead of inventing a third half", () => {
    const s = reduce(
      state({ half: 2, turnNumber: 8, status: "live" }),
      { type: "endTurn" },
    );
    expect(s.status).toBe("finished");
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(8);
  });

  it("finish flips the status to finished", () => {
    const s = reduce(state({ status: "live" }), { type: "finish" });
    expect(s.status).toBe("finished");
  });

  it("openClosure is gated: only a finished match opens it", () => {
    const live = reduce(state({ status: "live" }), { type: "openClosure" });
    expect(live.closureOpen).toBe(false);

    const done = reduce(
      state({ status: "finished" }),
      { type: "openClosure" },
    );
    expect(done.closureOpen).toBe(true);
  });

  it("reset(scenario) jumps to the scenario preset, dropping demo progress", () => {
    const dirty = reduce(state(), { type: "finish" }, { type: "openClosure" });
    expect(dirty.closureOpen).toBe(true);

    const s = actaDemoReducer(dirty, {
      type: "reset",
      scenario: "segundo-tercio",
    });
    expect(s.status).toBe("live");
    expect(s.closureOpen).toBe(false);
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(5);
    expect(s.events.length).toBeGreaterThan(0);
  });

  it("the finished preset starts finished with its closure still closed", () => {
    const s = demoState("finalizado");
    expect(s.status).toBe("finished");
    expect(s.closureOpen).toBe(false);
    expect(s.half).toBe(2);
  });

  it("every preset keeps the fixture viewer context the Flow renders with", () => {
    const s = demoState("segundo-tercio");
    expect(s.viewerSide).toBe(liveState().viewerSide);
    expect(s.startedAt).toBe(liveState().startedAt);
  });
});
