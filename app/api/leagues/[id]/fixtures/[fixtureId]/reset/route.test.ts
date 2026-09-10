import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const requirePermissionMock = vi.hoisted(() => vi.fn());
const resetLiveMatchMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  liveMatch: { findFirst: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/devGuard", () => ({ requirePermission: requirePermissionMock }));
vi.mock("@/lib/liveStore", () => ({ resetLiveMatch: resetLiveMatchMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";

function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    winnerId: null,
    homeScore: null,
    awayScore: null,
    result: null,
    league: {
      id: "l1",
      status: "started",
      ownerId: "user-owner",
      teams: [{ userId: "user-owner" }, { userId: "user-1" }, { userId: "user-2" }],
    },
    ...overrides,
  };
}

function buildLiveMatch(overrides: Record<string, unknown> = {}) {
  return { id: "lm1", fixtureId: "f1", seq: 5, status: "live", ...overrides };
}

function reset(fixtureId = "f1", leagueId = "l1") {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/reset`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

describe("POST /api/leagues/[id]/fixtures/[fixtureId]/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no live.manage grant (a plain member/foreign user).
    requirePermissionMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
  });

  it("returns 401 when unauthenticated and resets nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await reset();
    expect(res.status).toBe(401);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the fixture does not belong to the league (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await reset();
    expect(res.status).toBe(404);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 409 for a finished league and resets nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ league: { id: "l1", status: "finished", ownerId: "user-owner", teams: [] } }),
    );
    const res = await reset();
    expect(res.status).toBe(409);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a not-started (open) league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ league: { id: "l1", status: "open", ownerId: "user-owner", teams: [] } }),
    );
    const res = await reset();
    expect(res.status).toBe(404);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign non-member (no existence leak) and resets nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-foreign" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await reset();
    expect(res.status).toBe(404);
    expect(requirePermissionMock).toHaveBeenCalledWith("live.manage");
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a participant member without live.manage", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await reset();
    expect(res.status).toBe(403);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a spectator member without live.manage", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await reset();
    expect(res.status).toBe(403);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("resets as the league owner, bypassing the permission check", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.liveMatch.findFirst.mockResolvedValue(buildLiveMatch());

    const res = await reset();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(prismaMock.fixture.findFirst).toHaveBeenCalledWith({
      where: { id: "f1", leagueId: "l1" },
      include: expect.objectContaining({ league: expect.anything() }),
    });
    expect(resetLiveMatchMock).toHaveBeenCalledWith(
      { fixtureId: "f1", prevSeq: 5 },
      expect.objectContaining({ prisma: prismaMock }),
    );
  });

  it("resets as a developer/admin via live.manage even when not the owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-dev" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.liveMatch.findFirst.mockResolvedValue(buildLiveMatch({ seq: 9 }));
    requirePermissionMock.mockResolvedValue({ ok: true, userId: "user-dev" });

    const res = await reset();

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("live.manage");
    expect(resetLiveMatchMock).toHaveBeenCalledWith(
      { fixtureId: "f1", prevSeq: 9 },
      expect.objectContaining({ prisma: prismaMock }),
    );
  });

  it("returns 409 when the fixture is already played (scores present)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ homeScore: 2, awayScore: 1 }));
    const res = await reset();
    expect(res.status).toBe(409);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a persisted result marks the fixture played", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ result: { id: "r1" } }));
    const res = await reset();
    expect(res.status).toBe(409);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the fixture has no LiveMatch", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);
    const res = await reset();
    expect(res.status).toBe(409);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the LiveMatch is already finished (wizard territory)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.liveMatch.findFirst.mockResolvedValue(buildLiveMatch({ status: "finished" }));
    const res = await reset();
    expect(res.status).toBe(409);
    expect(resetLiveMatchMock).not.toHaveBeenCalled();
  });
});
