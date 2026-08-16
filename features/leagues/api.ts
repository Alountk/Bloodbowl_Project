import type { Team } from "@/features/teams/types";
import type { CasualtyCause } from "@/lib/livePhase";

/** Lifecycle state of a league: joinable/open or locked after a season starts. */
export type LeagueStatus = "open" | "started";

/** Derived matchday lifecycle of a fixture: pending → scheduled → played. */
export type FixtureStatus = "pending" | "scheduled" | "played";

/** The live-match snapshot embedded on an enriched fixture (league detail);
 * null when the fixture has no LiveMatch row (MV-5). Only the card-relevant
 * fields are selected — the full live DTO lives on the per-fixture GET. */
export interface FixtureLiveLite {
  status: "pending" | "ready" | "live" | "finished";
  homeScore: number;
  awayScore: number;
  half: number;
  turnNumber: number;
}

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
  /** "scheduled" when participants agreed a date, "played" when a result is recorded (scores via the result route or a walkover). */
  scheduledAt: string | null;
  /** Winner team id, present once a result is recorded (display + legacy forfeit). Display-only — does not derive `played`. */
  winnerId: string | null;
  /** Final home score, present when a result is recorded (walkover writes 0/2). */
  homeScore?: number | null;
  /** Final away score, present when a result is recorded (walkover writes 0/2). */
  awayScore?: number | null;
  /** Derived lifecycle: pending | scheduled | played (played ⇔ scores present). */
  status: FixtureStatus;
  /** Home team owner (id + name, plus optional avatar), null when unresolvable. */
  homeOwner: { id: string; name: string; avatar?: string | null } | null;
  /** Away team owner (id + name, plus optional avatar), null when unresolvable. */
  awayOwner: { id: string; name: string; avatar?: string | null } | null;
  /** Negotiation history (active + closed) for this fixture. */
  proposals: ScheduleProposal[];
  /** The live-match snapshot when this fixture has a LiveMatch row (pending/
   * ready/live/finished); null when it has none. Drives the card's EN VIVO
   * badge + live score on the Jornadas. */
  live?: FixtureLiveLite | null;
}

/**
 * The (deprecated) league-level turn-clock option (D15). The columns REMAIN on
 * the League row for backward compatibility but are no longer read or written
 * anywhere: the creation UI/API dropped the option, and live matches never
 * consult it. Kept only to type the persisted columns.
 * @deprecated The turn-clock option was removed from creation and never read.
 */
export interface TurnClockOption {
  turnClockEnabled: boolean;
  turnClockSeconds: 120 | 240 | 360;
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
  /**
   * True when the session user has a non-archived member team in this league
   * (server-computed); used to surface started member leagues in the list.
   */
  isMember: boolean;
  /**
   * DEPRECATED (D15): the per-turn clock columns remain on the row for backward
   * compatibility but are never read or written by the current app.
   * @deprecated The turn-clock option no longer constrains live matches.
   */
  turnClockEnabled: boolean;
  /**
   * DEPRECATED (D15): the legacy per-turn clock duration.
   * @deprecated Superseded by the unified server-owned match clock.
   */
  turnClockSeconds: 120 | 240 | 360;
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

/**
 * Creates a league. The deprecated turn-clock option is GONE from the client
 * (D15): the payload carries name + description only, and the server ignores
 * any legacy clock fields (columns keep their DB defaults).
 */
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

/** A single player's per-action report within a result load. */
export interface ResultPlayerAction {
  rosterPlayerId: string;
  tds: number;
  casualties: number;
  completions: number;
  interceptions: number;
  fouls: number;
  throwTeamMates: number;
  landedSafe: number;
}

/** One side's scoreboard + per-player PE credits + mvp nomination list. */
export interface TeamResultInput {
  score: number;
  ballHeld: boolean;
  players: ResultPlayerAction[];
  mvp: { nominations: string[] };
  /**
   * The casualties caused by this team, each naming the victim's team and
   * rosterPlayerId. The server owns the 1D16 outcome roll per victim (the
   * client sends no outcome); the result route persists the injury on the
   * matching Player row.
   */
  casualties: { team: "home" | "away"; rosterPlayerId: string }[];
}

/** The POST/PUT result payload shared by the load and correction routes. */
export interface ResultPayload {
  weather?: string;
  home: TeamResultInput;
  away: TeamResultInput;
}

/** HTTP result of a load or correction, used to refresh the match card. */
export interface ResultOutcome {
  fixtureId: string;
  status: "played";
  homeScore: number;
  awayScore: number;
  winnerId: string | null;
  winnings?: { home: number; away: number };
  pettyCash?: number;
  resultId?: string;
}

/**
 * Loads a fixture's result (participant or league admin). Server-side: validates
 * Σ per-player TDs == score (400), applies winnings/FF/PE/injuries/petty cash in
 * one transaction, and returns 409 on an already-played or forfeited fixture.
 */
export async function submitResult(
  leagueId: string,
  fixtureId: string,
  payload: ResultPayload,
): Promise<ResultOutcome> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return readJson<ResultOutcome>(res);
}

