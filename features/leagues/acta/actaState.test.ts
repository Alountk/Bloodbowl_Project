import { describe, expect, it } from "vitest";
import { awardPeForActions, PE_CASUALTY } from "@/lib/rules/pe";
import {
  actaPrefill,
  buildActaPayload,
  emptyActaState,
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";

/**
 * S2 (RAU-122): the pure wizard state + payload assembly. `buildActaPayload`
 * MUST emit the additive S1 contract fields (`ff`, `neverHeld` → `heldBall`,
 * `fanRoll`, `injuryRoll`, `permanentRoll`, direct `mvp.grantee`, top-level
 * `duration` + `inducements`) and aggregate the free-form action lines into the
 * per-player `ResultPlayerAction` rows the route already consumes.
 */

function line(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
  return {
    id: "l1",
    rosterPlayerId: "h1",
    kind: "td",
    quantity: 1,
    ...overrides,
  };
}

function teamDraft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
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
  return {
    weather: "Perfecto",
    home: teamDraft(),
    away: teamDraft(),
    ...overrides,
  };
}

describe("emptyActaState", () => {
  it("starts both teams empty with no recorded actions", () => {
    const empty = emptyActaState();
    expect(empty.home.score).toBe(0);
    expect(empty.away.score).toBe(0);
    expect(empty.home.actions).toEqual([]);
    expect(empty.away.actions).toEqual([]);
    expect(empty.home.mvpGrantee).toBe("");
  });
});

describe("buildActaPayload", () => {
  it("maps the Contexto fields and the neverHeld → heldBall inversion", () => {
    const payload = buildActaPayload(
      state({
        weather: "Lluvioso",
        duration: 130,
        home: teamDraft({ ff: 5, neverHeld: true, inducements: 70_000 }),
        away: teamDraft({ ff: 3, neverHeld: false }),
      }),
    );
    expect(payload.weather).toBe("Lluvioso");
    expect(payload.duration).toBe(130);
    expect(payload.home.ff).toBe(5);
    expect(payload.home.neverHeld).toBe(true);
    expect(payload.home.ballHeld).toBe(false);
    expect(payload.away.ff).toBe(3);
    expect(payload.away.ballHeld).toBe(true);
    expect(payload.inducements?.home?.budget).toBe(70_000);
    expect(payload.inducements?.away?.budget).toBe(0);
  });

  it("carries the scores and the single direct MVP grantee per team", () => {
    const payload = buildActaPayload(
      state({
        home: teamDraft({ score: 2, mvpGrantee: "h1" }),
        away: teamDraft({ score: 1, mvpGrantee: "a2" }),
      }),
    );
    expect(payload.home.score).toBe(2);
    expect(payload.away.score).toBe(1);
    expect(payload.home.mvp.grantee).toBe("h1");
    expect(payload.away.mvp.grantee).toBe("a2");
    expect(payload.home.mvp.nominations).toEqual([]);
  });

  it("sends a null grantee when no MVP was selected", () => {
    const payload = buildActaPayload(state());
    expect(payload.home.mvp.grantee).toBeNull();
  });

  it("aggregates action lines into per-player rows and derives the victims", () => {
    const payload = buildActaPayload(
      state({
        home: teamDraft({
          actions: [
            line({ id: "h1", rosterPlayerId: "h1", kind: "td", quantity: 2 }),
            line({ id: "h2", rosterPlayerId: "h1", kind: "completion", quantity: 1 }),
            line({
              id: "h3",
              rosterPlayerId: "h2",
              kind: "casualty",
              quantity: 1,
              victimTeam: "away",
              victimRosterPlayerId: "a1",
            }),
          ],
        }),
        away: teamDraft({
          actions: [
            line({
              id: "a1",
              rosterPlayerId: "a1",
              kind: "casualty",
              quantity: 1,
              victimTeam: "home",
              victimRosterPlayerId: "h2",
            }),
          ],
        }),
      }),
    );
    const h1 = payload.home.players.find((p) => p.rosterPlayerId === "h1");
    expect(h1).toMatchObject({ tds: 2, completions: 1, casualties: 0 });
    const h2 = payload.home.players.find((p) => p.rosterPlayerId === "h2");
    expect(h2).toMatchObject({ casualties: 1 });
    expect(payload.home.casualties).toEqual([{ team: "away", rosterPlayerId: "a1" }]);
    expect(payload.away.casualties).toEqual([{ team: "home", rosterPlayerId: "h2" }]);
  });

  it("awards ONE casualty worth of PE per casualty line despite a stale quantity", () => {
    const payload = buildActaPayload(
      state({
        home: teamDraft({
          actions: [
            line({
              id: "c1",
              rosterPlayerId: "h1",
              kind: "casualty",
              quantity: 3,
              victimTeam: "away",
              victimRosterPlayerId: "a1",
            }),
          ],
        }),
      }),
    );
    const h1 = payload.home.players.find((p) => p.rosterPlayerId === "h1");
    if (!h1) throw new Error("expected an aggregated h1 row");
    expect(h1.casualties).toBe(1);
    expect(awardPeForActions(h1)).toBe(PE_CASUALTY);
    expect(payload.home.casualties).toHaveLength(1);
  });

  it("does not credit a casualty line that names no victim", () => {
    const payload = buildActaPayload(
      state({
        home: teamDraft({
          actions: [
            line({
              id: "c1",
              rosterPlayerId: "h1",
              kind: "casualty",
              quantity: 1,
              victimTeam: undefined,
              victimRosterPlayerId: undefined,
            }),
          ],
        }),
      }),
    );
    const h1 = payload.home.players.find((p) => p.rosterPlayerId === "h1");
    expect(h1?.casualties ?? 0).toBe(0);
    expect(payload.home.casualties).toEqual([]);
  });

  it("omits ff and duration when the user has not entered them", () => {
    const payload = buildActaPayload(emptyActaState());
    expect("ff" in payload.home).toBe(false);
    expect("ff" in payload.away).toBe(false);
    expect("duration" in payload).toBe(false);
  });
});

describe("actaPrefill", () => {
  it("returns an empty state when there is no snapshot", () => {
    expect(actaPrefill(null)).toEqual(emptyActaState());
  });
});
