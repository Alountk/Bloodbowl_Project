import type { Team } from "@/features/teams/types";

/** Lifecycle state of a league: joinable/open or locked after a season starts. */
export type LeagueStatus = "open" | "started";

/** A single scheduled pairing within a round (jornada), from the server. */
export interface FixtureDraft {
  id: string;
  leagueId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  createdAt: string;
}

/** A League as returned by the `/api/leagues` list routes. */
export interface League {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
  status: LeagueStatus;
  seasonLength: number | null;
  startedAt: string | null;
  /** Resolved owner display name (falls back to the owner's email). */
  ownerName: string | null;
  /** Number of non-archived member teams, computed server-side (no N+1). */
  memberCount: number;
}

/** A member team as returned inside the league detail (Prisma Team shape). */
export interface LeagueMemberTeam {
  id: string;
  name: string;
  raceId: string;
  leagueId: string | null;
  roster: unknown;
  coaching: unknown;
}

/** A league detail response: the league plus its member teams and fixtures. */
export interface LeagueDetail extends League {
  teams: LeagueMemberTeam[];
  /** Round-robin fixtures when started; [] while open. */
  fixtures: FixtureDraft[];
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(body?.error ?? `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * Server-backed leagues API wrapper. Mirrors the fetch-with-session pattern of
 * `ApiTeamStore`: every call hits the user-scoped `/api/leagues` routes and the
 * API returns 401 when unauthenticated. Callers surface network/status errors.
 */
export async function listLeagues(): Promise<League[]> {
  const res = await fetch("/api/leagues");
  return readJson<League[]>(res);
}

export async function createLeague(
  name: string,
  description: string | null,
): Promise<League> {
  const res = await fetch("/api/leagues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  return readJson<League>(res);
}

export async function getLeagueDetail(id: string): Promise<LeagueDetail> {
  const res = await fetch(`/api/leagues/${encodeURIComponent(id)}`);
  return readJson<LeagueDetail>(res);
}

export async function assignTeam(
  leagueId: string,
  teamId: string,
): Promise<Team> {
  const res = await fetch(`/api/leagues/${encodeURIComponent(leagueId)}/teams`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamId }),
  });
  return readJson<Team>(res);
}

export async function expelTeam(
  leagueId: string,
  teamId: string,
): Promise<Team> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/members/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
  return readJson<Team>(res);
}

/** A team as returned by the user-scoped `/api/teams` route. */
export interface ApiTeamForAssign {
  id: string;
  name: string;
  raceId: string;
  leagueId: string | null;
}

/**
 * Fetches the session user's teams for the league-detail assign select and
 * filters to those currently unassigned (a team can belong to only one league).
 */
export async function listUnassignedTeams(): Promise<ApiTeamForAssign[]> {
  const res = await fetch("/api/teams");
  const teams = await readJson<ApiTeamForAssign[]>(res);
  return teams.filter((t) => t.leagueId === null);
}
