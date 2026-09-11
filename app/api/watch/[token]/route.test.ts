import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  fixture: { findUnique: vi.fn() },
}));
const expireStaleMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const hubMock = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/liveStore", () => ({ expireStaleLiveMatches: expireStaleMock }));
vi.mock("@/lib/liveHub", () => ({ liveHub: hubMock }));
// The watch route is PUBLIC (MSL-3/MSL-4): it MUST NOT require a session. Any
// call to `auth()` throws, so every 200 assertion below also proves the route
// never consults the session.
vi.mock("@/auth", () => ({
  auth: () => {
    throw new Error("watch route must not require a session");
  },
}));

import { GET } from "./route";

/** The generic no-leak body every inactive/unknown token shares (MSL-3). */
const GONE = { error: "Este link ya no está disponible" };

/** The reduced DTO shape as the guest receives it (loosely typed for asserts). */
interface ReducedBody {
  fixture: Record<string, unknown> & { scheduledAt: string | null; status: string };
  homeTeam: Record<string, unknown> & { emblem: string | null };
  awayTeam: Record<string, unknown> & { emblem: string | null };
  live:
    | (Record<string, unknown> & {
        viewerSide: string | null;
        elapsed: number;
        homeTurnMs: number;
        awayTurnMs: number;
        events: { seq: number; kind: string }[];
      })
    | null;
  summary: { homeScore: number; awayScore: number; winnerSide: string | null } | null;
}

/** The lightweight token-resolution read (id + active-expiry fields). */
function resolveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    homeScore: null,
    awayScore: null,
    winnerId: null,
    result: null,
    ...overrides,
  };
}

/** A raw LiveMatch row carrying private fields the reducer MUST drop. */
function liveRow(overrides: Record<string, unknown> = {}) {
  return {
    seq: 5,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeScore: 1,
    awayScore: 0,
    startedAt: new Date(1000),
    finishedAt: null,
    homeTurnMs: 700,
    awayTurnMs: 500,
    paused: false,
    clockStartedAt: new Date(2000),
    // Private fields — must never reach the guest payload.
    homeConsented: true,
    awayConsented: true,
    concedeProposedBy: "away",
    mvpNominations: { home: ["p1"], away: null },
    resolutionState: { home: { step: "winnings" }, away: { step: "winnings" } },
    inducements: { home: [{ id: "cheerleader", count: 1 }], away: [] },
    journeymen: { home: [{ id: "j1", name: "Novato" }], away: [] },
    events: [
      {
        seq: 1,
        kind: "start",
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: {},
        createdAt: new Date(1000),
      },
      {
        seq: 2,
        kind: "turnStart",
        side: "home",
        playerRosterId: null,
        half: 1,
        turnNumber: 2,
        payload: {},
        createdAt: new Date(1100),
      },
      {
        seq: 3,
        kind: "td",
        side: "home",
        playerRosterId: "p1",
        half: 1,
        turnNumber: 2,
        payload: { td: true },
        createdAt: new Date(1200),
      },
    ],
    ...overrides,
  };
}

/** The full reduced-read fixture row (teams + live + result nullness). */
function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    round: 2,
    scheduledAt: new Date("2026-09-01T10:00:00.000Z"),
    homeScore: null,
    awayScore: null,
    winnerId: null,
    result: null,
    homeTeam: {
      id: "t1",
      name: "Reikland",
      raceId: "human",
      emblem: "/uploads/shields/t1.png",
      // Private team fields — must never reach the guest payload.
      userId: "u1",
      user: { id: "u1", email: "coach@example.com" },
      roster: { players: [] },
      coaching: { dedicatedFans: 1 },
    },
    awayTeam: {
      id: "t2",
      name: "Orcs",
      raceId: "orc",
      emblem: null,
      userId: "u2",
      user: { id: "u2", email: "orc@example.com" },
      roster: { players: [] },
      coaching: { dedicatedFans: 1 },
    },
    liveMatch: null,
    ...overrides,
  };
}

function primeReads(resolve: unknown, full: unknown) {
  prismaMock.fixture.findUnique.mockResolvedValueOnce(resolve).mockResolvedValueOnce(full);
}

function get(token = "tok-1") {
  return GET(new Request(`http://localhost/api/watch/${token}`), {
    params: Promise.resolve({ token }),
  } as never);
}

