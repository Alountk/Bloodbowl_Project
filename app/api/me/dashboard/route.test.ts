import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findMany: vi.fn() },
  team: { findMany: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, type DashboardFixture, type DashboardPayload } from "./route";

/** Raw row shape the fixture query selects (mirrors the route's narrow select). */
type Row = {
  id: string;
  leagueId: string;
  round: number;
  scheduledAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
  league: { id: string; name: string };
  homeTeam: { id: string; name: string; userId: string };
  awayTeam: { id: string; name: string; userId: string };
  result: { id: string } | null;
  liveMatch: { status: string; homeScore: number; awayScore: number; half: number; turnNumber: number } | null;
  proposals: { id: string; date: Date; createdAt: Date; userId: string }[];
};

/** A complete raw fixture row; tests override only what the case needs. */
function row(overrides: Partial<Row> & { id: string }): Row {
  return {
    leagueId: "l1",
    round: 1,
    scheduledAt: null,
    homeScore: null,
    awayScore: null,
    league: { id: "l1", name: "Liga Test" },
    homeTeam: { id: "t-home", name: "Mis Osos", userId: "user-1" },
    awayTeam: { id: "t-away", name: "Rival FC", userId: "rival-1" },
    result: null,
    liveMatch: null,
    proposals: [],
    ...overrides,
  };
}

/** The card-lite LiveMatch snapshot the select fetches, with a given status. */
function liveRow(status: string) {
  return { status, homeScore: 1, awayScore: 0, half: 1, turnNumber: 3 };
}

/** Calls the route, asserts 200 and returns the typed payload. */
async function payload(): Promise<DashboardPayload> {
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()) as DashboardPayload;
}

const ids = (list: DashboardFixture[]) => list.map((fixture) => fixture.fixtureId);

