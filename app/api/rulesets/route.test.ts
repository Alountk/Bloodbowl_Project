import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  ruleset: { findMany: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "./route";

describe("GET /api/rulesets (public active rulesets)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.ruleset.findMany).not.toHaveBeenCalled();
  });

  it("lists only ACTIVE rulesets for any authenticated user (id + name + description)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.ruleset.findMany.mockResolvedValue([
      { id: "estandar-bb2025", name: "Estándar BB2025", description: "Base" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: "estandar-bb2025", name: "Estándar BB2025", description: "Base" }]);
    // Inactive rulesets never reach the create selector.
    expect(prismaMock.ruleset.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    });
  });
});
