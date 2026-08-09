import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  fixture: {
    findMany: vi.fn(),
  },
  team: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, DELETE, deriveFixtureStatus, enrichFixture, buildRoundsWithCompletion } from "./route";

describe("GET /api/leagues/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(401);
    expect(prismaMock.league.findFirst).not.toHaveBeenCalled();
  });

  it("returns an OPEN league to any authenticated user, with teams, ownerName and empty fixtures", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Public League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: "Owner Coach" },
      status: "open",
      seasonLength: null,
      startedAt: null,
      createdAt: new Date().toISOString(),
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", userId: "user-1", leagueId: "l1", archivedAt: null },
        { id: "t2", name: "Dwarves", raceId: "dwarf", userId: "user-3", leagueId: "l1", archivedAt: null },
      ],
    });

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("l1");
    expect(body.ownerName).toBe("Owner Coach");
    expect(body.status).toBe("open");
    expect(body.teams).toHaveLength(2);
    expect(body.fixtures).toEqual([]);
    // Open league visible regardless of owner → query is scoped by id only.
    expect(prismaMock.league.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" } }),
    );
  });

  it("returns a STARTED league with fixtures to its owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });
    prismaMock.fixture.findMany.mockResolvedValue([
      { id: "f1", round: 1, homeTeamId: "t1", awayTeamId: "t2", leagueId: "l1" },
      { id: "f2", round: 2, homeTeamId: "t2", awayTeamId: "t1", leagueId: "l1" },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("started");
    expect(body.ownerName).toBe("owner@test.local"); // falls back to email
    expect(body.teams).toHaveLength(1);
    expect(body.fixtures).toHaveLength(2);
    expect(body.fixtures[0].round).toBe(1);
    expect(prismaMock.fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leagueId: "l1" } }),
    );
  });

  it("returns a STARTED league with fixtures to a current member (not owner)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } }); // member
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });
    prismaMock.fixture.findMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).teams).toHaveLength(1);
  });

  it("returns 404 for a STARTED league to a foreign non-member (no leak, no fixtures)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-9" } }); // not owner, not member
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });

    const res = await GET(new Request("http://localhost:3000/api/leagues/foreign-started"), {
      params: Promise.resolve({ id: "foreign-started" }),
    } as never);
    expect(res.status).toBe(404);
    // No fixture fetch happens for an unauthorized started league.
    expect(prismaMock.fixture.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a league that does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/leagues/nope"), {
      params: Promise.resolve({ id: "nope" }),
    } as never);
    expect(res.status).toBe(404);
  });
});

describe("matchday fixture enrichment (pure functions)", () => {
  it("derives pending/scheduled/played status from scheduledAt/winnerId", () => {
    expect(deriveFixtureStatus({ scheduledAt: null, winnerId: null })).toBe("pending");
    expect(deriveFixtureStatus({ scheduledAt: new Date(), winnerId: null })).toBe("scheduled");
    expect(deriveFixtureStatus({ scheduledAt: null, winnerId: "t1" })).toBe("played");
    // winnerId overrides scheduledAt (a forfeited scheduled match is played).
    expect(deriveFixtureStatus({ scheduledAt: new Date(), winnerId: "t1" })).toBe("played");
  });

  it("enriches a fixture with status, owners and proposals", () => {
    const fixture = {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: new Date("2026-02-01"),
      scheduledAt: new Date("2026-03-01"),
      winnerId: null,
      homeTeam: { user: { id: "user-1", name: "Coach A", email: "a@x" } },
      awayTeam: { user: { id: "user-2", name: null, email: "b@x" } },
      proposals: [{ id: "p1" }],
    };
    const enriched = enrichFixture(fixture);
    expect(enriched.status).toBe("scheduled");
    expect(enriched.scheduledAt).toEqual(new Date("2026-03-01"));
    expect(enriched.homeOwner).toEqual({ id: "user-1", name: "Coach A" });
    // Owner name falls back to email when no display name.
    expect(enriched.awayOwner).toEqual({ id: "user-2", name: "b@x" });
    expect(enriched.proposals).toHaveLength(1);
    expect(enriched.winnerId).toBeNull();
  });

  it("builds per-round complete flags: all played when every fixture in the round is played", () => {
    const rounds = buildRoundsWithCompletion([
      { id: "f1", round: 1, winnerId: "t1" },
      { id: "f2", round: 1, winnerId: "t2" },
      { id: "f3", round: 2, winnerId: null },
      { id: "f4", round: 2, winnerId: "t1" },
    ]);
    expect(rounds).toEqual([
      { round: 1, fixtures: ["f1", "f2"], complete: true },
      { round: 2, fixtures: ["f3", "f4"], complete: false },
    ]);
  });
});