describe("GET /api/me/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findMany.mockResolvedValue([]);
    prismaMock.team.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated, without touching the database", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.findMany).not.toHaveBeenCalled();
    expect(prismaMock.team.findMany).not.toHaveBeenCalled();
  });

  it("returns the empty payload shape for a user with nothing pending", async () => {
    expect(await payload()).toEqual({
      proposals: [],
      live: [],
      resultsPending: [],
      nextMatch: null,
      teams: { count: 0, readyToImprove: 0, squadPe: 0 },
    });
  });

  it("lists a rival-authored proposal but never my own (core rule)", async () => {
    prismaMock.fixture.findMany.mockResolvedValue([
      row({
        id: "f-rival",
        scheduledAt: new Date("2026-04-01T10:00:00.000Z"),
        proposals: [
          { id: "p-rival", date: new Date("2026-04-05T00:00:00.000Z"), createdAt: new Date("2026-03-01T00:00:00.000Z"), userId: "rival-1" },
        ],
      }),
      // My OWN active proposal: the query's `NOT: { userId }` drops it in the
      // DB, and the handler check must drop it too (defense in depth).
      row({
        id: "f-mine",
        scheduledAt: new Date("2026-04-02T10:00:00.000Z"),
        proposals: [
          { id: "p-mine", date: new Date("2026-04-06T00:00:00.000Z"), createdAt: new Date("2026-03-02T00:00:00.000Z"), userId: "user-1" },
        ],
      }),
    ]);

    const body = await payload();
    expect(ids(body.proposals)).toEqual(["f-rival"]);
    expect(body.proposals[0].pendingProposal).toEqual({
      id: "p-rival",
      date: "2026-04-05T00:00:00.000Z",
      createdAt: "2026-03-01T00:00:00.000Z",
    });
    expect(body.proposals[0].viewerSide).toBe("home");
    expect(body.proposals[0].status).toBe("scheduled");
  });

  it("lists only fixtures whose live row is actually 'live'", async () => {
    prismaMock.fixture.findMany.mockResolvedValue([
      row({
        id: "f-live",
        scheduledAt: new Date("2026-04-01T10:00:00.000Z"),
        // Viewer on the away side: home belongs to the rival.
        homeTeam: { id: "t-rival", name: "Rival FC", userId: "rival-1" },
        awayTeam: { id: "t-mine", name: "Mis Osos", userId: "user-1" },
        liveMatch: liveRow("live"),
      }),
      row({ id: "f-ready", scheduledAt: new Date("2026-04-02T10:00:00.000Z"), liveMatch: liveRow("ready") }),
      row({ id: "f-finished", scheduledAt: new Date("2026-04-03T10:00:00.000Z"), liveMatch: liveRow("finished") }),
    ]);

    const body = await payload();
    expect(ids(body.live)).toEqual(["f-live"]);
    expect(body.live[0].live).toEqual(liveRow("live"));
    expect(body.live[0].viewerSide).toBe("away");
  });

  it("flags only the results the viewer still owes", async () => {
    prismaMock.fixture.findMany.mockResolvedValue([
      row({ id: "f-scheduled", scheduledAt: new Date("2026-04-01T10:00:00.000Z") }), // owed
      row({ id: "f-in-play", scheduledAt: new Date("2026-04-02T10:00:00.000Z"), liveMatch: liveRow("live") }), // live → not yet
      row({ id: "f-played", scheduledAt: new Date("2026-04-03T10:00:00.000Z"), homeScore: 2, awayScore: 1 }), // done → excluded
      row({ id: "f-live-done", scheduledAt: new Date("2026-04-04T10:00:00.000Z"), liveMatch: liveRow("finished") }), // finished live, no result row → owed
    ]);

    const body = await payload();
    expect(ids(body.resultsPending)).toEqual(["f-scheduled", "f-live-done"]);
  });

  it("picks the earliest dated unplayed fixture as nextMatch", async () => {
    prismaMock.fixture.findMany.mockResolvedValue([
      row({ id: "f-later", scheduledAt: new Date("2026-04-09T10:00:00.000Z") }),
      row({ id: "f-earlier", scheduledAt: new Date("2026-04-01T10:00:00.000Z") }),
    ]);

    expect((await payload()).nextMatch?.fixtureId).toBe("f-earlier");
  });

  it("returns nextMatch null when no upcoming dated fixture exists", async () => {
    prismaMock.fixture.findMany.mockResolvedValue([
      row({ id: "f-played", scheduledAt: new Date("2026-04-01T10:00:00.000Z"), homeScore: 1, awayScore: 0 }),
      row({ id: "f-undated" }),
    ]);

    expect((await payload()).nextMatch).toBeNull();
  });

  it("summarizes active teams with the real ready-to-improve rule", async () => {
    prismaMock.team.findMany.mockResolvedValue([
      {
        id: "t1",
        players: [
          { pe: 3, alive: true, improvements: [] }, // next cost 3 → ready
          { pe: 2, alive: true, improvements: [] }, // short of PE → not ready
          { pe: 30, alive: false, improvements: [] }, // dead → never ready
          { pe: 5, alive: true, improvements: [{}, {}] }, // 2 taken → next cost 6 → short
        ],
      },
      { id: "t2", players: [{ pe: 10, alive: true, improvements: [] }] }, // ready
    ]);

    const body = await payload();
    expect(body.teams).toEqual({ count: 2, readyToImprove: 2, squadPe: 50 });
    // Archiving is enforced in the query, never by handler-side filtering.
    expect((prismaMock.team.findMany.mock.calls[0] as [{ where: unknown }])[0].where).toEqual({
      userId: "user-1",
      archivedAt: null,
    });
  });

  it("never surfaces a proposal on a PLAYED fixture (result routes never close them)", async () => {
    // The rival proposed a date and nobody accepted; both coaches then played
    // the match live. `POST .../result` writes scores + MatchResult in one tx
    // but touches no ScheduleProposal, so the row is still active — and the
    // accept endpoint answers 409 "already played". Presenting that as
    // "awaiting your response" would be a dead card (issue #305).
    prismaMock.fixture.findMany.mockResolvedValue([
      row({
        id: "f-played-stale",
        scheduledAt: new Date("2026-04-01T10:00:00.000Z"),
        homeScore: 2,
        awayScore: 1,
        proposals: [
          { id: "p-stale", date: new Date("2026-04-05T00:00:00.000Z"), createdAt: new Date("2026-03-01T00:00:00.000Z"), userId: "rival-1" },
        ],
      }),
    ]);

    const body = await payload();
    expect(ids(body.proposals)).toEqual([]);
    expect(body.resultsPending).toEqual([]);
    expect(body.nextMatch).toBeNull();
  });

  it("scopes the fixture query to the session user (foreign fixtures unreachable)", async () => {
    await GET();
    const args = (prismaMock.fixture.findMany.mock.calls[0] as [
      { where: unknown; include?: unknown; select: { proposals: { where: unknown; take: number } } },
    ])[0];
    expect(args.where).toEqual({
      league: { status: "started" },
      OR: [{ homeTeam: { userId: "user-1" } }, { awayTeam: { userId: "user-1" } }],
    });
    expect(args.include).toBeUndefined();
    expect(args.select.proposals.where).toEqual({
      acceptedAt: null,
      closedAt: null,
      NOT: { userId: "user-1" },
    });
    expect(args.select.proposals.take).toBe(1);
  });
});
