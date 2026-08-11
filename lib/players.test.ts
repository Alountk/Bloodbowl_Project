import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  player: { createMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ensurePlayersForTeam } from "./players";
import type { PlayerEntry } from "@/features/teams/types";

const ROSTER: PlayerEntry[] = Array.from({ length: 11 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  positionalKey: i === 0 ? "thrower" : "liner",
}));

describe("ensurePlayersForTeam (player-progression reconciliation)", () => {
  beforeEach(() => {
    prismaMock.player.createMany.mockReset();
    prismaMock.player.createMany.mockResolvedValue({ count: ROSTER.length });
  });

  it("backfills one Player row per roster entry, mapped by rosterPlayerId", async () => {
    await ensurePlayersForTeam("t1", ROSTER);
    expect(prismaMock.player.createMany).toHaveBeenCalledTimes(1);
    const arg = prismaMock.player.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toHaveLength(11);
    // idempotent unique key
    expect(arg.data[0]).toMatchObject({
      teamId: "t1",
      rosterPlayerId: "p1",
      name: "Player 1",
      positionalKey: "thrower",
    });
    // all rows carry the progression defaults
    for (const row of arg.data) {
      expect(row).toMatchObject({
        pe: 0,
        skills: [],
        injuries: [],
        alive: true,
        valueBonus: 0,
        improvements: [],
        attributeIncreases: {},
      });
    }
  });

  it("stays idempotent across repeated calls via skipDuplicates", async () => {
    await ensurePlayersForTeam("t1", ROSTER);
    await ensurePlayersForTeam("t1", ROSTER);
    expect(prismaMock.player.createMany).toHaveBeenCalledTimes(2);
    const each = prismaMock.player.createMany.mock.calls.map((call) => call[0].skipDuplicates);
    expect(each).toEqual([true, true]);
  });

  it("skips rows for roster ids that no longer exist (no orphans)", async () => {
    await ensurePlayersForTeam("t1", ROSTER.slice(0, 4));
    const arg = prismaMock.player.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(4);
    const ids = arg.data.map((row: { rosterPlayerId: string }) => row.rosterPlayerId);
    expect(ids).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("makes no write when the roster is empty", async () => {
    await ensurePlayersForTeam("t1", []);
    expect(prismaMock.player.createMany).not.toHaveBeenCalled();
  });
});
