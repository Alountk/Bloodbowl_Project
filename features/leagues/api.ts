import type { Team } from "@/features/teams/types";
import type { CasualtyCause } from "@/lib/livePhase";
import type { RulesetDto } from "@/lib/rulesets";

/** Lifecycle state of a league: joinable/open, locked after a season starts, or
 * definitively closed once every fixture is played (champion declared, RAU-40). */
export type LeagueStatus = "open" | "started" | "finished";

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
  /** RAU-40: the season champion's team id when the league finished; null while
   * open/started or when no result was ever recorded. */
  championTeamId: string | null;
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
  /** RAU-52: the ruleset this league plays under (picked at creation); null
   * for legacy leagues created before rulesets existed. */
  rulesetId: string | null;
  /** Resolved ruleset display name (server-joined), null with `rulesetId`. */
  rulesetName: string | null;
}

/** An ACTIVE ruleset offered in the league-creation selector (RAU-52). */
export interface ActiveRuleset {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Fetches the ACTIVE rulesets a new league may pick (`GET /api/rulesets`, any
 * authenticated user). Falls back to an empty list when the endpoint is
 * unreachable so anonymous/local mode still renders the create form.
 */
export async function listActiveRulesets(): Promise<ActiveRuleset[]> {
  const res = await fetch("/api/rulesets");
  if (!res.ok) return [];
  return (await res.json()) as ActiveRuleset[];
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
  /** RAU-56: the league's FULL ruleset (races, treasury, min/max, TV cap) when
   * one is set — the create-team-on-join wizard preconfigures from it. Null for
   * legacy leagues without a ruleset. Optional so legacy test fixtures compile;
   * the API always returns it (null when absent). */
  ruleset?: RulesetDto | null;
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
 * (D15): the payload carries name + description + the chosen `rulesetId`
 * (RAU-52; null keeps the legacy no-ruleset behavior) only, and the server
 * ignores any legacy clock fields (columns keep their DB defaults).
 */
export async function createLeague(
  name: string,
  description: string | null,
  rulesetId: string | null,
): Promise<League> {
  const res = await fetch("/api/leagues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description, rulesetId }),
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
  treasury: number;
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
  /** RAU-12: unavailable for this match — a lasting-band casualty of the team's previous match. */
  missNextMatch: boolean;
  valueBonus: number;
  /** RAU-13: a match-only Journeyman (Novato) completing the lineup — no `Player`
   * row, never awarded PE. Absent/false on real roster players. */
  journeyman?: boolean;
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
  /** RAU-44: the per-team winnings persisted ONCE at live finish (`{ home,
   * away }`), or null when the match never finished live (pending/live/no row)
   * or has no persisted winnings yet. IGNORED once `result` is non-null — the
   * snapshot's `scores.*.winnings` are the official numbers. */
  liveWinnings: { home: number; away: number } | null;
}

/** The live-match DTO returned by the fixture GET: view state + event feed. */
export interface LiveMatchView extends LiveMatchViewState {
  events: LiveMatchEventDto[];
  /** RAU-14: the persisted per-side journeymen (`{ home: [{ id, name }], away:
   * [{ id, name }] }`) — exposed even for a FINISHED/resolved match so the
   * post-resolve HIRE flow can read them; null when the row has none. Absent
   * on SSE/hub frames (only the fixture GET sets it). */
  journeymen?: JourneymenState | null;
  /** The revealed MVP grantees (`{ home, away }` rosterPlayerIds), persisted by
   * the BOTH-sides reveal — the casualties step shows them; null per side until
   * the reveal runs. Fixture-GET only (SSE/hub frames omit it). */
  mvpGrantees?: { home: string | null; away: string | null };
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
/** RAU-51: the persisted per-side MJP nominations (null per side = that coach
 * has not nominated yet) — the resolution modal renders the per-coach pickers
 * and gates the server roll on BOTH sides. */
mvpNominations: { home: string[] | null; away: string[] | null };
/** The per-side resolution wizard cursor — the modal resumes at the persisted
 * step after a close/refresh (defaults to "winnings" while never started). */
resolutionState: ResolutionState;
}

/** The per-side resolution wizard step cursor (see the store's `ResolutionState`
 * for the full contract). The modal advances the side through the steps and
 * resumes at the persisted step after a close/refresh. */
export interface ResolutionSideState {
  step: "winnings" | "fans" | "mvp" | "mvp-done" | "casualties" | "journeymen" | "done";
  fansDone: boolean;
  fans: { roll: number; before: number; after: number; direction: "up" | "stay" | "down" } | null;
  mvpConfirmed: boolean;
  mvpRolled: boolean;
  casualtiesDone: boolean;
  journeymenDone: boolean;
}

/** The persisted per-side resolution state exposed by the fixture GET. */
export interface ResolutionState {
  home: ResolutionSideState;
  away: ResolutionSideState;
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
  /** Design B: the rival's non-blocking acknowledgement of the card. Optional
   * so older fixtures/streams default to `pending` (the UI treats missing as
   * pending). */
  ackStatus?: "pending" | "ok" | "nok";
  ackAt?: number | null;
  ackedBy?: string | null;
}

/** Control commands the live POST route accepts (LM-4/D10/D11/LM-11/LM-13).
 * The resolution commands (RAU-49/RAU-51) are server-owned: `nominateMvp`
 * submits a coach's OWN side's six nominations, `rollMvp` rolls from the
 * PERSISTED per-side nominations (never a body) and `resolveMatch` closes the
 * match from that same persisted state. */
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
      /** The causer, REQUIRED for blitz/foul/block (the active coach's own
       * player, opposite the victim). Absent for self-inflicted dodge/crowd.
       * The band is DERIVED server-side from `roll16` — never client-chosen. */
      causerRosterId?: string;
      cause: CasualtyCause;
      /** The 1D16 injury roll the players actually rolled (1..16). */
      roll16: number;
      /** The 1D6 attribute roll, REQUIRED when the derived band is permanent. */
      roll6?: number;
      /** LM-12 additive marker (absent for a plain block): set by the NON-active
       * coach on the both-down casualty they record — rival blocker victim,
       * own defender causer, cause `block`. Accepted ONLY on that shape. */
      bothDown?: boolean;
    }
  | {
      /** Design B: the RIVAL acknowledges an event card — "ok" (seen &
       * correct) or "nok" (discrepancy). Informational only, never blocks. */
      type: "acknowledgeEvent";
      eventSeq: number;
      status: "ok" | "nok";
    }
  | { type: "foul"; side: "home" | "away"; playerRosterId: string; victimRosterId: string }
  | { type: "requestTurn" }
  | { type: "endMatch" }
  | { type: "concede" }
  | { type: "concedeRespond"; accept: boolean }
  | {
      /** RAU-51: a coach submits THEIR OWN side's six MJP nominations (the
       * route enforces the caller owns that side's team; dead/suspended players
       * are rejected server-side, RAU-12). Replaces that side's persisted
       * nominations; both sides gate the roll. */
      type: "nominateMvp";
      side: "home" | "away";
      players: string[];
    }
  | {
      /** RAU-49: server-owned PREVIEW roll for the resolution modal — requires
       * BOTH sides' persisted nominations (RAU-51) and reveals the rolled MVP
       * grantees + post-match FF WITHOUT persisting anything until the commit
       * (`resolveMatch` reuses the previewed values). */
      type: "rollMvp";
    }
  | {
      /** RAU-49: THE end-of-match closure — persists the PE awards, treasuries,
       * post-match FF, the MatchResult row, closes the fixture (idempotent for
       * the concede walkover) and runs `maybeCloseLeague` in ONE transaction.
       * RAU-51: rolls/reuses the persisted per-side nominations, never a body.
       * Wizard gate: BOTH sides must have reached the "done" step. */
      type: "resolveMatch";
    }
  | {
      /** Per-side wizard step 1 advance: "Ganancias y mantenimiento" → fans.
       * Persists the side's cursor (display-only step). */
      type: "resolutionWinningsSeen";
      side: "home" | "away";
    }
  | {
      /** Per-side wizard step 2: the SERVER-OWNED dedicated-fans 1D6 roll,
       * applied to the team's `coaching.dedicatedFans` + persisted in the
       * cursor (the side stays on "fans" so the roll is visible). */
      type: "resolutionFanRoll";
      side: "home" | "away";
    }
  | {
      /** Per-side wizard step advance: fans → mvp (requires the fan roll). */
      type: "resolutionAdvance";
      side: "home" | "away";
      step: "fans" | "mvp";
    }
  | {
      /** Per-side wizard step 3: the FINAL MVP confirm — locks the coach's own
       * six nominations irrevocably (step → "mvp-done"). No going back. */
      type: "resolutionMvpConfirm";
      side: "home" | "away";
    }
  | {
      /** Wizard step 4 gate: the MVP REVEAL — waits for BOTH sides' confirms,
       * rolls the server-owned 1D6 per team over the persisted nominations and
       * advances both sides to the "casualties" step. Idempotent. */
      type: "resolutionMvpReveal";
      side: "home" | "away";
    }
  | {
      /** Per-side wizard step 4 advance: the casualties were SEEN — applies the
       * side's casualty outcomes to its Player rows (visible) + step →
       * "journeymen". */
      type: "resolutionCasualtiesDone";
      side: "home" | "away";
    }
  | {
      /** Per-side wizard step 5 (LAST): the journeymen step is complete (every
       * fielded Novato decided) — step → "done". When BOTH sides are done the
       * match closes. */
      type: "resolutionJourneymenDone";
      side: "home" | "away";
    };

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

/** The per-side post-match fan-factor roll surfaced in the resolution summary
 * ("Factor fan: ↑ / = / ↓" + the roll, rulebook p. 103). */
export interface FanFactorRoll {
  roll: number;
  direction: "up" | "stay" | "down";
}

/** RAU-49: the server-owned preview roll for the resolution modal — the MVP
 * grantees (1D6 per team over the six nominations) + the post-match FF. */
export interface LiveMvpRoll {
  mvp: { home: string; away: string };
  postFf: { home: number; away: number };
  ffRoll: { home: FanFactorRoll; away: FanFactorRoll };
}

/** RAU-49: the resolve command's response — the closure snapshot + awards. */
export interface ResolveOutcome {
  fixtureId: string;
  status: "played";
  homeScore: number;
  awayScore: number;
  winnerId: string | null;
  winnings: { home: number; away: number };
  postFf: { home: number; away: number };
  ffRoll: { home: FanFactorRoll; away: FanFactorRoll };
  mvp: { home: string; away: string };
  resultId: string;
}

/** RAU-14: one persisted journeyman (Novato) offered for hire after the match. */
export interface JourneymanRef {
  id: string;
  name: string;
}

/** RAU-14: the persisted per-side journeymen shape (`LiveMatch.journeymen`). */
export interface JourneymenState {
  home: JourneymanRef[];
  away: JourneymanRef[];
}

/** The hire/let-go command's response (RAU-14): the remaining journeymen + the
 * updated OWN-side team surface (roster + treasury — the hire is PAID). */
export interface HireJourneymanOutcome {
  journeymen: JourneymenState;
  team: { id: string; roster: unknown; treasury: number };
}

/** RAU-14: posts a coach's decision on one of THEIR OWN side's journeymen —
 * `hire: true` pays the lineman cost and keeps the Novato as a permanent roster
 * player; `hire: false` ("Dejar ir") just removes the option. The route enforces
 * the caller owns that side's team. */
export async function hireJourneyman(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
  journeymanId: string,
  hire: boolean,
): Promise<HireJourneymanOutcome> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "hireJourneyman", side, journeymanId, hire }),
    },
  );
  return readJson<HireJourneymanOutcome>(res);
}

