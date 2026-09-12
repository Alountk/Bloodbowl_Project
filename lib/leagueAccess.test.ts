import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { getDbRole, resolveLeagueAccess } from "./leagueAccess";

describe("resolveLeagueAccess (LAC-2)", () => {
  it("resolves the owner FIRST regardless of role", () => {
    // A plain user who owns the league is the owner, not privileged/foreign.
    expect(
      resolveLeagueAccess({
        userId: "u1",
        role: "user",
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("owner");
    // An admin who owns the league is still the owner (owner precedes role).
    expect(
      resolveLeagueAccess({
        userId: "u1",
        role: "admin",
        ownerId: "u1",
        isMember: true,
      }),
    ).toBe("owner");
  });

  it("resolves a non-owner developer/admin as privileged", () => {
    expect(
      resolveLeagueAccess({
        userId: "dev",
        role: "developer",
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("privileged");
    expect(
      resolveLeagueAccess({
        userId: "adm",
        role: "admin",
        ownerId: "u1",
        isMember: true,
      }),
    ).toBe("privileged");
  });

  it("never makes a plain user privileged (falls through)", () => {
    expect(
      resolveLeagueAccess({
        userId: "u2",
        role: "user",
        ownerId: "u1",
        isMember: true,
      }),
    ).toBe("member");
    expect(
      resolveLeagueAccess({
        userId: "u2",
        role: "user",
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("foreign");
    // Unknown / missing roles are never privileged either.
    expect(
      resolveLeagueAccess({
        userId: "u2",
        role: null,
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("foreign");
    expect(
      resolveLeagueAccess({
        userId: "u2",
        role: "mystery",
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("foreign");
  });

  it("treats an anonymous caller as foreign (no owner match, no role)", () => {
    expect(
      resolveLeagueAccess({
        userId: null,
        role: undefined,
        ownerId: "u1",
        isMember: false,
      }),
    ).toBe("foreign");
  });

  it("does not treat a null ownerId as an owner match", () => {
    expect(
      resolveLeagueAccess({
        userId: "u1",
        role: "user",
        ownerId: null,
        isMember: false,
      }),
    ).toBe("foreign");
  });
});

describe("getDbRole (LAC-1: DB is authoritative, never the JWT)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the role from the database by user id", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "developer" });
    await expect(getDbRole("dev-1")).resolves.toBe("developer");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "dev-1" },
      select: { role: true },
    });
  });

  it("returns null when the user row no longer exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(getDbRole("ghost")).resolves.toBeNull();
  });
});
