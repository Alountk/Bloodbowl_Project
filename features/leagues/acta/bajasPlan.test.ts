import { describe, expect, it } from "vitest";
import type { ActaActionLine, ActaState, ActaTeamDraft } from "./actaState";
import {
  planBajas,
  reconcileRolls,
  setInjuryRoll,
  setPermanentRoll,
} from "./bajasPlan";

/**
 * s3b (RAU-122) — the pure Bajas planner (MAW-6). The payload's `injuryRoll` /
 * `permanentRoll` arrays live on the CAUSING team's draft, while
 * `deriveCasualtyEntries` tags each victim with the VICTIM's team. `planBajas`
 * is the bridge: it groups every derived casualty under the team that CAUSED it
 * so StepBajas renders and writes each roll against the correct draft.
 */

function casualtyLine(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
  return {
    id: "l1",
    rosterPlayerId: "h1",
    kind: "casualty",
    quantity: 1,
    victimTeam: "away",
    victimRosterPlayerId: "a1",
    ...overrides,
  };
}

function draft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
  return {
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions: [],
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
    ...overrides,
  };
}

function state(overrides: Partial<ActaState> = {}): ActaState {
  return { weather: "Perfecto", home: draft(), away: draft(), ...overrides };
}

describe("planBajas", () => {
  it("returns two empty lists when no casualty was recorded", () => {
    expect(planBajas(state())).toEqual({ home: [], away: [] });
  });

  it("groups each casualty under the team that CAUSED it, not the victim's team", () => {
    const plan = planBajas(
      state({
        home: draft({
          actions: [
            casualtyLine({
              id: "h",
              rosterPlayerId: "h1",
              victimTeam: "away",
              victimRosterPlayerId: "a1",
            }),
          ],
        }),
        away: draft({
          actions: [
            casualtyLine({
              id: "a",
              rosterPlayerId: "a1",
              victimTeam: "home",
              victimRosterPlayerId: "h2",
            }),
          ],
        }),
      }),
    );

    expect(plan.home).toHaveLength(1);
    expect(plan.home[0]).toMatchObject({
      index: 0,
      causingTeam: "home",
      victimTeam: "away",
      victimRosterPlayerId: "a1",
      injuryRoll: null,
      band: null,
      permanent: false,
      permanentIndex: null,
      permanentRoll: null,
    });
    expect(plan.away).toHaveLength(1);
    expect(plan.away[0]).toMatchObject({
      index: 0,
      causingTeam: "away",
      victimTeam: "home",
      victimRosterPlayerId: "h2",
    });
  });

  it("resolves the band from the causing draft's 1D16 and flags permanence", () => {
    const plan = planBajas(
      state({
        home: draft({
          actions: [
            casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
            casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
          ],
          injuryRoll: [9, 13],
        }),
      }),
    );

    expect(plan.home[0].band).toBe("apaleado");
    expect(plan.home[0].permanent).toBe(false);
    expect(plan.home[1].band).toBe("permanent");
    expect(plan.home[1].permanent).toBe(true);
  });

  it("maps the compressed permanent 1D6 list to the permanent victims only", () => {
    const plan = planBajas(
      state({
        home: draft({
          actions: [
            casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
            casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
          ],
          // Victim 1 is `grave` (12), victim 2 is `permanent` (13): the single
          // permanent roll belongs to victim 2 at permanent index 0.
          injuryRoll: [12, 13],
          permanentRoll: [5],
        }),
      }),
    );

    expect(plan.home[0].permanentIndex).toBeNull();
    expect(plan.home[0].permanentRoll).toBeNull();
    expect(plan.home[1].permanentIndex).toBe(0);
    expect(plan.home[1].permanentRoll).toBe(5);
  });
});

