import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, POST } from "./route";

describe("GET /api/leagues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.league.findMany).not.toHaveBeenCalled();
  });

  it("lists open leagues of any user plus the session user's own leagues, with ownerName and memberCount", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const leagues = [
      {
        id: "open-foreign",
        name: "Public League",
        ownerId: "user-2",
        owner: { id: "user-2", email: "other@test.local", name: "Other Coach" },
        status: "open",
        seasonLength: null,
        startedAt: null,
        createdAt: new Date().toISOString(),
        _count: { teams: 3 },
      },
      {
        id: "own-started",
        name: "My Started League",
        ownerId: "user-1",
        owner: { id: "user-1", email: "me@test.local", name: null },
        status: "started",
        seasonLength: 2,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        _count: { teams: 2 },
      },
    ];
    prismaMock.league.findMany.mockResolvedValue(leagues);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Each item carries the resolved owner name and the server-computed count.
    expect(body[0].ownerName).toBe("Other Coach");
    expect(body[0].memberCount).toBe(3);
    expect(body[1].ownerName).toBe("me@test.local"); // falls back to email when name is null
    expect(body[1].memberCount).toBe(2);

    // Query is the union: all open + own (any status), with owner + _count
    // memberCount computed in the query (no per-league N+1 detail fetch).
    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ status: "open" }, { ownerId: "user-1" }] },
        include: expect.objectContaining({
          owner: expect.objectContaining({
            select: expect.objectContaining({ email: true }),
          }),
          _count: expect.objectContaining({
            select: expect.objectContaining({
              teams: expect.objectContaining({
                where: { archivedAt: null },
              }),
            }),
          }),
        }),
      }),
    );
  });
});

describe("POST /api/leagues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "North League" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("creates a league owned by the session user and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-1",
      name: "North League",
      description: null,
      ownerId: "user-1",
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "North League", description: "Autumn league" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("league-1");

    // ownerId is injected from the session, never accepted from the client.
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          name: "North League",
          description: "Autumn league",
        }),
      }),
    );
  });

  it("returns 409 when the league name already exists globally", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Duplicate" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(409);
    expect(prismaMock.league.create).toHaveBeenCalled();
  });

  it("returns 400 when the name is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("defaults the turn-clock option to enabled at 240 seconds when omitted", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-1",
      name: "Coast League",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Coast League" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    // The omitted option persists the League defaults (enabled @ 240), so the
    // create call passes through the DB defaults and the response carries them.
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "user-1", name: "Coast League" }),
      }),
    );
    const body = await res.json();
    expect(body.turnClockEnabled).toBe(true);
    expect(body.turnClockSeconds).toBe(240);
  });

  it("persists an explicit enabled option at 240 seconds", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-2",
      name: "Navy League",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Navy League", turnClockEnabled: true, turnClockSeconds: 240 }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.turnClockEnabled).toBe(true);
    expect(body.turnClockSeconds).toBe(240);
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ turnClockEnabled: true, turnClockSeconds: 240 }),
      }),
    );
  });

  it("returns 400 and creates no league for an invalid clock duration", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Invalid Clock", turnClockEnabled: true, turnClockSeconds: 3600 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("rejects a 120|240|360-invalid duration even when the explicit value is not 3600", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Bad Duration", turnClockEnabled: true, turnClockSeconds: 90 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("only ever CREATES leagues — no update path exists for the immutable option", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-3",
      name: "Immutable",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: false,
      turnClockSeconds: 120,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Immutable", turnClockEnabled: false, turnClockSeconds: 120 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.league.update).not.toHaveBeenCalled();
    // The create call carries the chosen values straight through; POST never
    // exposes a league-update path, so the option is immutable by construction.
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ turnClockEnabled: false, turnClockSeconds: 120 }),
      }),
    );
  });
});
