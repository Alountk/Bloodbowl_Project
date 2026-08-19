import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn(), update: vi.fn() },
  player: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { DELETE, PATCH } from "./route";

/** A Team row (id + roster JSON) as returned by the rename route's probe. */
function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    raceId: "human",
    roster: [
      { id: "p1", name: "Marty", positionalKey: "blitzer" },
      { id: "p2", name: "Jane", positionalKey: "lineman" },
    ],
    treasury: 0,
    ...overrides,
  };
}

/** A 12-player human roster (≥ MIN_PLAYERS + 1 so one fire is legal). */
function twelvePlayerRoster() {
  return [
    { id: "p1", name: "Marty", positionalKey: "blitzer" },
    { id: "p2", name: "Jane", positionalKey: "lineman" },
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `l${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    })),
  ];
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

function callDelete(teamId: string, rosterPlayerId: string) {
  return DELETE(
    new Request(`http://localhost/api/teams/${teamId}/players/${rosterPlayerId}`, {
      method: "DELETE",
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

/** Stubs the interactive `$transaction` (callback receives the prisma client). */
function stubInteractiveTransaction() {
  prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof prismaMock) => unknown) =>
    cb(prismaMock),
  );
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

describe("DELETE /api/teams/[id]/players/[playerId] (fire/retire, RAU-10)", () => {
  beforeEach(() => {
    stubInteractiveTransaction();
  });

  it("returns 401 when unauthenticated with no writes", async () => {
    authMock.mockResolvedValue(null);
    const res = await callDelete("t1", "p1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign/archived team (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await callDelete("t1", "p1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the rosterPlayerId is not on the roster", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam({ roster: twelvePlayerRoster() }));
    const res = await callDelete("t1", "pGhost");
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when firing would drop the roster below the 11-player minimum", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.team.findFirst.mockResolvedValue(buildTeam({ roster: eleven }));
    const res = await callDelete("t1", "p1");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/11/);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("removes the entry, decrements the treasury by the cost (no refund), and deletes the Player row", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const roster = twelvePlayerRoster();
    const team = buildTeam({ roster, treasury: 200_000 });
    prismaMock.team.findFirst.mockResolvedValue(team);
    prismaMock.team.update.mockResolvedValue({
      ...team,
      roster: roster.filter((entry) => entry.id !== "p1"),
      treasury: 200_000 - 85_000, // blitzer = 85k, fired with no refund
    });

    const res = await callDelete("t1", "p1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.treasury).toBe(115_000);
    expect(body.roster).toHaveLength(11);
    expect(body.roster.some((entry: { id: string }) => entry.id === "p1")).toBe(false);

    // The team update writes BOTH the roster JSON and the treasury decrement.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        roster: roster.filter((entry) => entry.id !== "p1"),
        treasury: { decrement: 85_000 },
      },
    });
    // The Player row (and cascaded pendingRolls) is deleted inside the same tx.
    expect(prismaMock.player.deleteMany).toHaveBeenCalledWith({
      where: { teamId: "t1", rosterPlayerId: "p1" },
    });
  });

  it("fires a player whose positional cost is unknown with a zero treasury decrement", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const roster = twelvePlayerRoster();
    prismaMock.team.findFirst.mockResolvedValue(
      buildTeam({ roster: [...roster, { id: "ghost", name: "Ghost", positionalKey: "unknown-pos" }] }),
    );
    prismaMock.team.update.mockResolvedValue({
      ...buildTeam(),
      roster: roster,
      treasury: 0,
    });

    const res = await callDelete("t1", "ghost");

    expect(res.status).toBe(200);
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        roster,
        treasury: { decrement: 0 },
      },
    });
  });
});