/** RAU-51: submits a coach's OWN side's six MJP nominations (the route enforces
 * the caller owns that side's team). The server persists them per-side; the
 * roll is gated on BOTH sides. */
export async function nominateMvp(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
  players: string[],
): Promise<void> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "nominateMvp", side, players }),
    },
  );
  await readJson<{ view: LiveMatchViewState }>(res);
}

/** Rolls the server-owned MVP + FF preview for a finished live match and
 * persists it as `pendingResolution` so the commit reuses the SAME rolls. The
 * nominations come from the PERSISTED per-side state (RAU-51) — the body
 * carries nothing. */
export async function rollLiveMvp(
  leagueId: string,
  fixtureId: string,
): Promise<LiveMvpRoll> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "rollMvp" }),
    },
  );
  const body = await readJson<{ roll: LiveMvpRoll }>(res);
  return body.roll;
}

/** Resolves a finished live match (THE closure): PE + treasuries + FF + the
 * MatchResult row + the idempotent fixture close + `maybeCloseLeague`. The
 * nominations come from the PERSISTED per-side state (RAU-51). Wizard gate:
 * BOTH sides must have reached the "done" step. */
export async function resolveLiveMatch(
  leagueId: string,
  fixtureId: string,
): Promise<ResolveOutcome> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resolveMatch" }),
    },
  );
  const body = await readJson<{ resolved: ResolveOutcome }>(res);
  return body.resolved;
}

