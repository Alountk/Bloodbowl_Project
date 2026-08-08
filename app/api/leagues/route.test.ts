import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findMany: vi.fn(),
    create: vi.fn(),
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

  it("lists only the session user's leagues", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const leagues = [
      { id: "l1", name: "North League", ownerId: "user-1", createdAt: new Date().toISOString() },
      { id: "l2", name: "South League", ownerId: "user-1", createdAt: new Date().toISOString() },
    ];
    prismaMock.league.findMany.mockResolvedValue(leagues);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(leagues);
    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user-1" } }),
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
});