describe("GET /api/leagues/[id] matchday enrichment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes status/scheduledAt/winnerId/owners/proposals per fixture and round completion", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // league owner
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [],
    });
    const playedFixture = {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: new Date("2026-02-01"),
      scheduledAt: new Date("2026-03-01"),
      winnerId: "t1",
      homeTeam: { user: { id: "user-1", name: "Coach A", email: "a@x" } },
      awayTeam: { user: { id: "user-2", name: "Coach B", email: "b@x" } },
      proposals: [{ id: "p1", acceptedAt: new Date() }],
    };
    const pendingFixture = {
      id: "f2",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t2",
      awayTeamId: "t1",
      createdAt: new Date("2026-02-01"),
      scheduledAt: null,
      winnerId: null,
      homeTeam: { user: { id: "user-2", name: "Coach B", email: "b@x" } },
      awayTeam: { user: { id: "user-1", name: "Coach A", email: "a@x" } },
      proposals: [],
    };
    prismaMock.fixture.findMany.mockResolvedValue([playedFixture, pendingFixture]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixtures[0].status).toBe("played");
    expect(body.fixtures[0].winnerId).toBe("t1");
    expect(body.fixtures[1].status).toBe("pending");
    expect(body.fixtures[1].scheduledAt).toBeNull();
    expect(body.fixtures[0].homeOwner.name).toBe("Coach A");
    expect(body.fixtures[0].proposals).toHaveLength(1);
    // Round with a pending fixture is NOT complete.
    expect(body.rounds).toEqual([
      { round: 1, fixtures: ["f1", "f2"], complete: false },
    ]);
  });

  it("marks a round complete only when every fixture in it is played", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [],
    });
    prismaMock.fixture.findMany.mockResolvedValue([
      { id: "f1", round: 1, homeTeamId: "t1", awayTeamId: "t2", winnerId: "t1", scheduledAt: null, createdAt: new Date(), homeTeam: { user: null }, awayTeam: { user: null }, proposals: [] },
      { id: "f2", round: 1, homeTeamId: "t2", awayTeamId: "t1", winnerId: "t2", scheduledAt: null, createdAt: new Date(), homeTeam: { user: null }, awayTeam: { user: null }, proposals: [] },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    const body = await res.json();
    expect(body.rounds[0].complete).toBe(true);
  });
});

describe("DELETE /api/leagues/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(401);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });

  it("clears member leagueIds (SetNull) and deletes the league for its owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(204);
    // Member teams have their leagueId set to null before the league row is removed.
    expect(prismaMock.team.updateMany).toHaveBeenCalledWith({
      where: { leagueId: "l1" },
      data: { leagueId: null },
    });
    expect(prismaMock.league.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });

  it("returns 404 and performs no mutation for a foreign league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league owned by someone else

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/foreign", { method: "DELETE" }), {
      params: Promise.resolve({ id: "foreign" }),
    } as never);
    expect(res.status).toBe(404);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });

  it("returns 409 and leaves everything intact for a STARTED league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-1",
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
    });

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });
});
