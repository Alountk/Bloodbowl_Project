import { describe, expect, it } from "vitest";
import {
  CASUALTY_CAUSES,
  checkActorInvariant,
  playerSide,
  resolveEventPermission,
  type EventKind,
  type RosterSideMap,
} from "./livePhase";

/**
 * Side-matrix tests for live event recording (LM-12, D14). Pure decision:
 * ACTIVE coach → any event (TD/foul/casualty/pass-turn) on any victim; NON-ACTIVE
 * coach → ONLY a casualty to one of their OWN players; caller with no side
 * (admin/spectator) → no event (lifecycle only). Zero mocks.
 */
const KINDS: EventKind[] = ["td", "foul", "casualty", "completion", "passTurn"];

describe("resolveEventPermission — ACTIVE coach records any event (LM-12)", () => {
  it("lets the ACTIVE home coach record TD/foul/casualty/pass-turn (any victim)", () => {
    for (const kind of KINDS) {
      const victimSide = kind === "casualty" ? "away" : undefined;
      expect(resolveEventPermission({ callerSide: "home", activeSide: "home", kind, victimSide })).toBe("allow");
    }
  });

  it("lets the ACTIVE away coach record TD/foul/casualty/pass-turn (any victim)", () => {
    for (const kind of KINDS) {
      const victimSide = kind === "casualty" ? "home" : undefined;
      expect(resolveEventPermission({ callerSide: "away", activeSide: "away", kind, victimSide })).toBe("allow");
    }
  });

  it("lets the ACTIVE coach record a casualty on an OPPONENT-side victim (RAU-34)", () => {
    // home active: the home coach records the injury they inflicted on an away player.
    expect(resolveEventPermission({ callerSide: "home", activeSide: "home", kind: "casualty", victimSide: "away" })).toBe("allow");
    // mirror: away active: the away coach records the injury they inflicted on a home player.
    expect(resolveEventPermission({ callerSide: "away", activeSide: "away", kind: "casualty", victimSide: "home" })).toBe("allow");
  });
});

describe("resolveEventPermission — NON-ACTIVE coach is side-gated (LM-12)", () => {
  it("denies a non-active coach a TD or foul (out-of-turn action → 409)", () => {
    // home is active; the away coach must not record a TD/foul.
    expect(resolveEventPermission({ callerSide: "away", activeSide: "home", kind: "td" })).toBe("deny");
    expect(resolveEventPermission({ callerSide: "away", activeSide: "home", kind: "foul" })).toBe("deny");
    // mirror: away active, home coach denied a TD/foul.
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "td" })).toBe("deny");
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "foul" })).toBe("deny");
  });

  it("denies a non-active coach a pass-turn (only the active coach flips the turn)", () => {
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "passTurn" })).toBe("deny");
  });

  it("denies a non-active coach a completion (non-active completion → 409, LM-15)", () => {
    // away active; the home coach records a completion → denied.
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "completion" })).toBe("deny");
    expect(resolveEventPermission({ callerSide: "away", activeSide: "home", kind: "completion" })).toBe("deny");
  });

  it("ALLOWS a non-active coach to record a casualty to one of their OWN players", () => {
    // away active; the home coach records a casualty to a HOME player → allowed.
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "casualty", victimSide: "home" })).toBe("allow");
    // mirror: home active; the away coach records a casualty to an AWAY player.
    expect(resolveEventPermission({ callerSide: "away", activeSide: "home", kind: "casualty", victimSide: "away" })).toBe("allow");
  });

  it("DENIES a non-active coach a casualty to an OPONENT player (opponent injury)", () => {
    // away active; the home coach records a casualty to an AWAY (opponent) player.
    expect(resolveEventPermission({ callerSide: "home", activeSide: "away", kind: "casualty", victimSide: "away" })).toBe("deny");
    expect(resolveEventPermission({ callerSide: "away", activeSide: "home", kind: "casualty", victimSide: "home" })).toBe("deny");
  });
});

describe("resolveEventPermission — no side (admin/spectator) is denied all events (D14)", () => {
  it("denies every event kind when the caller has no side (admin without a team)", () => {
    for (const kind of KINDS) {
      expect(resolveEventPermission({ callerSide: null, activeSide: "home", kind })).toBe("deny");
      expect(resolveEventPermission({ callerSide: null, activeSide: "away", kind })).toBe("deny");
    }
  });
});

