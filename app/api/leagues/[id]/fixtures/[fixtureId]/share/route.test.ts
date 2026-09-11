import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/devGuard", () => ({ requirePermission: requirePermissionMock }));

import { POST } from "./route";

function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    league: {
      ownerId: "user-owner",
      teams: [{ userId: "user-1" }, { userId: "user-2" }],
    },
    homeTeam: { userId: "user-1" },
    awayTeam: { userId: "user-2" },
    ...overrides,
  };
}

function share(fixtureId = "f1", leagueId = "l1") {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/share`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

describe("POST /api/leagues/[id]/fixtures/[fixtureId]/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    prismaMock.fixture.findUnique.mockResolvedValue({ shareToken: null });
    prismaMock.fixture.update.mockResolvedValue({ id: "f1" });
  });

  it("returns 401 when unauthenticated and never reads the fixture", async () => {
    authMock.mockResolvedValue(null);
    const res = await share();
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the fixture is missing or belongs to another league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await share();
    expect(res.status).toBe(404);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("mints a stable URL-safe token for the home team owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());

    const res = await share();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(prismaMock.fixture.update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { shareToken: body.token },
    });
  });

  it("mints for the away team owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());

    const res = await share();

    expect(res.status).toBe(200);
    expect(prismaMock.fixture.update).toHaveBeenCalledTimes(1);
  });

  it("mints for the league owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());

    const res = await share();

    expect(res.status).toBe(200);
  });

  it("mints for a developer/admin holding live.manage", async () => {
    authMock.mockResolvedValue({ user: { id: "user-dev" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    requirePermissionMock.mockResolvedValue({ ok: true, userId: "user-dev" });

    const res = await share();

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("live.manage");
  });

  it("returns 403 for a spectator member and mints nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: { userId: "someone-else" },
        awayTeam: { userId: "another" },
      }),
    );

    const res = await share();

    expect(res.status).toBe(403);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign non-member and mints nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-stranger" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: { userId: "someone-else" },
        awayTeam: { userId: "another" },
      }),
    );

    const res = await share();

    expect(res.status).toBe(404);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns the existing token idempotently without a new write", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.fixture.findUnique.mockResolvedValue({ shareToken: "existing-token" });

    const res = await share();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: "existing-token" });
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });
});