/** Posts one per-side RESOLUTION WIZARD command (own side only — the route
 * enforces the caller owns that side's team) and returns the new view. */
async function resolutionCommand(
  leagueId: string,
  fixtureId: string,
  command: Extract<LiveCommand, { side: "home" | "away" }> & { type: string },
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

/** Wizard step 1: the winnings display was seen → advance to the fans step. */
export async function resolutionWinningsSeen(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<LiveMatchViewState> {
  return resolutionCommand(leagueId, fixtureId, { type: "resolutionWinningsSeen", side });
}

/** The server-owned dedicated-fans roll (step 2). Returns the persisted roll. */
export async function resolutionFanRoll(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<{ fans: { roll: number; before: number; after: number; direction: "up" | "stay" | "down" } }> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resolutionFanRoll", side }),
    },
  );
  const body = await readJson<{
    view: LiveMatchViewState;
    fans: { roll: number; before: number; after: number; direction: "up" | "stay" | "down" };
  }>(res);
  return { fans: body.fans };
}

/** Wizard step advance: fans → mvp (requires the fan roll). */
export async function resolutionAdvance(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
  step: "fans" | "mvp",
): Promise<LiveMatchViewState> {
  return resolutionCommand(leagueId, fixtureId, { type: "resolutionAdvance", side, step });
}

