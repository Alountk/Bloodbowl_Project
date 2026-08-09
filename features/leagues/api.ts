import type { Team } from "@/features/teams/types";

/** Lifecycle state of a league: joinable/open or locked after a season starts. */
export type LeagueStatus = "open" | "started";

/** Derived matchday lifecycle of a fixture: pending → scheduled → played. */
export type FixtureStatus = "pending" | "scheduled" | "played";

/** A proposed match date for a fixture (negotiation history/active row). */
export interface ScheduleProposal {
  id: string;
  fixtureId: string;
  userId: string;
  date: string;
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
}

/** A single scheduled pairing within a round (jornada), from the server. */
export interface FixtureDraft {
  id: string;
  leagueId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  createdAt: string;
  /** "scheduled" when participants agreed a date, "played" when forfeited. */
  scheduledAt: string | null;
  /** Set by the league owner's forfeit; derives `played`. */
  winnerId: string | null;
  /** Derived lifecycle: pending | scheduled | played. */
  status: FixtureStatus;
  /** Home team owner (id + name), null when unresolvable. */
  homeOwner: { id: string; name: string } | null;
  /** Away team owner (id + name), null when unresolvable. */
  awayOwner: { id: string; name: string } | null;
  /** Negotiation history (active + closed) for this fixture. */
  proposals: ScheduleProposal[];
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
  /** The owner of this member team (used to detect the session user's membership). */
  userId: string;
  roster: unknown;
  coaching: unknown;
}

/** A league detail response: the league plus its member teams and fixtures. */
export interface LeagueDetail extends League {
  teams: LeagueMemberTeam[];
  /** Round-robin fixtures when started; [] while open. */
  fixtures: FixtureDraft[];
  /** Per-round completion flags (a round is complete when every fixture is played). */
  rounds: FixtureRound[];
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

/**
 * Starts a round-robin season for the owner's OPEN league. The server validates
 * seasonLength in `1..teams-1` (default `teams-1`) inside a transaction and
 * returns the started league with its fixtures.
 */
export async function startLeague(
  leagueId: string,
  seasonLength: number,
): Promise<LeagueDetail> {
  const res = await fetch(`/api/leagues/${encodeURIComponent(leagueId)}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seasonLength }),
  });
  return readJson<LeagueDetail>(res);
}

/** Removes the session user's own team from its league (self-leave) while OPEN. */
export async function selfLeave(
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

/**
 * Proposes a match date for a fixture's negotiation. Only the owner of the
 * home or away team may propose (server 401/404). POST `{ date }` returns the
 * new active proposal; the prior active proposal is closed in the same tx.
 */
export async function proposeFixtureDate(
  leagueId: string,
  fixtureId: string,
  date: string,
): Promise<ScheduleProposal> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/propose`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    },
  );
  return readJson<ScheduleProposal>(res);
}

/**
 * Accepts another participant's active proposal, scheduling the fixture. Only
 * the OTHER participant may accept (creator self-accept → 409).
 */
export async function acceptFixtureProposal(
  leagueId: string,
  fixtureId: string,
  proposalId: string,
): Promise<FixtureDraft> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/accept`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId }),
    },
  );
  return readJson<FixtureDraft>(res);
}

/**
 * Awards a walkover defeat (admin-only) to the opponent of `winnerTeamId`,
 * setting the fixture's winner and deriving `played`. Closes open proposals.
 */
export async function forfeitFixture(
  leagueId: string,
  fixtureId: string,
  winnerTeamId: string,
): Promise<FixtureDraft> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/forfeit`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ winnerTeamId }),
    },
  );
  return readJson<FixtureDraft>(res);
}

/**
 * Fetches the full negotiation history for a fixture (participants/admin only;
 * 404 otherwise). Ordered newest-first.
 */
export async function getFixtureProposals(
  leagueId: string,
  fixtureId: string,
): Promise<ScheduleProposal[]> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/proposals`,
  );
  return readJson<ScheduleProposal[]>(res);
}

/** Read-only scouting data for a foreign team (owner/league-owner/member only). */
export interface ScoutedTeamDetail {
  id: string;
  name: string;
  raceId: string;
  roster: unknown;
  coaching: unknown;
  leagueId: string | null;
}

/** A round (jornada) with its fixtures and whether every match is played. */
export interface FixtureRound {
  round: number;
  /** The fixtures in this round. */
  fixtures: FixtureDraft[];
  /** True when every fixture in the round derives `played`. */
  complete: boolean;
}

/**
 * Fetches a team's read-only scouting detail (`GET /api/teams/[id]`). Returns
 * 404 for outsiders/archived teams so rivals cannot be scouted without access.
 */
export async function getScoutedTeam(teamId: string): Promise<ScoutedTeamDetail> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}`);
  return readJson<ScoutedTeamDetail>(res);
}
