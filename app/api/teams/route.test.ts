import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  league: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, POST } from "./route";

describe("GET /api/teams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.team.findMany).not.toHaveBeenCalled();
  });

  it("lists only the session user's teams", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const teams = [
      { id: "t1", name: "Reavers", userId: "user-1" },
      { id: "t2", name: "Dwarves", userId: "user-1" },
    ];
    prismaMock.team.findMany.mockResolvedValue(teams);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(teams);
    // Query is scoped to the session user id and excludes archived teams.
    expect(prismaMock.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", archivedAt: null } }),
    );
  });

  it("excludes archived teams from the returned list", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // The route must pass an archivedAt: null filter so archived rows never leak.
    prismaMock.team.findMany.mockResolvedValue([
      { id: "t1", name: "Reavers", userId: "user-1" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("t1");
  });
});

describe("POST /api/teams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Reavers", raceId: "human", roster: [], coaching: {} }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  it("creates a team owned by the session user and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.create.mockResolvedValue({
      id: "team-1",
      userId: "user-1",
      name: "Reavers",
    });

    const payload = {
      name: "Reavers",
      raceId: "human",
      roster: Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, positionalKey: "lineman" })),
      coaching: { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
    };
    const res = await POST(
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("team-1");

    // userId is injected from the session, not accepted from the client.
    expect(prismaMock.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1", name: "Reavers" }),
      }),
    );
    // New teams start unassigned: leagueId null and no leagueType is written.
    expect(prismaMock.team.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leagueId: null }),
      }),
    );
    const createData = prismaMock.team.create.mock.calls[0][0].data;
    expect(createData).not.toHaveProperty("leagueType");
  });

  it("rejects a payload missing a team name with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({ raceId: "human" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  it("rejects a roster below the 11-player minimum with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Half Squad",
          raceId: "human",
          roster: Array.from({ length: 2 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, positionalKey: "lineman" })),
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  it("rejects a roster above the 16-player cap with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify({
          name: "Oversized",
          raceId: "human",
          roster: Array.from({ length: 17 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, positionalKey: "lineman" })),
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.team.create).not.toHaveBeenCalled();
  });

  describe("POST /api/teams with leagueId (RAU-56 create-on-join)", () => {
    const elevenLinemen = () =>
      Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, positionalKey: "lineman" }));
    const body = (overrides: Record<string, unknown> = {}) => ({
      name: "League Reavers",
      raceId: "human",
      roster: elevenLinemen(),
      coaching: { rerolls: 0, dedicatedFans: 0, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
      ...overrides,
    });
    const ruleset = {
      id: "r1",
      races: ["human", "orc"],
      startingTreasury: 1_200_000,
      tvCap: null,
      minPlayers: 11,
      maxPlayers: 16,
    };
    const openLeague = { id: "l1", status: "open", rulesetId: "r1", ruleset };
    const req = (payload: unknown) =>
      new Request("http://localhost:3000/api/teams", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" },
      });

    it("creates the team already assigned to the league with the ruleset treasury", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue(openLeague);
      prismaMock.team.findFirst.mockResolvedValue(null); // no existing member
      prismaMock.team.create.mockResolvedValue({ id: "team-1" });

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(201);
      expect(prismaMock.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leagueId: "l1",
            startingTreasury: 1_200_000,
          }),
        }),
      );
    });

    it("returns 404 for an unknown league", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue(null);

      const res = await POST(req(body({ leagueId: "ghost" })));
      expect(res.status).toBe(404);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a started league with 409 (no new teams)", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue({ id: "l1", status: "started", rulesetId: null, ruleset: null });

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(409);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a second team per user in the league with 409 (RAU-54)", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue(openLeague);
      prismaMock.team.findFirst.mockResolvedValue({ id: "existing" });

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(409);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a race outside the ruleset with 400", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue(openLeague);
      prismaMock.team.findFirst.mockResolvedValue(null);

      const res = await POST(req(body({ raceId: "skaven", leagueId: "l1" })));
      expect(res.status).toBe(400);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a roster below the ruleset minimum with 400", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue({
        ...openLeague,
        ruleset: { ...ruleset, minPlayers: 13 },
      });
      prismaMock.team.findFirst.mockResolvedValue(null);

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(400);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a cost over the ruleset starting treasury with 400", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // 11 Human linemen cost 550k > the 500k treasury.
      prismaMock.league.findFirst.mockResolvedValue({
        ...openLeague,
        ruleset: { ...ruleset, startingTreasury: 500_000 },
      });
      prismaMock.team.findFirst.mockResolvedValue(null);

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(400);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });

    it("rejects a cost over the ruleset TV cap with 400", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.league.findFirst.mockResolvedValue({
        ...openLeague,
        ruleset: { ...ruleset, tvCap: 500_000 },
      });
      prismaMock.team.findFirst.mockResolvedValue(null);

      const res = await POST(req(body({ leagueId: "l1" })));
      expect(res.status).toBe(400);
      expect(prismaMock.team.create).not.toHaveBeenCalled();
    });
  });
});
