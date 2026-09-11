import { describe, expect, it, vi } from "vitest";
import {
  ensureShareToken,
  isShareLinkActive,
  reduceWatchFrame,
  reduceWatchMatch,
} from "./watchAccess";

describe("isShareLinkActive", () => {
  const unresolved = { homeScore: null, awayScore: null, winnerId: null, result: null };

  it("is active while the fixture has no official outcome", () => {
    expect(isShareLinkActive(unresolved)).toBe(true);
  });

  it("closes the link once a home score is recorded", () => {
    expect(isShareLinkActive({ ...unresolved, homeScore: 2 })).toBe(false);
  });

  it("closes the link once an away score is recorded", () => {
    expect(isShareLinkActive({ ...unresolved, awayScore: 1 })).toBe(false);
  });

  it("closes the link once a winner is set", () => {
    expect(isShareLinkActive({ ...unresolved, winnerId: "t1" })).toBe(false);
  });

  it("closes the link once a MatchResult relation exists", () => {
    expect(isShareLinkActive({ ...unresolved, result: { id: "r1" } })).toBe(false);
  });
});

describe("ensureShareToken", () => {
  function buildDeps(existing: string | null) {
    const findUnique = vi.fn().mockResolvedValue({ shareToken: existing });
    const update = vi.fn().mockResolvedValue({ id: "f1" });
    const randomBytes = vi.fn((n: number) => Buffer.alloc(n, 0xab));
    return { prisma: { fixture: { findUnique, update } }, randomBytes };
  }

  it("returns the existing token without regenerating or writing", async () => {
    const deps = buildDeps("existing-token");
    await expect(ensureShareToken("f1", deps)).resolves.toBe("existing-token");
    expect(deps.randomBytes).not.toHaveBeenCalled();
    expect(deps.prisma.fixture.update).not.toHaveBeenCalled();
  });

  it("mints a 192-bit URL-safe token and persists it when absent", async () => {
    const deps = buildDeps(null);
    const token = await ensureShareToken("f1", deps);

    expect(deps.randomBytes).toHaveBeenCalledWith(24);
    // 24 bytes base64url → 32 chars, alphabet [A-Za-z0-9_-], no padding.
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("=");
    expect(deps.prisma.fixture.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { shareToken: token },
    });
  });

  it("is idempotent across a second call once a token exists", async () => {
    const deps = buildDeps(null);
    const first = await ensureShareToken("f1", deps);
    deps.prisma.fixture.findUnique.mockResolvedValue({ shareToken: first });

    const second = await ensureShareToken("f1", deps);

    expect(second).toBe(first);
    expect(deps.prisma.fixture.update).toHaveBeenCalledTimes(1);
  });
});

/** A full live frame carrying private fields the reducer MUST drop. */
function frame(overrides: Record<string, unknown> = {}) {
  return {
    seq: 7,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 1000,
    elapsed: 1234,
    homeTurnMs: 700,
    awayTurnMs: 534,
    paused: false,
    homeScore: 1,
    awayScore: 0,
    finishedAt: null,
    concedeProposedBy: "away",
    mvpNominations: { home: ["p1"], away: null },
    resolutionState: { home: { step: "winnings" }, away: { step: "winnings" } },
    lastTurnReason: "injury",
    inducements: { home: [{ id: "cheerleader", count: 1 }], away: [] },
    events: [
      {
        seq: 1,
        kind: "start",
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: {},
        at: 1000,
        ackStatus: "pending",
      },
      {
        seq: 2,
        kind: "turnStart",
        side: "home",
        playerRosterId: null,
        half: 1,
        turnNumber: 2,
        payload: {},
        at: 1100,
      },
      {
        seq: 3,
        kind: "td",
        side: "home",
        playerRosterId: "p1",
        half: 1,
        turnNumber: 2,
        payload: { td: true },
        at: 1200,
        ackStatus: "ok",
      },
    ],
    ...overrides,
  } as never;
}

