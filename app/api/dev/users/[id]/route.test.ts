import { describe, expect, it, vi, beforeEach } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/devGuard", () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { PATCH } from "./route";

const req = (body: unknown) =>
  new Request("http://localhost:3000/api/dev/users/u1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("PATCH /api/dev/users/[id] (RAU-52)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ ok: true, userId: "dev-1" });
  });

  it("returns 401 without a session", async () => {
    requirePermissionMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const res = await PATCH(req({ role: "developer" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 403 without the users.manage permission", async () => {
    requirePermissionMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const res = await PATCH(req({ role: "developer" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates a user's plan", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", role: "user" });
    prismaMock.user.update.mockResolvedValue({ id: "u1", email: "a@test.local", name: "A", role: "user", plan: "club" });

    const res = await PATCH(req({ plan: "club" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" }, data: { plan: "club" } }),
    );
  });

  it("updates a user's role", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", role: "user" });
    prismaMock.user.update.mockResolvedValue({ id: "u1", email: "a@test.local", name: "A", role: "developer", plan: "free" });

    const res = await PATCH(req({ role: "developer" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "developer" } }),
    );
  });

  it("rejects an invalid role value with 400", async () => {
    const res = await PATCH(req({ role: "superuser" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid plan value with 400", async () => {
    const res = await PATCH(req({ plan: "vip" }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an empty body with 400", async () => {
    const res = await PATCH(req({}), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await PATCH(req({ plan: "club" }), { params: Promise.resolve({ id: "ghost" }) });
    expect(res.status).toBe(404);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("blocks changing your OWN role with 400 (no self-lockout), own plan allowed", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "dev-1", role: "developer" });
    const res = await PATCH(req({ role: "user" }), { params: Promise.resolve({ id: "dev-1" }) });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();

    prismaMock.user.update.mockResolvedValue({ id: "dev-1", email: "d@test.local", name: "D", role: "developer", plan: "premium" });
    const planRes = await PATCH(req({ plan: "premium" }), { params: Promise.resolve({ id: "dev-1" }) });
    expect(planRes.status).toBe(200);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: "premium" } }),
    );
  });
});
