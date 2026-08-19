import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDeveloperMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  ruleset: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/devGuard", () => ({ requireDeveloper: requireDeveloperMock }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, POST } from "./route";

const validBody = {
  name: "Liga Tier 1",
  description: "Solo razas de élite.",
  races: ["human", "orc", "dwarf"],
  startingTreasury: 1100000,
  tvCap: 1150000,
  minPlayers: 11,
  maxPlayers: 16,
  hireFire: "between-jornadas",
  seasonReform: true,
  mercenaries: false,
  active: true,
};

describe("GET /api/dev/rulesets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for an unauthenticated caller", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.ruleset.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-developer", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(prismaMock.ruleset.findMany).not.toHaveBeenCalled();
  });

  it("lists all rulesets (active and inactive) as DTOs", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findMany.mockResolvedValue([
      {
        id: "r1",
        name: "Estándar BB2025",
        description: null,
        races: ["human", "orc"],
        startingTreasury: 1000000,
        tvCap: null,
        minPlayers: 11,
        maxPlayers: 16,
        hireFire: "between-jornadas",
        seasonReform: true,
        mercenaries: false,
        active: true,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("r1");
    expect(body[0].races).toEqual(["human", "orc"]);
    expect(body[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    // Every ruleset appears to developers, inactive included.
    expect(prismaMock.ruleset.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" } });
  });
});

describe("POST /api/dev/rulesets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 for an unauthenticated caller", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await POST(new Request("http://localhost:3000/api/dev/rulesets", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(401);
    expect(prismaMock.ruleset.create).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-developer", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await POST(new Request("http://localhost:3000/api/dev/rulesets", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid fields and never creates", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    const res = await POST(new Request("http://localhost:3000/api/dev/rulesets", {
      method: "POST",
      body: JSON.stringify({ ...validBody, name: "" }),
      headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("name is required");
    expect(prismaMock.ruleset.create).not.toHaveBeenCalled();
  });

  it("rejects a races list outside the catalog (400)", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    const res = await POST(new Request("http://localhost:3000/api/dev/rulesets", {
      method: "POST",
      body: JSON.stringify({ ...validBody, races: ["chaos-dwarf-extra"] }),
      headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(400);
    expect(prismaMock.ruleset.create).not.toHaveBeenCalled();
  });

  it("creates the ruleset with createdBy injected from the session", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.create.mockResolvedValue({
      id: "r-new",
      ...validBody,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const res = await POST(new Request("http://localhost:3000/api/dev/rulesets", {
      method: "POST",
      body: JSON.stringify(validBody),
      headers: { "content-type": "application/json" },
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("r-new");
    expect(body.races).toEqual(["human", "orc", "dwarf"]);
    // createdBy comes from the session, never from the client payload.
    expect(prismaMock.ruleset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ createdBy: "dev-1", name: "Liga Tier 1" }),
    });
    const createData = prismaMock.ruleset.create.mock.calls[0][0].data;
    expect(createData.createdBy).toBe("dev-1");
    expect(createData).not.toHaveProperty("id");
  });
});
