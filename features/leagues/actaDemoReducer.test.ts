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

    // The reducer is pure: the source state is never mutated. The "inicio"
    // preset carries the kickoff trio (start + weather + fan_factor).
    expect(s0.events).toHaveLength(3);
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
      band: "grave",
    });
    expect(s.homeScore).toBe(0);
    expect(s.awayScore).toBe(0);
  });

  it("submitCommand knockdown stamps the tackler-side derribo entry with the full chain payload (T17 · S10.1/S10.2)", () => {
    const s0 = state();
    const s = reduce(s0, {
      type: "submitCommand",
      command: {
        type: "knockdown",
        side: "home",
        causerRosterId: "k1",
        victimRosterId: "o1",
        blockDice: ["push", "defenderDown"],
        face: "defenderDown",
        armourRoll: 11,
        victimAv: 10,
        armourBroken: true,
      },
    });
    const e = s.events[s.events.length - 1];
    expect(s.events).toHaveLength(s0.events.length + 1);
    expect(e.kind).toBe("knockdown");
    // S10.4.1: the tackler's coach reports the placaje — the event's side is
    // the RECORDER's (the «Registrado por» badge derives from it).
    expect(e.side).toBe("home");
    expect(e.playerRosterId).toBe("k1");
    expect(e.payload).toEqual({
      causerRosterId: "k1",
      victimRosterId: "o1",
      blockDice: ["push", "defenderDown"],
      face: "defenderDown",
      armourRoll: 11,
      victimAv: 10,
      armourBroken: true,
    });
    expect(e.half).toBe(s0.half);
    expect(e.turnNumber).toBe(s0.turnNumber);
    expect(e.seq).toBeGreaterThan(MAX_FIXTURE_SEQ);
  });

  it("submitCommand knockdown omits the armour fields on the both-down row (T23 keeps its shipped shape — follow-ups ride their own rows)", () => {
    // WHY renamed (T23, intentional): S10.3 closed — the armour/injury
    // follow-ups of a both-down now exist as SEPARATE casualty rows; the
    // «Derribo» row keeps the payload shape pinned below.
    const s = reduce(state(), {
      type: "submitCommand",
      command: {
        type: "knockdown",
        side: "away",
        causerRosterId: "o2",
        victimRosterId: "k2",
        blockDice: ["bothDown"],
        face: "bothDown",
      },
    });
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("knockdown");
    expect(e.payload).toEqual({
      causerRosterId: "o2",
      victimRosterId: "k2",
      blockDice: ["bothDown"],
      face: "bothDown",
    });
    expect("armourRoll" in e.payload).toBe(false);
    expect("armourBroken" in e.payload).toBe(false);
  });

  it("submitCommand casualty keeps T21 band persistence on a both-down injury (marker + derived band land in the payload)", () => {
    // WHY new (T23, characterization of the shipped T21 path): the both-down
    // follow-up injuries are victim-owner casualty captures carrying the
    // DEC-1 marker. The band must persist on that path too (the victim-note
    // «Efecto» row reads it) — pinned so a payload regression is loud.
    const cmd: LiveCommand = {
      type: "casualty",
      side: "home",
      victimRosterId: "k1",
      cause: "block",
      roll16: 12,
      bothDown: true,
    };
    const s = reduce(state(), { type: "submitCommand", command: cmd });
    const e = s.events[s.events.length - 1];
    expect(e.payload).toMatchObject({
      victimRosterId: "k1",
      cause: "block",
      roll16: 12,
      bothDown: true,
      band: "grave",
    });
    // The injury is CAUSER-LESS (S10.4.1 — the badge names the recorder).
    expect("causerRosterId" in e.payload).toBe(false);
  });

  it("submitCommand weather records a side-less weather event with the value + d6 payload (S2)", () => {
    const s = reduce(state(), {
      type: "submitCommand",
      command: { type: "weather", value: "rain", roll: 5 },
    });
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("weather");
    expect(e.side).toBeNull();
    expect(e.playerRosterId).toBeNull();
    expect(e.payload).toEqual({ value: "rain", roll: 5 });
    // Weather never touches the scoreboard.
    expect(s.homeScore).toBe(0);
    expect(s.awayScore).toBe(0);
  });

  it("submitCommand weather without a d6 keeps the payload value-only (roll optional)", () => {
    const s = reduce(state(), {
      type: "submitCommand",
      command: { type: "weather", value: "blizzard" },
    });
    const e = s.events[s.events.length - 1];
    expect(e.kind).toBe("weather");
    expect(e.payload).toEqual({ value: "blizzard" });
  });

  it("endTurn hands the SAME turn number to the rival before advancing (pair rule)", () => {
    const s0 = state({
      half: 1,
      turnNumber: 1,
      activeSide: "away",
      autoFollow: false,
      viewerSide: "away",
    });
    const first = reduce(s0, {
      type: "submitCommand",
      command: { type: "endTurn", side: "away" },
    });
    expect(first.activeSide).toBe("home");
    expect(first.turnNumber).toBe(1); // home still plays turn 1

    const second = reduce(first, {
      type: "submitCommand",
      command: { type: "endTurn", side: "home" },
    });
    expect(second.activeSide).toBe("away");
    expect(second.turnNumber).toBe(2); // both coaches played 1 → turn 2 opens

    const third = reduce(second, {
      type: "submitCommand",
      command: { type: "endTurn", side: "away" },
    });
    expect(third.activeSide).toBe("home");
    expect(third.turnNumber).toBe(2); // home still plays turn 2
  });

  it("endTurn keeps 1T8 on the board while the turn's opener passes the baton", () => {
    const s0 = state({
      half: 1,
      turnNumber: 8,
      activeSide: "home",
      turnStarter: "home",
    });
    const s = reduce(s0, {
      type: "submitCommand",
      command: { type: "endTurn", side: "home" },
    });
    expect(s.half).toBe(1);
    expect(s.turnNumber).toBe(8); // away still plays turn 8 of half 1
    expect(s.activeSide).toBe("away");
  });

  it("endTurn finishes 2T8 only on the closing flip of the pair", () => {
    const s0 = state({
      half: 2,
      turnNumber: 8,
      status: "live",
      activeSide: "home",
      turnStarter: "home",
    });
    const mid = reduce(s0, {
      type: "submitCommand",
      command: { type: "endTurn", side: "home" },
    });
    expect(mid.status).toBe("live");
    expect(mid.turnNumber).toBe(8);

    const done = reduce(mid, {
      type: "submitCommand",
      command: { type: "endTurn", side: "away" },
    });
    expect(done.status).toBe("finished");
    expect(done.events[done.events.length - 1].kind).toBe("endMatch");
  });

  it("endTurn hands the SAME turn to the rival, flips the active side and records the reason", () => {
    const s0 = state({ half: 1, turnNumber: 2, activeSide: "home", turnStarter: "home", autoFollow: false, viewerSide: "home" });
    const s = reduce(s0, {
      type: "submitCommand",
      command: { type: "endTurn", side: "home", reason: "turnover" },
    });
    expect(s.turnNumber).toBe(2); // away plays turn 2 next — the number waits for the pair
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

  it("endTurn rolls 1T turn 8 into 2T turn 1 and records endHalf (pair closing flip)", () => {
    const s = reduce(
      state({ half: 1, turnNumber: 8, activeSide: "home", turnStarter: "away" }),
      { type: "submitCommand", command: { type: "endTurn", side: "home" } },
    );
    expect(s.half).toBe(2);
    expect(s.turnNumber).toBe(1);
    expect(s.turnStarter).toBe("home"); // the 2T opener flips with the halves
    expect(s.events[s.events.length - 1].kind).toBe("endHalf");
  });

  it("endTurn after 2T turn 8 finishes the match and records endMatch (pair closing flip)", () => {
    const s = reduce(
      state({ half: 2, turnNumber: 8, status: "live", activeSide: "away", turnStarter: "home" }),
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

  it("reset(inicio) returns a FRESH match: 1T turn 1, 0-0, start event only (pre-match wiped)", () => {
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
    // Restablecer = a FRESH match: every pre-match fact is gone until it is
    // captured again (the wizard walks from Paso 1) — user decision 2026-11-13.
    expect(s.events.map((e) => e.kind)).toEqual(["start"]);
    expect(s.inducements).toEqual({ home: [], away: [] });
    expect(s.preMatch?.fans).toEqual({ home: null, away: null });
    // The fixture's kickoff weather event still carries the CANONICAL kind for
    // its recorded 2D6 (lib/rules/weather `weatherFromRoll(4)` → "perfect"),
    // never an alias — reset simply drops it with the other pre-match facts.
    expect(demoState("inicio").events.map((e) => e.kind)).toEqual([
      "start",
      "weather",
      "fan_factor",
    ]);
    expect(demoState("inicio").events[1].payload).toEqual({
      value: "perfect",
      roll: 4,
    });
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

  it("the primer-tercio preset score matches its narrative feed (T22 residual)", () => {
    // WHY: the feed is the source of truth for anotaciones (T22); the preset
    // carried homeScore 1 over a slice(0,6) feed with 0 TDs (L74 residual).
    const s = demoState("primer-tercio");
    expect(s.homeScore).toBe(0);
  });

  it("every preset keeps the fixture viewer context the composition renders with", () => {
    const s = demoState("segundo-tercio");
    expect(s.viewerSide).toBe(liveState().viewerSide);
    expect(s.startedAt).toBe(liveState().startedAt);
  });
});
