import { describe, expect, it } from "vitest";
import { casualtiesFromActions, deriveCasualtyEntries } from "./deriveCasualties";
import type { ActaActionLine, ActaTeamDraft } from "./actaState";

/**
 * MAW-4: the Acciones step records free-form player + action + quantity lines;
 * the casualties recorded there MUST feed the Bajas step as a derived victim
 * list (no re-entry). `deriveCasualtyEntries` is the pure mapping from those
 * Step-2 lines to the payload's victim entries.
 */

function line(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
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

describe("casualtiesFromActions", () => {
  it("maps each casualty line to its victim identity", () => {
    const entries = casualtiesFromActions([
      line({ id: "l1", victimTeam: "away", victimRosterPlayerId: "a1" }),
      line({ id: "l2", victimTeam: "away", victimRosterPlayerId: "a2" }),
    ]);
    expect(entries).toEqual([
      { team: "away", rosterPlayerId: "a1" },
      { team: "away", rosterPlayerId: "a2" },
    ]);
  });

  it("ignores non-casualty lines", () => {
    const entries = casualtiesFromActions([
      line({ kind: "td" }),
      line({ kind: "completion" }),
      line({ kind: "casualty", victimRosterPlayerId: "a3" }),
    ]);
    expect(entries).toEqual([{ team: "away", rosterPlayerId: "a3" }]);
  });

  it("ignores casualty lines without a chosen victim", () => {
    const entries = casualtiesFromActions([
      line({ victimRosterPlayerId: undefined, victimTeam: undefined }),
    ]);
    expect(entries).toEqual([]);
  });

  it("derives exactly ONE victim per casualty line despite a stale quantity", () => {
    const entries = casualtiesFromActions([
      line({ id: "l1", quantity: 3, victimTeam: "away", victimRosterPlayerId: "a1" }),
    ]);
    expect(entries).toEqual([{ team: "away", rosterPlayerId: "a1" }]);
  });
});

describe("deriveCasualtyEntries", () => {
  it("combines the victims caused by both teams in order", () => {
    const entries = deriveCasualtyEntries({
      home: draft({
        actions: [line({ id: "h", victimTeam: "away", victimRosterPlayerId: "a1" })],
      }),
      away: draft({
        actions: [line({ id: "a", victimTeam: "home", victimRosterPlayerId: "h2" })],
      }),
    });
    expect(entries).toEqual([
      { team: "away", rosterPlayerId: "a1" },
      { team: "home", rosterPlayerId: "h2" },
    ]);
  });

  it("returns an empty list when no casualty was recorded", () => {
    expect(deriveCasualtyEntries({ home: draft(), away: draft() })).toEqual([]);
  });
});
