import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { applyRosterOrder, PATCH } from "./route";
import type { PlayerEntry } from "@/features/teams/types";

/** A Team row (id + roster JSON) as returned by the reorder route's probe. */
function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    roster: [
      { id: "p1", name: "Marty", positionalKey: "blitzer" },
      { id: "p2", name: "Jane", positionalKey: "lineman" },
      { id: "p3", name: "Dunk", positionalKey: "thrower" },
    ],
    ...overrides,
  };
}

function callRoute(teamId: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/teams/${teamId}/roster-order`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: teamId }) } as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.team.findFirst.mockResolvedValue(buildTeam());
  prismaMock.team.update.mockResolvedValue({ id: "t1" });
});

describe("applyRosterOrder (pure validation)", () => {
  const roster: PlayerEntry[] = buildTeam().roster;

  it("accepts a valid permutation, preserving the entries", () => {
    const res = applyRosterOrder(roster, ["p3", "p1", "p2"]);
    expect(res).toEqual({
      ok: true,
      roster: [
        { id: "p3", name: "Dunk", positionalKey: "thrower" },
        { id: "p1", name: "Marty", positionalKey: "blitzer" },
        { id: "p2", name: "Jane", positionalKey: "lineman" },
      ],
    });
  });

  it("rejects a non-array order", () => {
    expect(applyRosterOrder(roster, "p1,p2,p3")).toEqual({
      ok: false,
      error: "order must be an array of roster player ids",
    });
    expect(applyRosterOrder(roster, undefined)).toEqual({
      ok: false,
      error: "order must be an array of roster player ids",
    });
  });

  it("rejects a non-string id in the order", () => {
    expect(applyRosterOrder(roster, ["p1", 2, "p3"])).toEqual({
      ok: false,
      error: "order must contain only roster player ids",
    });
  });

  it("rejects duplicates (missing counterpart)", () => {
    expect(applyRosterOrder(roster, ["p1", "p1", "p2"])).toEqual({
      ok: false,
      error: "order must contain every roster player exactly once",
    });
  });

  it("rejects a too-short order (missing ids)", () => {
    expect(applyRosterOrder(roster, ["p1", "p2"])).toEqual({
      ok: false,
      error: "order must contain every roster player exactly once",
    });
  });

  it("rejects a too-long order (foreign ids included)", () => {
    expect(applyRosterOrder(roster, ["p1", "p2", "p3", "p4"])).toEqual({
      ok: false,
      error: "order must contain every roster player exactly once",
    });
  });

  it("rejects a foreign id replacing a roster id", () => {
    expect(applyRosterOrder(roster, ["p1", "pGhost", "p3"])).toEqual({
      ok: false,
      error: "order contains ids outside the team's roster",
    });
  });

  it("accepts an empty order for an empty roster (defensive no-op)", () => {
    expect(applyRosterOrder([], [])).toEqual({ ok: true, roster: [] });
  });
});

describe("PATCH /api/teams/[id]/roster-order", () => {
  it("returns 401 when unauthenticated with no write", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute("t1", { order: ["p2", "p1", "p3"] });
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign/archived team (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await callRoute("t1", { order: ["p2", "p1", "p3"] });
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid order set (foreign id)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", { order: ["p1", "pGhost", "p3"] });
    expect(res.status).toBe(400);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body (missing order)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", {});
    expect(res.status).toBe(400);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("persists the reordered roster JSON and returns it", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const next = buildTeam({
      roster: [
        { id: "p3", name: "Dunk", positionalKey: "thrower" },
        { id: "p1", name: "Marty", positionalKey: "blitzer" },
        { id: "p2", name: "Jane", positionalKey: "lineman" },
      ],
    });
    prismaMock.team.update.mockResolvedValue(next);

    const res = await callRoute("t1", { order: ["p3", "p1", "p2"] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roster: next.roster });
    // Only the roster JSON sequence changes; the team row is a single write.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { roster: next.roster },
    });
  });
});
