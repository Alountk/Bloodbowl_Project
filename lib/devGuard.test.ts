import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { requireDeveloper } from "./devGuard";

describe("requireDeveloper (RAU-52 dev guard)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await requireDeveloper();
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when the session user row no longer exists", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await requireDeveloper();
    expect(result).toEqual({ ok: false, status: 401, error: "Unauthorized" });
  });

  it("returns 403 for an authenticated non-developer", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "user" });
    const result = await requireDeveloper();
    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
  });

  it("resolves the user id for a developer", async () => {
    authMock.mockResolvedValue({ user: { id: "dev-1" } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "developer" });
    const result = await requireDeveloper();
    expect(result).toEqual({ ok: true, userId: "dev-1" });
    // The role is read from the DATABASE (authoritative), not the JWT.
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "dev-1" },
      select: { role: true },
    });
  });
});