describe("reduceWatchFrame", () => {
  it("whitelists only public live fields and forces viewerSide null", () => {
    const view = reduceWatchFrame(frame());

    expect(Object.keys(view).sort()).toEqual([
      "activeSide",
      "awayScore",
      "awayTurnMs",
      "elapsed",
      "events",
      "finishedAt",
      "half",
      "homeScore",
      "homeTurnMs",
      "paused",
      "seq",
      "startedAt",
      "status",
      "turnNumber",
      "viewerSide",
    ]);
    expect(view.viewerSide).toBeNull();
    expect(view).not.toHaveProperty("mvpNominations");
    expect(view).not.toHaveProperty("resolutionState");
    expect(view).not.toHaveProperty("inducements");
    expect(view).not.toHaveProperty("homeConsented");
    expect(view).not.toHaveProperty("awayConsented");
    expect(view).not.toHaveProperty("concedeProposedBy");
    expect(view).not.toHaveProperty("lastTurnReason");
  });

  it("keeps only display events and drops internal turn events and ack fields", () => {
    const view = reduceWatchFrame(frame());

    expect(view.events.map((event) => event.seq)).toEqual([1, 3]);
    expect(view.events.map((event) => event.kind)).toEqual(["start", "td"]);
    expect(Object.keys(view.events[0]).sort()).toEqual([
      "at",
      "half",
      "kind",
      "payload",
      "playerRosterId",
      "seq",
      "side",
      "turnNumber",
    ]);
    expect(view.events[1]).not.toHaveProperty("ackStatus");
  });

  it("tolerates a frame with no events (transitions that emit none)", () => {
    const view = reduceWatchFrame(frame({ events: undefined }));

    expect(view.events).toEqual([]);
    expect(view.seq).toBe(7);
  });
});

function baseFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    round: 2,
    status: "live",
    scheduledAt: new Date("2026-09-01T10:00:00.000Z"),
    homeScore: null,
    awayScore: null,
    winnerId: null,
    homeTeam: {
      id: "t1",
      name: "Reikland",
      raceId: "human",
      emblem: "/uploads/shields/t1.png",
      userId: "u1",
      roster: { players: [] },
    },
    awayTeam: {
      id: "t2",
      name: "Orcs",
      raceId: "orc",
      emblem: null,
      userId: "u2",
      roster: { players: [] },
    },
    liveMatch: frame(),
    result: null,
    ...overrides,
  };
}

function matchInput(overrides: Record<string, unknown> = {}) {
  return { fixture: baseFixture(overrides) } as never;
}

describe("reduceWatchMatch", () => {
  it("maps only the whitelisted fixture, team, and live fields", () => {
    const dto = reduceWatchMatch(matchInput());

    expect(Object.keys(dto).sort()).toEqual(["awayTeam", "fixture", "homeTeam", "live", "summary"]);
    expect(Object.keys(dto.fixture).sort()).toEqual([
      "awayScore",
      "homeScore",
      "id",
      "round",
      "scheduledAt",
      "status",
      "winnerId",
    ]);
    expect(Object.keys(dto.homeTeam).sort()).toEqual(["emblem", "id", "name", "raceId"]);
    expect(dto.fixture.scheduledAt).toBe("2026-09-01T10:00:00.000Z");
    expect(dto.homeTeam.emblem).toBe("/uploads/shields/t1.png");
    expect(dto.homeTeam).not.toHaveProperty("userId");
    expect(dto.homeTeam).not.toHaveProperty("roster");
    expect(dto.fixture).not.toHaveProperty("result");
    expect(dto.live?.viewerSide).toBeNull();
    expect(dto.live).not.toHaveProperty("mvpNominations");
    expect(dto.live).not.toHaveProperty("resolutionState");
    expect(dto.live).not.toHaveProperty("inducements");
  });

  it("derives the summary from the finished live view when no result is loaded", () => {
    const dto = reduceWatchMatch(
      matchInput({
        status: "finished",
        liveMatch: frame({ status: "finished", homeScore: 2, awayScore: 1, finishedAt: 5000 }),
      }),
    );

    expect(dto.summary).toEqual({ homeScore: 2, awayScore: 1, winnerSide: "home" });
  });

  it("has no summary while the match is still live", () => {
    expect(reduceWatchMatch(matchInput()).summary).toBeNull();
  });

  it("has no summary when a MatchResult is present (the result path owns it)", () => {
    const dto = reduceWatchMatch(
      matchInput({
        result: { id: "r1" },
        status: "finished",
        liveMatch: frame({ status: "finished", homeScore: 2, awayScore: 1 }),
      }),
    );

    expect(dto.summary).toBeNull();
  });

  it("returns live: null when the fixture has no live match", () => {
    expect(reduceWatchMatch(matchInput({ liveMatch: null })).live).toBeNull();
  });
});
