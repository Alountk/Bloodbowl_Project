import { describe, expect, it } from "vitest";
import type { ActaActionLine, ActaState, ActaTeamDraft } from "./actaState";
import { planBajas, setInjuryRoll, setPermanentRoll } from "./bajasPlan";

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
});

describe("setPermanentRoll", () => {
  it("writes the 1D6 to the causing team's draft and leaves the other side untouched", () => {
    const before = state();
    const after = setPermanentRoll(before, "away", 0, 6);
    expect(after.away.permanentRoll[0]).toBe(6);
    expect(after.home.permanentRoll).toEqual([]);
  });
});
