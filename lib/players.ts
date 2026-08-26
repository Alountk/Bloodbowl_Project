import { prisma } from "@/lib/prisma";
import type { PlayerEntry } from "@/features/teams/types";

/** Pure: maps each team's Player `pe` rows onto its roster entries (by
 * `rosterPlayerId`). Entries without a Player row keep their shape. */
export function attachPeToRoster(
  roster: readonly PlayerEntry[],
  players: readonly { rosterPlayerId: string; pe: number }[],
): PlayerEntry[] {
  const peById = new Map(players.map((player) => [player.rosterPlayerId, player.pe]));
  return roster.map((entry) =>
    peById.has(entry.id) ? { ...entry, pe: peById.get(entry.id) } : entry,
  );
}

/**
 * DB (RAU-14): attaches each team's Player `pe` onto its roster entries in one
 * query — the roster views (scouting, league member lists) then show the
 * experience without a per-team progression fetch.
 */
export async function attachPeToTeams<T extends { id: string; roster: unknown }>(
  teams: readonly T[],
): Promise<T[]> {
  if (teams.length === 0) return teams as T[];
  const rows = await prisma.player.findMany({
    where: { teamId: { in: teams.map((team) => team.id) } },
    select: { teamId: true, rosterPlayerId: true, pe: true },
  });
  const peByTeam = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let byId = peByTeam.get(row.teamId);
    if (!byId) {
      byId = new Map();
      peByTeam.set(row.teamId, byId);
    }
    byId.set(row.rosterPlayerId, row.pe);
  }
  return teams.map((team) => {
    const byId = peByTeam.get(team.id);
    if (!byId) return team;
    const roster = Array.isArray(team.roster) ? (team.roster as PlayerEntry[]) : [];
    const rows = Array.from(byId, ([rosterPlayerId, pe]) => ({ rosterPlayerId, pe }));
    return { ...team, roster: attachPeToRoster(roster, rows) };
  });
}

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
