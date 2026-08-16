/**
 * League standings + season-close logic (RAU-40).
 *
 * `computeStandings` derives a per-team table from a league's fixtures using
 * the user-approved scoring: 3 points per win, 1 per draw, 0 per loss, with
 * tiebreakers in order — points → TD difference (for − against) → TDs for →
 * head-to-head → team id (stable display order). Head-to-head resolves a tie
 * group from ONLY the direct fixtures between the tied teams (the winner of a
 * direct match ranks higher; a drawn or missing direct match keeps them tied
 * and the id order wins). Everything here is pure and deterministically
 * unit-testable; the fixtures come from `maybeCloseLeague`.
 */

import type { Prisma } from "@prisma/client";

/** Lifecycle states a league transitions through (mirrors the Prisma enum). */
export type LeagueStatus = "open" | "started" | "finished";

/** The fixture subset the standings need: teams + recorded scores/winner. */
export interface StandingsFixture {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
}

/** One league team's aggregated season row, pre-sort. */
export interface StandingsRow {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tdFor: number;
  tdAgainst: number;
  tdDiff: number;
}

const emptyRow = (teamId: string): StandingsRow => ({
  teamId,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  points: 0,
  tdFor: 0,
  tdAgainst: 0,
  tdDiff: 0,
});

/** Only fixtures with BOTH scores recorded count toward the standings. */
function playedFixtures(fixtures: readonly StandingsFixture[]): StandingsFixture[] {
  return fixtures.filter(
    (f) => f.homeScore != null && f.awayScore != null,
  );
}

/** Primary tiebreaker key: points → tdDiff → tdFor (all descending). */
function primaryKey(row: StandingsRow): [number, number, number] {
  return [-row.points, -row.tdDiff, -row.tdFor];
}

/** Descending points → tdDiff → tdFor; 0 means a primary tie. */
function comparePrimary(a: StandingsRow, b: StandingsRow): number {
  const [ak, bk] = [primaryKey(a), primaryKey(b)];
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return ak[i] - bk[i];
  }
  return 0;
}

/** Terminal comparator: primary keys, then team id for a stable order. */
function compareFinal(a: StandingsRow, b: StandingsRow): number {
  return comparePrimary(a, b) || a.teamId.localeCompare(b.teamId);
}

/**
 * Head-to-head: sorts a PRIMARY tie group from ONLY the direct fixtures among
 * its members, re-applying the same scoring/tiebreaker chain (a direct-match
 * winner collects 3 mini-points and therefore ranks higher; a drawn or absent
 * direct match keeps them tied → team id for a stable order). Deterministic.
 * The mini table is a terminal sort (no further head-to-head), so the chain is
 * exactly: points → tdDiff → tdFor → head-to-head → id.
 */
function resolveHeadToHead(group: StandingsRow[], fixtures: readonly StandingsFixture[]): StandingsRow[] {
  const memberIds = new Set(group.map((r) => r.teamId));
  const direct = playedFixtures(fixtures).filter(
    (f) =>
      memberIds.has(f.homeTeamId) &&
      memberIds.has(f.awayTeamId) &&
      f.homeTeamId !== f.awayTeamId,
  );
  const mini = buildRows(direct).sort(compareFinal);
  const order = new Map(mini.map((row, index) => [row.teamId, index]));
  // The mini table covers exactly the group's members; any member without a
  // direct fixture has no mini row → sorts after the ones that do, then by id.
  return [...group].sort((a, b) => {
    const ai = order.get(a.teamId) ?? Number.MAX_SAFE_INTEGER;
    const bi = order.get(b.teamId) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi || a.teamId.localeCompare(b.teamId);
  });
}

/** Pure: aggregates played fixtures into per-team rows (unsorted). */
function buildRows(fixtures: readonly StandingsFixture[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  const ensure = (teamId: string): StandingsRow => {
    let row = rows.get(teamId);
    if (!row) {
      row = emptyRow(teamId);
      rows.set(teamId, row);
    }
    return row;
  };

  for (const f of playedFixtures(fixtures)) {
    const home = ensure(f.homeTeamId);
    const away = ensure(f.awayTeamId);
    const homeScore = f.homeScore as number;
    const awayScore = f.awayScore as number;
    home.played += 1;
    away.played += 1;
    home.tdFor += homeScore;
    home.tdAgainst += awayScore;
    away.tdFor += awayScore;
    away.tdAgainst += homeScore;
    if (homeScore > awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (homeScore < awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }
  for (const row of rows.values()) row.tdDiff = row.tdFor - row.tdAgainst;
  return Array.from(rows.values());
}

/**
 * Pure: computes the standings table from a league's fixtures.
 *
 * Only fixtures with both scores recorded count (a `winnerId`-only or pending
 * fixture is ignored). Rows are sorted by the approved tiebreaker chain; a
 * primary tie (points/tdDiff/tdFor equal) is resolved head-to-head and then by
 * team id. The input is never mutated.
 */
export function computeStandings(fixtures: readonly StandingsFixture[]): StandingsRow[] {
  const list = buildRows(fixtures).sort(comparePrimary);
  const resolved: StandingsRow[] = [];
  let i = 0;
  while (i < list.length) {
    let end = i;
    while (end + 1 < list.length && comparePrimary(list[end], list[end + 1]) === 0) end++;
    if (end === i) {
      resolved.push(list[i]);
    } else {
      resolved.push(...resolveHeadToHead(list.slice(i, end + 1), fixtures));
    }
    i = end + 1;
  }
  return resolved;
}

/** Pure: the champion is the first standings row; null when no result exists. */
export function championFromStandings(standings: readonly StandingsRow[]): string | null {
  return standings.length === 0 ? null : standings[0].teamId;
}

/** Pure: every fixture of the league has both scores recorded. A league with no
 * fixtures at all is never "all played" (there is nothing to decide a season). */
export function allFixturesPlayed(fixtures: readonly StandingsFixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => f.homeScore != null && f.awayScore != null);
}

/** Minimal Prisma transaction surface `maybeCloseLeague` needs (the real
 * Prisma `TransactionClient` and the live-store `StoreTx` both satisfy it). */
export interface LeagueCloseTx {
  league: {
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: LeagueStatus } | null>;
    update(args: {
      where: { id: string };
      data: { status: "finished"; championTeamId: string | null };
    }): Promise<unknown>;
  };
  fixture: {
    findMany(args: {
      where: { leagueId: string };
      select: {
        homeTeamId: true;
        awayTeamId: true;
        homeScore: true;
        awayScore: true;
        winnerId: true;
      };
    }): Promise<StandingsFixture[]>;
  };
}

/**
 * Closes a STARTED league once every fixture is played: computes the standings,
 * declares the champion and flips the league to `finished` — atomically with
 * the caller's transaction (result load, forfeit or concede accept). Idempotent:
 * an already-finished league (or one that still has fixtures to play) is a no-op.
 */
export async function maybeCloseLeague(tx: LeagueCloseTx, leagueId: string): Promise<void> {
  const league = await tx.league.findUnique({
    where: { id: leagueId },
    select: { status: true },
  });
  if (!league || league.status !== "started") return;

  const fixtures = await tx.fixture.findMany({
    where: { leagueId },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      winnerId: true,
    },
  });
  if (!allFixturesPlayed(fixtures)) return;

  const standings = computeStandings(fixtures);
  await tx.league.update({
    where: { id: leagueId },
    data: { status: "finished", championTeamId: championFromStandings(standings) },
  });
}