/** Wizard step 3: the FINAL MVP confirm (irrevocable). */
export async function resolutionMvpConfirm(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<LiveMatchViewState> {
  return resolutionCommand(leagueId, fixtureId, { type: "resolutionMvpConfirm", side });
}

/** Wizard step 4 gate: the MVP REVEAL (waits for BOTH sides' confirms). */
export async function resolutionMvpReveal(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<{ mvp: { home: string; away: string } }> {
  const res = await fetch(
    `/api/leagues/${encodeURIComponent(leagueId)}/fixtures/${encodeURIComponent(fixtureId)}/live`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "resolutionMvpReveal", side }),
    },
  );
  const body = await readJson<{ view: LiveMatchViewState; mvp: { home: string; away: string } }>(res);
  return { mvp: body.mvp };
}

/** Wizard step 4 advance: the casualties were seen (Player rows updated). */
export async function resolutionCasualtiesDone(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<LiveMatchViewState> {
  return resolutionCommand(leagueId, fixtureId, { type: "resolutionCasualtiesDone", side });
}

/** Wizard step 5 (LAST): the journeymen step is complete (side → "done"). */
export async function resolutionJourneymenDone(
  leagueId: string,
  fixtureId: string,
  side: "home" | "away",
): Promise<LiveMatchViewState> {
  return resolutionCommand(leagueId, fixtureId, { type: "resolutionJourneymenDone", side });
}