/**
 * Corrects a played result (admin-only). Records a before/after audit
 * `MatchResultCorrection` and re-runs PE, never revoking spent PE.
 */
export async function correctResult(
  leagueId: string,
  fixtureId: string,
  payload: ResultPayload,
): Promise<ResultOutcome> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/result`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return readJson<ResultOutcome>(res);
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

/** A player in a match roster, as served by the per-fixture GET. */
export interface MatchPlayer {
  rosterPlayerId: string;
  name: string;
  positionalKey: string;
  pe: number;
  skills: unknown;
  injuries: unknown;
  alive: boolean;
  valueBonus: number;
}

/** One team side of a match detail: identity, race, coach, and roster. */
export interface MatchTeamDetail {
  id: string;
  name: string;
  raceId: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
  } | null;
  players: MatchPlayer[];
}

/** The persisted `scores` snapshot shape (D4: winnings + mvp are new fields). */
export interface MatchScoreboard {
  home: {
    score: number;
    postFf?: number | null;
    winnings?: number | null;
    casualties: { team: "home" | "away"; rosterPlayerId: string; outcome: { kind: string } }[];
    pe: { rosterPlayerId: string; pe: number }[];
  };
  away: MatchScoreboard["home"];
  winnerId: string | null;
  /** Persisted server-rolled MVP grantee ids (absent on legacy rows → fallback). */
  mvp?: { home: string; away: string } | null;
}

/** The persisted `MatchResult` row served for a played fixture. */
export interface MatchResultRecord {
  id: string;
  fixtureId: string;
  weather: string | null;
  scores: MatchScoreboard;
  pettyCash: number | null;
  loadedBy: string;
  /** Server-side persistence timestamp; the report row date (D6/MVT). The GET
   * route always serves it, so the summary consumes it as required (S4). */
  createdAt: string;
}

/** A single match's normalized payload: fixture, snapshot (or null), rosters. */
export interface MatchDetail {
  fixture: FixtureDraft;
  /** Present for a played fixture with a result; null for a walkover (MV-2). */
  result: (MatchResultRecord & { scores: MatchScoreboard }) | null;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** The shared live-match DTO (state + chronological events) or null when no
   * LiveMatch exists for this fixture (MV-5 static inert). */
  live: LiveMatchView | null;
}

/** The live-match DTO returned by the fixture GET: view state + event feed. */
export interface LiveMatchView extends LiveMatchViewState {
  events: LiveMatchEventDto[];
}

/**
 * Fetches a single match detail (`GET /api/leagues/[id]/fixtures/[fixtureId]`).
 * Auth-gated server-side: 401 unauthenticated, 404 foreign/missing/not-in-
 * league (no existence leak), 200 for owner/member/any-authenticated-in-open.
 */
export async function getMatchDetail(
  leagueId: string,
  fixtureId: string,
): Promise<MatchDetail> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}`,
  );
  return readJson<MatchDetail>(res);
}

