import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
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
      roster: [{ id: "p1", name: "Player 1", positionalKey: "lineman" }],
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
});
