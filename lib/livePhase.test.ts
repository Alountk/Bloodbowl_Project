import { describe, expect, it } from "vitest";
import { resolveEventPermission, type EventKind } from "./livePhase";

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
