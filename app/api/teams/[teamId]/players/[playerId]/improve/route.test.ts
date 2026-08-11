import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn() },
  player: { findUnique: vi.fn(), update: vi.fn() },
  playerPendingRoll: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const randomMock = vi.hoisted(() => ({
  rollD6: vi.fn(),
  rollD8: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/random", () => randomMock);

import { POST } from "./route";
import type { PlayerAttribute } from "@/lib/rules/improvements";
import type { SkillColumn } from "@/lib/rules/skills";

/** A Team row as returned by the improve route's team.findFirst query. */
function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "user-1",
    raceId: "human",
    ...overrides,
  };
}

/** A Player row (progression state) for the roster player referenced in the URL. */
function buildPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-row-1",
    teamId: "t1",
    rosterPlayerId: "p1",
    name: "Marty",
    positionalKey: "blitzer", // human Blitzer: accessPrimary ["G","F"], accessSecondary ["A"]
    pe: 20,
    skills: [],
    injuries: [],
    alive: true,
    valueBonus: 0,
    improvements: [],
    attributeIncreases: {},
    _pendingRolls: null,
    ...overrides,
  };
}

function callRoute(teamId: string, rosterPlayerId: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/teams/${teamId}/players/${rosterPlayerId}/improve`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ teamId, playerId: rosterPlayerId }) } as never,
  );
}

/** Stubs the `$transaction` callback with a passthrough tx holding the mocks. */
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        player: { update: prismaMock.player.update },
        playerPendingRoll: { delete: prismaMock.playerPendingRoll.delete },
      };
      return cb(tx as never);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
  prismaMock.team.findFirst.mockResolvedValue(buildTeam());
  prismaMock.player.findUnique.mockResolvedValue(buildPlayer());
  prismaMock.player.update.mockResolvedValue({ id: "p-row-1" });
  prismaMock.playerPendingRoll.delete.mockResolvedValue({ id: "pr-1" });
});

describe("POST /api/teams/[teamId]/players/[playerId]/improve", () => {
  describe("authorization and player guards", () => {
    it("returns 401 when unauthenticated with no write", async () => {
      authMock.mockResolvedValue(null);
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "block" });
      expect(res.status).toBe(401);
      expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    });

    it("returns 404 for a foreign team (no existence leak)", async () => {
      authMock.mockResolvedValue({ user: { id: "user-other" } });
      prismaMock.team.findFirst.mockResolvedValue(null);
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "block" });
      expect(res.status).toBe(404);
      expect(prismaMock.player.findUnique).not.toHaveBeenCalled();
    });

    it("returns 404 when the player row does not exist", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.player.findUnique.mockResolvedValue(null);
      const res = await callRoute("t1", "pGhost", { type: "primary", skillId: "block" });
      expect(res.status).toBe(404);
    });

    it("returns 409 when the player is dead (alive guard, no mutation)", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.player.findUnique.mockResolvedValue(
        buildPlayer({ alive: false, pe: 100 }),
      );
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "block" });
      expect(res.status).toBe(409);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });
  });

  describe("random-roll", () => {
    it("re-rolls until an eligible candidate appears and stores a pending roll", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // Both 2D6 rolls land (1,3) in G → Forcejear (block 1-3, row 3); duplicate collapses.
      randomMock.rollD6
        .mockReturnValueOnce(1).mockReturnValueOnce(3) // roll A: (1,3) G → Forcejear
        .mockReturnValueOnce(1).mockReturnValueOnce(3); // roll B: same → Forcejear (duplicate)
      prismaMock.playerPendingRoll.upsert.mockResolvedValue({ id: "pr-1" });

      const res = await callRoute("t1", "p1", { type: "random-roll", category: "G" as SkillColumn });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.kind).toBe("random");
      expect(Array.isArray(body.candidates)).toBe(true);
      expect(body.candidates).toContain("Forcejear");
      expect(body.cost).toBe(3); // 1ª azar
      // Both 2D6 rolls land (1,3) in G → Forcejear (block 1-3, row 3) twice; a
      // duplicate collapses to the single candidate (spec R3), so roll2 stays null.
      expect(prismaMock.playerPendingRoll.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: "p-row-1" },
          create: expect.objectContaining({ kind: "random:G", roll1: 2, roll2: null }),
          update: expect.objectContaining({ kind: "random:G", roll1: 2, roll2: null }),
        }),
      );
    });

    it("returns 400 for a category the positional cannot access", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // Human Blitzer accessPrimary ["G","F"], accessSecondary ["A"] — P (Pase) not accessible.
      const res = await callRoute("t1", "p1", { type: "random-roll", category: "P" as SkillColumn });
      expect(res.status).toBe(400);
      expect(prismaMock.playerPendingRoll.upsert).not.toHaveBeenCalled();
    });

    it("re-rolls when the first roll lands only skills the player already owns", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // Player owns wrestle (es "Forcejear") → first G roll (1,3) twice collapses to
      // Forcejear, which is owned → the server re-rolls to a fresh (6,4) G roll.
      prismaMock.player.findUnique.mockResolvedValue(buildPlayer({ skills: ["wrestle"] }));
      randomMock.rollD6
        .mockReturnValueOnce(1).mockReturnValueOnce(3) // roll A: Forcejear (owned)
        .mockReturnValueOnce(1).mockReturnValueOnce(3) // roll B: Forcejear (owned) → re-roll
        .mockReturnValueOnce(6).mockReturnValueOnce(4) // re-roll A: (6,4) G → Provocar (block 4-6 row 4)
        .mockReturnValueOnce(6).mockReturnValueOnce(4); // re-roll B: Provocar again (duplicate)
      prismaMock.playerPendingRoll.upsert.mockResolvedValue({ id: "pr-1" });

      const res = await callRoute("t1", "p1", { type: "random-roll", category: "G" as SkillColumn });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.candidates).toContain("Provocar");
    });

    it("returns 400 when the player cannot afford the azar cost", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.player.findUnique.mockResolvedValue(buildPlayer({ pe: 2 }));
      const res = await callRoute("t1", "p1", { type: "random-roll", category: "G" as SkillColumn });
      expect(res.status).toBe(400);
      expect(prismaMock.playerPendingRoll.upsert).not.toHaveBeenCalled();
    });
  });

  describe("random-pick", () => {
    const pendingRoll = {
      id: "pr-1",
      playerId: "p-row-1",
      kind: "random:G",
      roll1: 2, // Forcejear (block 1-3, row 3)
      roll2: 5, // Patada (block 1-3, row 6)
      createdAt: new Date(),
    };

    it("completes the roll, deducts PE, appends the skill, and clears the pending", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.playerPendingRoll.findUnique.mockResolvedValue(pendingRoll);
      prismaMock.player.update.mockResolvedValue({ id: "p-row-1" });

      const res = await callRoute("t1", "p1", {
        type: "random-pick",
        selectedSkill: "Forcejear",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skill).toBe("Forcejear");
      expect(body.peRemaining).toBe(17); // 20 - 3
      // The pending record is cleared after the pick.
      expect(prismaMock.playerPendingRoll.delete).toHaveBeenCalledWith({
        where: { playerId: "p-row-1" },
      });
      // Player persisted: subtracted 3 PE, appended Forcejear, valueBonus recomputed.
      const update = prismaMock.player.update.mock.calls[0][0];
      expect(update.where).toEqual({ teamId_rosterPlayerId: { teamId: "t1", rosterPlayerId: "p1" } });
      expect(update.data.pe).toBe(17);
      expect(update.data.skills).toEqual(["Forcejear"]);
      expect(update.data.improvements).toHaveLength(1);
    });

    it("returns 400 when there is no pending roll (pick without roll)", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.playerPendingRoll.findUnique.mockResolvedValue(null);
      const res = await callRoute("t1", "p1", { type: "random-pick", selectedSkill: "Agallas" });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });

    it("returns 400 when the picked skill is not one of the pending candidates", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.playerPendingRoll.findUnique.mockResolvedValue(pendingRoll);
      const res = await callRoute("t1", "p1", { type: "random-pick", selectedSkill: "Placar" });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });
  });

  describe("primary and secondary picks", () => {
    it("purchases a primary skill within access, deducting the primary cost", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // human Blitzer accessPrimary ["G","F"]; block is general → G. cost 1ª primary = 6.
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "block" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.skill).toBe("block");
      expect(body.peRemaining).toBe(14); // 20 - 6
      const update = prismaMock.player.update.mock.calls[0][0];
      expect(update.data.pe).toBe(14);
      expect(update.data.skills).toEqual(["block"]);
      // Élite (block) → +20.000 value bonus.
      expect(update.data.valueBonus).toBe(20_000);
    });

    it("rejects a secondary pick whose category is not in accessSecondary", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      // human Blitzer accessSecondary ["A"] — kick (general→G) not secondary-accessible.
      const res = await callRoute("t1", "p1", { type: "secondary", skillId: "kick" });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });

    it("rejects a trait skill (not purchasable) with 400", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "stunty" });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });

    it("rejects a duplicate skill the player already owns", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      prismaMock.player.findUnique.mockResolvedValue(
        buildPlayer({ skills: ["throw-team-mate"] }),
      );
      const res = await callRoute("t1", "p1", { type: "primary", skillId: "throw-team-mate" });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });
  });

  describe("attribute", () => {
    it("applies an attribute within the rolled 1D8 options and records the increase", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      randomMock.rollD8.mockReturnValueOnce(7); // 7 → {ag, st} (AG o FU)
      const res = await callRoute("t1", "p1", {
        type: "attribute",
        attribute: "st" as PlayerAttribute,
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.attribute).toBe("st");
      expect(body.peRemaining).toBe(6); // 20 - 14 (1ª atributo)
      const update = prismaMock.player.update.mock.calls[0][0];
      expect(update.data.pe).toBe(6);
      expect(update.data.attributeIncreases).toEqual({ st: 1 });
      // Attribute increase does not append a skill (no `skills` key written).
      expect(update.data.skills).toBeUndefined();
    });

    it("rejects an attribute not in the rolled 1D8 options", async () => {
      authMock.mockResolvedValue({ user: { id: "user-1" } });
      randomMock.rollD8.mockReturnValueOnce(7); // {ag, st} only — ma not eligible
      const res = await callRoute("t1", "p1", { type: "attribute", attribute: "ma" as PlayerAttribute });
      expect(res.status).toBe(400);
      expect(prismaMock.player.update).not.toHaveBeenCalled();
    });
  });
});
