import { describe, expect, it, vi, beforeEach } from "vitest";

const requireDeveloperMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  ruleset: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  league: {
    count: vi.fn(),
  },
}));

vi.mock("@/lib/devGuard", () => ({ requireDeveloper: requireDeveloperMock }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { DELETE, PATCH } from "./route";

const existingRow = {
  id: "r1",
  name: "Estándar BB2025",
  description: "Base",
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
};

function patchRequest(body: unknown, id = "r1") {
  return new Request(`http://localhost:3000/api/dev/rulesets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("PATCH /api/dev/rulesets/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401/403 through the shared guard", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await PATCH(patchRequest({ name: "X" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
    expect(prismaMock.ruleset.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "X" }, "missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    expect(prismaMock.ruleset.update).not.toHaveBeenCalled();
  });

  it("returns 400 on an invalid partial field", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    const res = await PATCH(patchRequest({ startingTreasury: -1 }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(400);
    expect(prismaMock.ruleset.update).not.toHaveBeenCalled();
  });

  it("re-validates the MERGED shape so min ≤ max always holds", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(existingRow);
    // existing minPlayers = 11; patch pushes maxPlayers below it.
    const res = await PATCH(patchRequest({ maxPlayers: 10 }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(400);
    expect(prismaMock.ruleset.update).not.toHaveBeenCalled();
  });

  it("applies a valid partial update and returns the DTO", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(existingRow);
    prismaMock.ruleset.update.mockResolvedValue({ ...existingRow, active: false });

    const res = await PATCH(patchRequest({ active: false }), {
      params: Promise.resolve({ id: "r1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
    // Only the provided field changes; the rest come from the stored row.
    expect(prismaMock.ruleset.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ active: false, name: "Estándar BB2025", minPlayers: 11 }),
    });
    const updateData = prismaMock.ruleset.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("createdBy");
    expect(updateData).not.toHaveProperty("id");
  });

  it("supports clearing the TV cap via tvCap null", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue({ ...existingRow, tvCap: 1150000 });
    prismaMock.ruleset.update.mockResolvedValue({ ...existingRow, tvCap: null });

    const res = await PATCH(patchRequest({ tvCap: null }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.ruleset.update.mock.calls[0][0].data.tvCap).toBeNull();
  });
});

describe("DELETE /api/dev/rulesets/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401/403 through the shared guard", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await DELETE(new Request("http://localhost:3000/api/dev/rulesets/r1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(401);
    expect(prismaMock.ruleset.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown id", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost:3000/api/dev/rulesets/missing", { method: "DELETE" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when a league references the ruleset (no silent unlink)", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(existingRow);
    prismaMock.league.count.mockResolvedValue(2);

    const res = await DELETE(new Request("http://localhost:3000/api/dev/rulesets/r1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(409);
    expect(prismaMock.ruleset.delete).not.toHaveBeenCalled();
  });

  it("hard-deletes an unreferenced ruleset (204)", async () => {
    requireDeveloperMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.ruleset.findUnique.mockResolvedValue(existingRow);
    prismaMock.league.count.mockResolvedValue(0);
    prismaMock.ruleset.delete.mockResolvedValue(existingRow);

    const res = await DELETE(new Request("http://localhost:3000/api/dev/rulesets/r1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(res.status).toBe(204);
    expect(prismaMock.league.count).toHaveBeenCalledWith({ where: { rulesetId: "r1" } });
    expect(prismaMock.ruleset.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
  });
});