describe("setInjuryRoll", () => {
  it("writes the 1D16 to the causing team's draft and leaves the victim's side untouched", () => {
    const before = state({
      home: draft({
        actions: [
          casualtyLine({ id: "h", victimTeam: "away", victimRosterPlayerId: "a1" }),
        ],
      }),
      away: draft({
        actions: [
          casualtyLine({
            id: "a",
            rosterPlayerId: "a1",
            victimTeam: "home",
            victimRosterPlayerId: "h2",
          }),
        ],
      }),
    });

    const after = setInjuryRoll(before, "home", 0, 14);

    expect(after.home.injuryRoll[0]).toBe(14);
    expect(after.away.injuryRoll).toEqual([]);
  });

  it("clears a roll when null is passed, leaving no false 0", () => {
    const before = state({ home: draft({ injuryRoll: [7] }) });
    const after = setInjuryRoll(before, "home", 0, null);
    expect(after.home.injuryRoll[0] ?? null).toBeNull();
  });

  it("rebuilds the compressed 1D6 so a band edit cannot leak a stale permanent roll", () => {
    // A is permanent (13) with its 1D6 (5); B is apaleado (9).
    const before = state({
      home: draft({
        actions: [
          casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
          casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
        ],
        injuryRoll: [13, 9],
        permanentRoll: [5],
      }),
    });

    // Make B permanent (13), then heal A to apaleado (9): B is newly permanent,
    // so its 1D6 was never entered and must read null — NOT inherit A's stale 5.
    const bPermanent = setInjuryRoll(before, "home", 1, 13);
    const aHealed = setInjuryRoll(bPermanent, "home", 0, 9);
    const plan = planBajas(aHealed);

    expect(plan.home[0].permanent).toBe(false);
    expect(plan.home[1].permanent).toBe(true);
    expect(plan.home[1].permanentRoll).toBeNull();
  });

  it("keeps each existing permanent 1D6 on its own line across a band edit", () => {
    const before = state({
      home: draft({
        actions: [
          casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
          casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
          casualtyLine({ id: "l3", victimRosterPlayerId: "a3" }),
        ],
        // a1 permanent (1D6 5), a2 grave, a3 permanent (1D6 2).
        injuryRoll: [13, 9, 14],
        permanentRoll: [5, 2],
      }),
    });

    // a2 becomes permanent (13): it starts UNSET (a hole), while a1 keeps 5 and
    // a3 keeps 2 — the compressed list must not shift under the band edit.
    const after = setInjuryRoll(before, "home", 1, 13);

    expect(after.home.permanentRoll).toEqual([5, undefined, 2]);
  });
});

describe("setPermanentRoll", () => {
  it("writes the 1D6 to the causing team's draft and leaves the other side untouched", () => {
    const before = state();
    const after = setPermanentRoll(before, "away", 0, 6);
    expect(after.away.permanentRoll[0]).toBe(6);
    expect(after.home.permanentRoll).toEqual([]);
  });
});

/**
 * s3d corrective — `reconcileRolls` keeps every recorded roll bound to its
 * VICTIM when the Step-2 action lines change. The persisted arrays stay
 * positional, so the wizard re-aligns them by victim identity (plus occurrence)
 * the moment a line is deleted, inserted, or reordered.
 */
