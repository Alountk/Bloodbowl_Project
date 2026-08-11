import { prisma } from "@/lib/prisma";
import type { PlayerEntry } from "@/features/teams/types";

/**
 * Lazy, idempotent Player backfill from a team's roster JSON (source of truth
 * for identities). Creates one Player row per roster entry, linked by the
 * unique `(teamId, rosterPlayerId)` key; `skipDuplicates` makes re-runs safe.
 * Rows are only created for ids present in `roster`, so stale ids never orphan
 * a row. The Player record owns progression state only; names/positionals come
 * from the roster entry.
 */
export async function ensurePlayersForTeam(
  teamId: string,
  roster: readonly PlayerEntry[],
): Promise<void> {
  if (roster.length === 0) return;
  await prisma.player.createMany({
    data: roster.map((entry) => ({
      teamId,
      rosterPlayerId: entry.id,
      name: entry.name,
      positionalKey: entry.positionalKey,
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      valueBonus: 0,
      improvements: [],
      attributeIncreases: {},
    })),
    skipDuplicates: true,
  });
}
