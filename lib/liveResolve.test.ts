import { describe, expect, it } from "vitest";
import {
  PE_CASUALTY,
  PE_COMPLETION,
  PE_MVP,
  PE_TD,
} from "./rules/pe";
import {
  addMvpPe,
  casualtyVictimsFromEvents,
  deriveLivePeAwards,
  isLastingBand,
  validateMvpNominations,
  type ResolveEventLike,
} from "./liveResolve";

/**
 * RAU-49 pure resolve derivations: the PE awards from the persisted live events
 * (TD ★3 / completion ★1 / lasting casualty ★2 to its causer / MVP ★4), the
 * casualty-victim collection (bands already server-derived at confirm) and the
 * 6-nomination MJP validation. Zero-mock — mirrors the `lib/liveMatch.ts` pure
 * test style.
 */

function event(partial: Partial<ResolveEventLike>): ResolveEventLike {
  return {
    kind: "start",
    side: null,
    playerRosterId: null,
    payload: {},
    ...partial,
  };
}

describe("isLastingBand", () => {
  it("treats every non-bruise band as lasting (apaleado/grave/permanent/dead)", () => {
    for (const band of ["apaleado", "grave", "permanent", "dead"]) {
      expect(isLastingBand(band)).toBe(true);
    }
    expect(isLastingBand("bruise")).toBe(false);
  });
});

describe("deriveLivePeAwards", () => {
  it("awards TD ★3 and completion ★1 to the event's side", () => {
    const { home, away } = deriveLivePeAwards([
      event({ kind: "td", side: "home", playerRosterId: "h1" }),
      event({ kind: "td", side: "home", playerRosterId: "h1" }),
      event({ kind: "completion", side: "away", playerRosterId: "a1" }),
    ]);
    expect(home).toEqual([{ rosterPlayerId: "h1", pe: PE_TD * 2 }]);
    expect(away).toEqual([{ rosterPlayerId: "a1", pe: PE_COMPLETION }]);
  });

  it("awards a LASTING casualty ★2 to its causer (the OPPOSITE side of the victim)", () => {
    // The casualty event's side is the VICTIM's side (home); the causer (a1)
    // plays on the away side and earns the 2 PE.
    const { home, away } = deriveLivePeAwards([
      event({
        kind: "casualty",
        side: "home",
        playerRosterId: "h1",
        payload: { victimRosterId: "h1", causerRosterId: "a1", band: "apaleado" },
      }),
    ]);
    expect(home).toEqual([]);
    expect(away).toEqual([{ rosterPlayerId: "a1", pe: PE_CASUALTY }]);
  });

  it("awards NO casualty PE for a bruise band or a self-inflicted casualty (no causer)", () => {
    const { home, away } = deriveLivePeAwards([
      event({
        kind: "casualty",
        side: "home",
        playerRosterId: "h1",
        payload: { victimRosterId: "h1", causerRosterId: "a1", band: "bruise" },
      }),
      event({
        kind: "casualty",
        side: "home",
        playerRosterId: "h2",
        payload: { victimRosterId: "h2", band: "grave" },
      }),
    ]);
    expect(home).toEqual([]);
    expect(away).toEqual([]);
  });

  it("ignores null-side boundary events and unknown kinds", () => {
    const { home, away } = deriveLivePeAwards([
      event({ kind: "endMatch", side: null }),
      event({ kind: "start", side: null }),
      event({ kind: "foul", side: "away", playerRosterId: "a1" }),
    ]);
    expect(home).toEqual([]);
    expect(away).toEqual([]);
  });
});

describe("addMvpPe", () => {
  it("adds the +4 MJP grant to an existing award (upsert)", () => {
    const awards = addMvpPe([{ rosterPlayerId: "h1", pe: 3 }], "h1");
    expect(awards).toEqual([{ rosterPlayerId: "h1", pe: 3 + PE_MVP }]);
  });

  it("always grants the +4 to a grantee with no recorded action", () => {
    const awards = addMvpPe([{ rosterPlayerId: "h1", pe: 3 }], "h9");
    expect(awards).toEqual([
      { rosterPlayerId: "h1", pe: 3 },
      { rosterPlayerId: "h9", pe: PE_MVP },
    ]);
  });
});

describe("casualtyVictimsFromEvents", () => {
  it("collects each casualty's victim side + rosterPlayerId + persisted band", () => {
    const victims = casualtyVictimsFromEvents([
      event({
        kind: "casualty",
        side: "away",
        playerRosterId: "a1",
        payload: { band: "dead" },
      }),
      event({
        kind: "casualty",
        side: "home",
        playerRosterId: "h2",
        payload: { band: "bruise" },
      }),
      event({ kind: "td", side: "home", playerRosterId: "h1" }),
    ]);
    expect(victims).toEqual([
      { team: "away", rosterPlayerId: "a1", band: "dead" },
      { team: "home", rosterPlayerId: "h2", band: "bruise" },
    ]);
  });

  it("skips casualties without a side, player or band", () => {
    expect(
      casualtyVictimsFromEvents([
        event({ kind: "casualty", side: null, playerRosterId: "h1", payload: { band: "dead" } }),
        event({ kind: "casualty", side: "home", playerRosterId: null, payload: { band: "dead" } }),
        event({ kind: "casualty", side: "home", playerRosterId: "h1", payload: {} }),
      ]),
    ).toEqual([]);
  });
});

describe("validateMvpNominations", () => {
  const home = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
  const away = new Set(["a1", "a2", "a3", "a4", "a5", "a6"]);

  it("accepts exactly six distinct roster ids per team", () => {
    expect(
      validateMvpNominations(
        ["h1", "h2", "h3", "h4", "h5", "h6"],
        ["a1", "a2", "a3", "a4", "a5", "a6"],
        home,
        away,
      ),
    ).toBeNull();
  });

  it("rejects a team with fewer than six nominations", () => {
    expect(validateMvpNominations(["h1", "h2", "h3", "h4", "h5"], ["a1", "a2", "a3", "a4", "a5", "a6"], home, away)).toBe(
      "mvp.six",
    );
  });

  it("rejects duplicate nominations", () => {
    expect(
      validateMvpNominations(["h1", "h2", "h3", "h4", "h5", "h1"], ["a1", "a2", "a3", "a4", "a5", "a6"], home, away),
    ).toBe("mvp.duplicate");
  });

  it("rejects a nomination that is not in that team's roster", () => {
    expect(
      validateMvpNominations(["h1", "h2", "h3", "h4", "h5", "x9"], ["a1", "a2", "a3", "a4", "a5", "a6"], home, away),
    ).toBe("mvp.foreign");
  });

  it("rejects non-string / empty nominations", () => {
    expect(validateMvpNominations(["h1", "h2", "h3", "h4", "h5", ""], ["a1", "a2", "a3", "a4", "a5", "a6"], home, away)).toBe(
      "mvp.ids",
    );
  });
});