describe("reconcileRolls", () => {
  it("keeps a later roll with its victim when an EARLIER casualty line is deleted", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
      ],
      // a1 is apaleado (9); a2 is permanent (13) with its compressed 1D6 (5).
      injuryRoll: [9, 13],
      permanentRoll: [5],
    });

    const next = reconcileRolls(previous, [previous.actions[1]]);

    expect(next.injuryRoll).toEqual([13]);
    expect(next.permanentRoll).toEqual([5]);
  });

  it("leaves an inserted middle casualty UNSET without disturbing its neighbours", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
      ],
      injuryRoll: [9, 12],
    });
    const inserted = casualtyLine({ id: "l3", victimRosterPlayerId: "a3" });

    const next = reconcileRolls(previous, [
      previous.actions[0],
      inserted,
      previous.actions[1],
    ]);

    expect(next.injuryRoll[0]).toBe(9);
    expect(next.injuryRoll[1]).toBeUndefined();
    expect(next.injuryRoll[2]).toBe(12);
    expect(next.permanentRoll).toEqual([]);
  });

  it("follows the victim across a reorder and rebuilds the compressed permanent list", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
      ],
      // Both permanent: a1 → 1D6 5, a2 → 1D6 2.
      injuryRoll: [13, 14],
      permanentRoll: [5, 2],
    });

    const next = reconcileRolls(previous, [
      previous.actions[1],
      previous.actions[0],
    ]);

    expect(next.injuryRoll).toEqual([14, 13]);
    expect(next.permanentRoll).toEqual([2, 5]);
  });

  it("drops the roll when the victim's own line is removed and trims the cleared side", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
      ],
      injuryRoll: [9, 13],
      permanentRoll: [5],
    });

    const kept = reconcileRolls(previous, [previous.actions[0]]);
    expect(kept.injuryRoll).toEqual([9]);
    expect(kept.permanentRoll).toEqual([]);

    const cleared = reconcileRolls(previous, []);
    expect(cleared.injuryRoll).toEqual([]);
    expect(cleared.permanentRoll).toEqual([]);
  });

  it("keys a duplicated victim by occurrence so each injury keeps its own roll", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
        casualtyLine({ id: "l3", victimRosterPlayerId: "a2" }),
      ],
      // a2 is injured twice: occurrence 0 is grave (12), occurrence 1 permanent (13).
      injuryRoll: [9, 12, 13],
      permanentRoll: [5],
    });

    const next = reconcileRolls(previous, [
      previous.actions[1],
      previous.actions[2],
    ]);

    expect(next.injuryRoll).toEqual([12, 13]);
    expect(next.permanentRoll).toEqual([5]);
  });

  it("carries a permanent victim's compressed roll when an earlier permanent line is deleted", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a2" }),
        casualtyLine({ id: "l3", victimRosterPlayerId: "a3" }),
      ],
      // a1 permanent (1D6 5), a2 grave, a3 permanent (1D6 2).
      injuryRoll: [13, 9, 14],
      permanentRoll: [5, 2],
    });

    const next = reconcileRolls(previous, [
      previous.actions[1],
      previous.actions[2],
    ]);

    expect(next.injuryRoll).toEqual([9, 14]);
    expect(next.permanentRoll).toEqual([2]);
  });

  it("keeps the survivor's roll when the FIRST of two same-victim lines is deleted", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a1" }),
      ],
      // a1 is injured twice: line 1 apaleado (9), line 2 permanent (13, 1D6 5).
      injuryRoll: [9, 13],
      permanentRoll: [5],
    });

    const next = reconcileRolls(previous, [previous.actions[1]]);

    expect(next.injuryRoll).toEqual([13]);
    expect(next.permanentRoll).toEqual([5]);
  });

  it("keeps the survivor's roll when the FIRST same-victim line was left unset", () => {
    const injuryRoll: number[] = [];
    injuryRoll[1] = 13; // index 0 stays a hole (the first same-victim line unset)
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a1" }),
      ],
      injuryRoll,
      permanentRoll: [5],
    });

    const next = reconcileRolls(previous, [previous.actions[1]]);

    expect(next.injuryRoll).toEqual([13]);
    expect(next.permanentRoll).toEqual([5]);
  });

  it("keeps the second permanent roll when the FIRST of two duplicate permanent victims is deleted", () => {
    const previous = draft({
      actions: [
        casualtyLine({ id: "l1", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "l2", victimRosterPlayerId: "a1" }),
      ],
      // a1 is permanently injured twice: 13 (1D6 3) then 14 (1D6 6).
      injuryRoll: [13, 14],
      permanentRoll: [3, 6],
    });

    const next = reconcileRolls(previous, [previous.actions[1]]);

    expect(next.injuryRoll).toEqual([14]);
    expect(next.permanentRoll).toEqual([6]);
  });
});
