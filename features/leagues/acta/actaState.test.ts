import { describe, expect, it } from "vitest";
import { awardPeForActions, PE_CASUALTY } from "@/lib/rules/pe";
import type { MatchScoreboard, ResultPlayerAction } from "../api";
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

/** One side of a persisted `MatchResult.scores` snapshot. */
function scoreboardSide(
  overrides: Partial<MatchScoreboard["home"]> = {},
): MatchScoreboard["home"] {
  return { score: 0, casualties: [], pe: [], ...overrides };
}

/** A persisted `MatchResult.scores` snapshot with legacy-minimal sides. */
function snapshot(overrides: Partial<MatchScoreboard> = {}): MatchScoreboard {
  return {
    home: scoreboardSide(),
    away: scoreboardSide(),
    winnerId: null,
    ...overrides,
  };
}

/** One aggregated per-player action row as the snapshot stores it. */
function actionRow(
  overrides: Partial<ResultPlayerAction> = {},
): ResultPlayerAction {
  return {
    rosterPlayerId: "p1",
    tds: 0,
    casualties: 0,
    completions: 0,
    interceptions: 0,
    fouls: 0,
    throwTeamMates: 0,
    landedSafe: 0,
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
    expect(actaPrefill(undefined)).toEqual(emptyActaState());
  });

  it("prefills every extended snapshot key for correct mode (MAW-9)", () => {
    const prefill = actaPrefill(
      snapshot({
        duration: 130,
        mvp: { home: "h1", away: "a2" },
        home: scoreboardSide({
          score: 2,
          ff: 5,
          neverHeld: true,
          fanRoll: 4,
          inducements: { budget: 70_000, cards: [] },
          // Home CAUSED one casualty (victim a2 lives on the away side).
          actions: [
            actionRow({ rosterPlayerId: "h1", tds: 2, completions: 1, casualties: 1 }),
          ],
        }),
        away: scoreboardSide({
          score: 1,
          ff: 3,
          neverHeld: false,
          fanRoll: 2,
          inducements: { budget: 20_000, cards: [] },
          actions: [actionRow({ rosterPlayerId: "a2", tds: 1 })],
          // Victims are grouped by the VICTIM's team: a2 is an away player.
          casualties: [
            { team: "away", rosterPlayerId: "a2", outcome: { kind: "permanent" } },
          ],
          injuryRoll: [13],
          permanentRoll: [5],
        }),
      }),
    );

    // Weather is a MatchResult column, NOT part of `scores`, so a call that
    // omits the optional second argument keeps the default (FIX-A threads it).
    expect(prefill.weather).toBe("Perfecto");
    expect(prefill.duration).toBe(130);

    expect(prefill.home.score).toBe(2);
    expect(prefill.home.ff).toBe(5);
    expect(prefill.home.neverHeld).toBe(true);
    expect(prefill.home.fanRoll).toBe(4);
    expect(prefill.home.inducements).toBe(70_000);
    expect(prefill.home.mvpGrantee).toBe("h1");
    expect(prefill.away.score).toBe(1);
    expect(prefill.away.ff).toBe(3);
    expect(prefill.away.neverHeld).toBe(false);
    expect(prefill.away.fanRoll).toBe(2);
    expect(prefill.away.inducements).toBe(20_000);
    expect(prefill.away.mvpGrantee).toBe("a2");

    // Non-casualty lines are rebuilt straight from the aggregated rows.
    expect(prefill.home.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rosterPlayerId: "h1", kind: "td", quantity: 2 }),
        expect.objectContaining({ rosterPlayerId: "h1", kind: "completion", quantity: 1 }),
      ]),
    );
    expect(prefill.away.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rosterPlayerId: "a2", kind: "td", quantity: 1 }),
      ]),
    );
    // Home caused the away victim → its casualty line binds the victim to h1.
    expect(prefill.home.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rosterPlayerId: "h1",
          kind: "casualty",
          victimTeam: "away",
          victimRosterPlayerId: "a2",
        }),
      ]),
    );
    // The snapshot groups rolls by the VICTIM side; the wizard stores them on
    // the CAUSING draft, so home reads the away arrays (and vice versa).
    expect(prefill.home.injuryRoll).toEqual([13]);
    expect(prefill.home.permanentRoll).toEqual([5]);
    expect(prefill.away.injuryRoll).toEqual([]);
    expect(prefill.away.permanentRoll).toEqual([]);
  });

  it("prefills the persisted result weather and carries it into the payload (s6a corrective)", () => {
    // FIX-A: `weather` is a MatchResult column, NOT a `scores` key, so the call
    // site threads it as the second argument. Without it the wizard opens on the
    // "Perfecto" default and a correction silently rewrites the persisted weather.
    const prefill = actaPrefill(snapshot({ duration: 130 }), "Lluvioso");
    expect(prefill.weather).toBe("Lluvioso");
    expect(buildActaPayload(prefill).weather).toBe("Lluvioso");
  });

  it("keeps the default weather when the result row carries none", () => {
    expect(actaPrefill(snapshot(), null).weather).toBe("Perfecto");
  });

  it("opens a legacy snapshot partially prefilled without throwing", () => {
    const prefill = actaPrefill(
      snapshot({
        // Legacy row: no `actions`, no `ff`, no rolls, no duration, no inducements.
        home: scoreboardSide({
          score: 2,
          casualties: [
            { team: "away", rosterPlayerId: "a1", outcome: { kind: "dead" } },
          ],
        }),
        away: scoreboardSide({ score: 1 }),
        mvp: { home: "h1", away: "a2" },
      }),
    );

    expect(prefill.home.score).toBe(2);
    expect(prefill.away.score).toBe(1);
    expect(prefill.home.mvpGrantee).toBe("h1");
    expect(prefill.away.mvpGrantee).toBe("a2");
    // No `actions` → no causer → no action/casualty lines and no bound rolls.
    expect(prefill.home.actions).toEqual([]);
    expect(prefill.home.injuryRoll).toEqual([]);
    expect(prefill.home.permanentRoll).toEqual([]);
    // Extended scalar keys stay unset/default — never invented.
    expect(prefill.home.ff).toBeUndefined();
    expect(prefill.home.fanRoll).toBeNull();
    expect(prefill.home.inducements).toBe(0);
    expect(prefill.home.neverHeld).toBe(false);
    expect(prefill.duration).toBeUndefined();
  });

  it("flags unreconstructable casualties when a legacy row has victims but no actions (s6a corrective)", () => {
    // FIX-B: the victims are persisted on the OPPONENT side, but without the
    // causer's `actions` no casualty line can be rebuilt, so the Bajas step
    // opens EMPTY. The marker drives a warning (never a save block).
    const prefill = actaPrefill(
      snapshot({
        home: scoreboardSide({
          score: 2,
          casualties: [
            { team: "away", rosterPlayerId: "a1", outcome: { kind: "dead" } },
          ],
        }),
        away: scoreboardSide({ score: 1 }),
      }),
    );
    expect(prefill.casualtiesUnrecoverable).toBe(true);
  });

  it("does not flag an extended snapshot whose actions attribute every casualty (s6a corrective)", () => {
    const prefill = actaPrefill(
      snapshot({
        home: scoreboardSide({
          actions: [actionRow({ rosterPlayerId: "h1", casualties: 1 })],
        }),
        away: scoreboardSide({
          actions: [actionRow({ rosterPlayerId: "a2" })],
          casualties: [
            { team: "away", rosterPlayerId: "a2", outcome: { kind: "permanent" } },
          ],
        }),
      }),
    );
    expect(prefill.casualtiesUnrecoverable).toBe(false);
  });

  it("does not flag a snapshot with no persisted casualties (s6a corrective)", () => {
    expect(actaPrefill(snapshot()).casualtiesUnrecoverable).toBe(false);
  });

  it("leaves the MVP grantee empty when a legacy row carries no mvp map", () => {
    const prefill = actaPrefill(
      snapshot({ home: scoreboardSide({ score: 2 }) }),
    );
    expect(prefill.home.mvpGrantee).toBe("");
    expect(prefill.away.mvpGrantee).toBe("");
  });
});