/**
 * The unified live-match DTO (LM-5/LM-8/D19): consents + per-side millisecond
 * accumulators + elapsed (server-derived), the per-viewer side, and the
 * kickoff anchor. The deprecated per-turn clock fields are gone.
 */
export interface LiveMatchViewState {
  seq: number;
  status: "pending" | "ready" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  /** Whether each coach has consented to start (LM-11). */
  homeConsented: boolean;
  awayConsented: boolean;
  /** Per-viewer side (D19): null on hub fan-out frames; set on POST/snapshot/GET. */
  viewerSide: "home" | "away" | null;
  /** Kickoff anchor (milliseconds); null before the first turn. */
  startedAt: number | null;
  /** Unified elapsed = accumulated home+away turn time (milliseconds). */
  elapsed: number;
  homeTurnMs: number;
  awayTurnMs: number;
  paused: boolean;
  homeScore: number;
  awayScore: number;
  finishedAt: number | null;
  /** RAU-38: the side that proposed to concede, or null when none is pending. */
  concedeProposedBy: "home" | "away" | null;
  /** RAU-39: the pending casualty proposal (proposer/causer/victim/cause/rolls),
   * or null when none is pending. */
  pendingCasualty: {
    proposerSide: "home" | "away";
    victimRosterId: string;
    causerRosterId: string;
    cause: CasualtyCause;
    roll16: number;
    roll6?: number;
  } | null;
}

/** A chronological live event delivered by the hub (LM-6). */
export interface LiveMatchEventDto {
  seq: number;
  kind: string;
  side: "home" | "away" | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  at: number;
}

/** Control commands the live POST route accepts (LM-4/D10/D11/LM-11/LM-13).
 * `mvp` is deliberately absent (LM-14): it is NEVER a live command — the result
 * route writes it, not the control surface. */
export type LiveCommand =
  | { type: "consent"; side: "home" | "away" }
  | { type: "retractConsent"; side: "home" | "away" }
  | { type: "begin" }
  | { type: "endTurn"; side: "home" | "away" }
  | { type: "td"; side: "home" | "away"; playerRosterId: string }
  | { type: "completion"; side: "home" | "away"; playerRosterId: string }
  | {
      type: "casualty";
      side: "home" | "away";
      victimRosterId: string;
      /** Self-inflicted only (dodge/crowd): the victim's own side records the
       * injury directly, no confirmation. The band is DERIVED server-side from
       * `roll16` — the client never sends a band. */
      cause: CasualtyCause;
      /** The 1D16 injury roll the players actually rolled (1..16). */
      roll16: number;
      /** The 1D6 attribute roll, REQUIRED when the derived band is permanent. */
      roll6?: number;
    }
  | {
      type: "proposeCasualty";
      victimRosterId: string;
      causerRosterId: string;
      /** One of blitz|foul|penetration|block (causer-required causes). */
      cause: CasualtyCause;
      roll16: number;
      roll6?: number;
    }
  | { type: "confirmCasualty" }
  | { type: "foul"; side: "home" | "away"; playerRosterId: string; victimRosterId: string }
  | { type: "requestTurn" }
  | { type: "endMatch" }
  | { type: "concede" }
  | { type: "concedeRespond"; accept: boolean };

/**
 * Sends a live control command via POST .../live. On success returns the new
 * view state (`200 { view }`). On 400/403/404/409 `readJson` throws an Error
 * with a matching `status` for the hook/caller to surface.
 */
export async function sendLiveCommand(
  leagueId: string,
  fixtureId: string,
  command: LiveCommand,
): Promise<LiveMatchViewState> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    },
  );
  const body = await readJson<{ view: LiveMatchViewState }>(res);
  return body.view;
}
