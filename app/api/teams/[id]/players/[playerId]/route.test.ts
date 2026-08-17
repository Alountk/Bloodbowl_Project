import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn(), update: vi.fn() },
  player: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { PATCH } from "./route";

/** A Team row (id + roster JSON) as returned by the rename route's probe. */
function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    roster: [
      { id: "p1", name: "Marty", positionalKey: "blitzer" },
      { id: "p2", name: "Jane", positionalKey: "lineman" },
    ],
    ...overrides,
  };
}

function callRoute(teamId: string, rosterPlayerId: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/teams/${teamId}/players/${rosterPlayerId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: teamId, playerId: rosterPlayerId }) } as never,
  );
}

/** Stubs the batch `$transaction` to run the array of write ops in order. */
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(async (ops: { then?: unknown }[]) => {
    for (const op of ops) await op;
    return ops;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
  prismaMock.team.findFirst.mockResolvedValue(buildTeam());
  prismaMock.player.findUnique.mockResolvedValue({ id: "p-row-1" });
  prismaMock.player.update.mockResolvedValue({ id: "p-row-1" });
  prismaMock.team.update.mockResolvedValue({ id: "t1" });
});

describe("PATCH /api/teams/[id]/players/[playerId]", () => {
  it("returns 401 when unauthenticated with no write", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute("t1", "p1", { name: "Aldric" });
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign team (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await callRoute("t1", "p1", { name: "Aldric" });
    expect(res.status).toBe(404);
    expect(prismaMock.player.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the player does not belong to the team", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.player.findUnique.mockResolvedValue(null);
    const res = await callRoute("t1", "pGhost", { name: "Aldric" });
    expect(res.status).toBe(404);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });

  it("rejects a blank name with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", "p1", { name: "   " });
    expect(res.status).toBe(400);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 50 characters with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", "p1", { name: "x".repeat(51) });
    expect(res.status).toBe(400);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });

  it("renames the Player row and the roster JSON entry, returning the trimmed name", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const res = await callRoute("t1", "p1", { name: "  Aldric  " });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body).toEqual({ name: "Aldric" });

    // Player.name updated for the (teamId, rosterPlayerId) key.
    expect(prismaMock.player.update).toHaveBeenCalledWith({
      where: { teamId_rosterPlayerId: { teamId: "t1", rosterPlayerId: "p1" } },
      data: { name: "Aldric" },
    });
    // The roster JSON entry keeps the identity source of truth in sync.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        roster: [
          { id: "p1", name: "Aldric", positionalKey: "blitzer" },
          { id: "p2", name: "Jane", positionalKey: "lineman" },
        ],
      },
    });
  });

  it("rejects a non-string name with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", "p1", { name: 42 });
    expect(res.status).toBe(400);
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });
});