describe("GET /api/watch/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expireStaleMock.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves the reduced DTO for an active token without any session", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const res = await get();

    expect(res.status).toBe(200);
  });

  it("resolves the fixture FROM the token (no leagueId in the query)", async () => {
    primeReads(resolveRow(), buildFixture());

    await get("tok-xyz");

    expect(prismaMock.fixture.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shareToken: "tok-xyz" } }),
    );
  });

  it("returns only the whitelisted fixture, team, and live fields", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const body = (await (await get()).json()) as ReducedBody;

    expect(Object.keys(body).sort()).toEqual(["awayTeam", "fixture", "homeTeam", "live", "summary"]);
    expect(Object.keys(body.fixture).sort()).toEqual([
      "awayScore",
      "homeScore",
      "id",
      "round",
      "scheduledAt",
      "status",
      "winnerId",
    ]);
    expect(body.fixture.scheduledAt).toBe("2026-09-01T10:00:00.000Z");
    // No scores scheduled date only → derived "scheduled" (unresolved, link open).
    expect(body.fixture.status).toBe("scheduled");
    expect(Object.keys(body.homeTeam).sort()).toEqual(["emblem", "id", "name", "raceId"]);
    expect(Object.keys(body.awayTeam).sort()).toEqual(["emblem", "id", "name", "raceId"]);
    expect(body.homeTeam.emblem).toBe("/uploads/shields/t1.png");
    expect(body.live).not.toBeNull();
    const live = body.live as NonNullable<ReducedBody["live"]>;
    expect(Object.keys(live).sort()).toEqual([
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
    expect(live.viewerSide).toBeNull();
  });

  it("never exposes private fields on the reduced payload (MSL-4)", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const res = await get();
    const body = (await res.json()) as Record<string, unknown>;
    const live = body.live as Record<string, unknown>;
    const fixture = body.fixture as Record<string, unknown>;
    const homeTeam = body.homeTeam as Record<string, unknown>;

    // Structural absence on every level.
    expect(fixture).not.toHaveProperty("result");
    expect(homeTeam).not.toHaveProperty("user");
    expect(homeTeam).not.toHaveProperty("roster");
    expect(homeTeam).not.toHaveProperty("coaching");
    expect(live).not.toHaveProperty("homeConsented");
    expect(live).not.toHaveProperty("awayConsented");
    expect(live).not.toHaveProperty("concedeProposedBy");
    expect(live).not.toHaveProperty("mvpNominations");
    expect(live).not.toHaveProperty("resolutionState");
    expect(live).not.toHaveProperty("inducements");
    expect(live).not.toHaveProperty("journeymen");
    // The serialized payload carries none of the private markers either.
    const serialized = JSON.stringify(body);
    for (const secret of [
      "mvpNominations",
      "resolutionState",
      "inducements",
      "homeConsented",
      "awayConsented",
      "concedeProposedBy",
      "journeymen",
      "email",
      "coaching",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps only display events and drops internal turn events + ack fields", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const body = (await (await get()).json()) as ReducedBody;

    expect(body.live?.events.map((event) => event.seq)).toEqual([1, 3]);
    expect(body.live?.events.map((event) => event.kind)).toEqual(["start", "td"]);
  });

  it("derives the live clock from the persisted accumulators", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(3000));
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const body = (await (await get()).json()) as ReducedBody;

    // Active side (home) accrues the in-flight segment (3000 - 2000 = 1000).
    expect(body.live?.homeTurnMs).toBe(1700);
    expect(body.live?.awayTurnMs).toBe(500);
    expect(body.live?.elapsed).toBe(2200);
  });

  it("derives the summary from a finished live match with no MatchResult (LM-16)", async () => {
    primeReads(
      resolveRow(),
      buildFixture({
        liveMatch: liveRow({ status: "finished", homeScore: 2, awayScore: 1, finishedAt: new Date(5000) }),
      }),
    );

    const body = (await (await get()).json()) as ReducedBody;

    expect(body.summary).toEqual({ homeScore: 2, awayScore: 1, winnerSide: "home" });
  });

  it("returns live: null when the fixture has no live match", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: null }));

    const body = (await (await get()).json()) as ReducedBody;

    expect(body.live).toBeNull();
    expect(body.summary).toBeNull();
  });

  it("runs the stale sweep scoped to the fixture before the reduced read (LMR-3 parity)", async () => {
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const res = await get();

    expect(res.status).toBe(200);
    expect(expireStaleMock).toHaveBeenCalledWith(
      { prisma: prismaMock, hub: hubMock },
      { fixtureId: "f1" },
    );
  });

  it("still serves the reduced DTO when the stale sweep fails (transparent maintenance)", async () => {
    expireStaleMock.mockRejectedValueOnce(new Error("db down"));
    primeReads(resolveRow(), buildFixture({ liveMatch: liveRow() }));

    const res = await get();

    expect(res.status).toBe(200);
  });

  it("closes the link when the stale sweep froze the scoreboard (post-sweep re-check)", async () => {
    // The sweep auto-closed a >8h live match: the fixture now has scores, so the
    // derived expiry flips the link to the generic 404.
    primeReads(resolveRow(), buildFixture({ homeScore: 2, awayScore: 1, winnerId: "t1" }));

    const res = await get();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
  });

  it("returns the generic 404 for an unknown token with no leak and no write", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(null);

    const res = await get("unknown-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
    // An unknown token never reaches the maintenance sweep.
    expect(expireStaleMock).not.toHaveBeenCalled();
  });

  it("returns the IDENTICAL generic 404 for a played fixture (expired == unknown)", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(
      resolveRow({ homeScore: 2, awayScore: 1, winnerId: "t1", result: { id: "r1" } }),
    );

    const res = await get("played-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
    expect(expireStaleMock).not.toHaveBeenCalled();
  });

  it("closes the link on a result-only fixture (legacy played marker)", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(
      resolveRow({ homeScore: null, awayScore: null, winnerId: null, result: { id: "r1" } }),
    );

    const res = await get("legacy-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
  });
});