// --- LM-12 actor-side invariants (D1 pure helpers) --------------------------

/** A roster map with named home/away players (p1..p3 home, p9..p10 away). */
const ROSTERS: RosterSideMap = {
  home: new Set(["p1", "p2", "p3"]),
  away: new Set(["p9", "p10"]),
};

describe("playerSide — resolves a roster id to its side (LM-12)", () => {
  it("resolves a home player to home and an away player to away", () => {
    expect(playerSide(ROSTERS, "p1")).toBe("home");
    expect(playerSide(ROSTERS, "p9")).toBe("away");
  });

  it("returns null for an unresolvable id and for null/undefined ids", () => {
    expect(playerSide(ROSTERS, "nobody")).toBeNull();
    expect(playerSide(ROSTERS, null)).toBeNull();
    expect(playerSide(ROSTERS, undefined)).toBeNull();
  });
});

describe("checkActorInvariant — foul victim must be an opponent (LM-12)", () => {
  it("allows a foul when the victim is on the OPPOSITE side of the aggressor", () => {
    // home aggressor fouls an away player; away aggressor fouls a home player.
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "home", opponentId: "p9", rosters: ROSTERS }),
    ).toBe("allow");
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "away", opponentId: "p1", rosters: ROSTERS }),
    ).toBe("allow");
  });

  it("denies a foul whose victim is on the aggressor's OWN side", () => {
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "home", opponentId: "p2", rosters: ROSTERS }),
    ).toBe("deny");
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "away", opponentId: "p10", rosters: ROSTERS }),
    ).toBe("deny");
  });

  it("denies a foul with an unresolvable victim id (LM-12) and denies a MISSING victim (LM-6 requires it)", () => {
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "home", opponentId: "ghost", rosters: ROSTERS }),
    ).toBe("deny");
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "home", rosters: ROSTERS }),
    ).toBe("deny");
  });
});

describe("checkActorInvariant — casualty causer must be on the opposite side (LM-12)", () => {
  it("allows a casualty whose causer is on the side opposite the victim", () => {
    // home victim, away causer; away victim, home causer.
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", opponentId: "p9", rosters: ROSTERS }),
    ).toBe("allow");
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "away", opponentId: "p1", rosters: ROSTERS }),
    ).toBe("allow");
  });

  it("denies a casualty whose causer is on the victim's OWN side", () => {
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", opponentId: "p2", rosters: ROSTERS }),
    ).toBe("deny");
  });

  it("denies a casualty with an unresolvable causer id", () => {
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", opponentId: "ghost", rosters: ROSTERS }),
    ).toBe("deny");
  });
});

describe("checkActorInvariant — crowd/self-inflicted casualties must NOT carry a causer (LM-12/MVT-5 strict)", () => {
  it("denies a dodge/crowd casualty that carries a causer", () => {
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", opponentId: "p9", cause: "dodge", rosters: ROSTERS }),
    ).toBe("deny");
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", opponentId: "p9", cause: "crowd", rosters: ROSTERS }),
    ).toBe("deny");
  });

  it("allows a dodge/crowd casualty with NO causer (self-inflicted / the crowd)", () => {
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", cause: "dodge", rosters: ROSTERS }),
    ).toBe("allow");
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "away", cause: "crowd", rosters: ROSTERS }),
    ).toBe("allow");
  });

  it("allows a casualty with a given cause and NO causer (bare-cause fallback)", () => {
    expect(
      checkActorInvariant({ kind: "casualty", actorSide: "home", cause: "blitz", rosters: ROSTERS }),
    ).toBe("allow");
  });
});

describe("CASUALTY_CAUSES — the six valid causes (MVT-5/LM-6)", () => {
  it("contains blitz|foul|dodge|crowd|penetration|block and nothing else", () => {
    expect(CASUALTY_CAUSES).toEqual(["blitz", "foul", "dodge", "crowd", "penetration", "block"]);
  });

  it("rejects a foul when the victim id is empty-string (REQUIRED, LM-6)", () => {
    expect(
      checkActorInvariant({ kind: "foul", actorSide: "home", opponentId: "", rosters: ROSTERS }),
    ).toBe("deny");
  });
});
