import { describe, expect, it, vi, beforeEach } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/devGuard", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET } from "./route";

describe("GET /api/dev/users (RAU-52 user manager)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without a session", async () => {
    requirePermissionMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 for a user without the users.manage permission", async () => {
    requirePermissionMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it("lists every account with role and plan", async () => {
    requirePermissionMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    const users = [
      { id: "u1", email: "a@test.local", name: "A", role: "user", plan: "free", createdAt: "2026-01-01" },
      { id: "u2", email: "b@test.local", name: "B", role: "developer", plan: "club", createdAt: "2026-01-02" },
    ];
    prismaMock.user.findMany.mockResolvedValue(users);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(users);
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ role: true, plan: true }),
      }),
    );
  });
});
