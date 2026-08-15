import { PE_MVP } from "@/lib/rules";
import { getRaceById } from "@/features/teams/data/races";
import type { MatchDetail, MatchTeamDetail } from "./api";

export type { MatchDetail } from "./api";

/**
 * Pure snapshot→section mapping for a played match (MV-2). Never fetches, never
 * renders — it turns a `MatchDetail` into the summary sections `MatchView`
 * (PR 3) renders, plus whether the fixture is a walkover (scores set, no
 * snapshot). Every section is omitted when empty (omit-if-empty, never a
 * placeholder) so a walkover shows the fixture scores + notice and zero summary
 * sections.
 */

export type TeamSide = "home" | "away";

export interface MatchScoreSection { type: "score"; home: number; away: number; winnerName: string | null }
export interface MatchTeamsSection { type: "teams"; home: TeamLine; away: TeamLine }
export interface MatchFansSection { type: "fans"; home: number; away: number }
export interface MatchWinningsSection { type: "winnings"; home: number; away: number }
export interface MatchCasualtiesSection { type: "casualties"; items: { playerName: string | null; label: string }[] }
export interface MatchWeatherSection { type: "weather"; label: string }
export interface MatchPeSection { type: "pe"; home: { playerName: string | null; pe: number }[]; away: { playerName: string | null; pe: number }[] }
export interface MatchMvpSection { type: "mvp"; home: { playerName: string | null; pe: number } | null; away: { playerName: string | null; pe: number } | null }

export type MatchSummarySection =
  | MatchScoreSection
  | MatchTeamsSection
  | MatchFansSection
  | MatchWinningsSection
  | MatchCasualtiesSection
  | MatchWeatherSection
  | MatchPeSection
  | MatchMvpSection;

export interface MatchSummary {
  /** True when the fixture is played but has no snapshot (forfeit/walkover). */
  walkover: boolean;
  sections: MatchSummarySection[];
}

interface TeamLine { name: string; raceName: string | null; coachName: string | null }

/** Spanish copy for a BB2025 weather-kind code (unknown codes pass through). */
export function weatherLabel(kind: string): string {
  switch (kind) {
    case "heat": return "Calor asfixiante";
    case "sunny": return "Muy soleado";
    case "perfect": return "Perfecto";
    case "rain": return "Lluvioso";
    case "blizzard": return "Ventisca";
    default: return kind;
  }
}

/** Spanish rulebook label for a casualty outcome kind (unknown passes through). */
export function casualtyKindLabel(kind: string): string {
  switch (kind) {
    case "bruise": return "Magullado";
    case "apaleado": return "Apaleado";
    case "grave": return "Herida grave";
    case "permanent": return "Permanente";
    case "dead": return "Muerto";
    default: return kind;
  }
}

/** Team display line: name, resolved race name (no subtype exists), coach name. */
function teamLine(team: MatchTeamDetail): TeamLine {
  return {
    name: team.name,
    raceName: getRaceById(team.raceId)?.name ?? null,
    coachName: team.user?.name ?? team.user?.email ?? null,
  };
}

/** Resolves a snapshot pe entry (or persisted mvp id) to a roster player name. */
function playerNameOf(team: MatchTeamDetail, rosterPlayerId: string): string | null {
  return team.players.find((p) => p.rosterPlayerId === rosterPlayerId)?.name ?? null;
}

/** The pe value for a rosterPlayerId in the snapshot, or 0 when absent. */
function peOf(pe: { rosterPlayerId: string; pe: number }[], rosterPlayerId: string): number {
  return pe.find((p) => p.rosterPlayerId === rosterPlayerId)?.pe ?? 0;
}

/** Legacy MVP fallback: the max-`pe` entry with pe ≥ PE_MVP; tie → first. */
function fallbackMvpId(pe: { rosterPlayerId: string; pe: number }[]): string | null {
  const eligible = pe.filter((p) => p.pe >= PE_MVP);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, cur) => (cur.pe > best.pe ? cur : best)).rosterPlayerId;
}

/**
 * Picks a side's MVP: persisted `scores.mvp` id first (D5), else the legacy
 * fallback = the max-`pe` entry (floor ≥ 4, tie → first), resolved to a roster
 * player. Returns null when nothing resolves (a grantee id with no matching
 * Player row, or no fallback candidate) — the caller omits that side / section
 * (omit-not-crash, MV-2).
 */
function mvpOf(
  team: MatchTeamDetail,
  persistedId: string | undefined | null,
  pe: { rosterPlayerId: string; pe: number }[],
): { playerName: string; pe: number } | null {
  const sourceId = persistedId ?? fallbackMvpId(pe);
  if (!sourceId) return null;
  const playerName = playerNameOf(team, sourceId);
  if (!playerName) return null;
  return { playerName, pe: peOf(pe, sourceId) };
}

type Scoreboard = NonNullable<MatchDetail["result"]>["scores"];

function buildScore(detail: MatchDetail): MatchScoreSection | null {
  const home = detail.fixture.homeScore;
  const away = detail.fixture.awayScore;
  if (home == null || away == null) return null;
  const winnerId = detail.fixture.winnerId ?? detail.result?.scores.winnerId ?? null;
  const winnerName =
    winnerId === detail.homeTeam.id ? detail.homeTeam.name
    : winnerId === detail.awayTeam.id ? detail.awayTeam.name
    : winnerId === null ? "Empate"
    : null;
  return { type: "score", home, away, winnerName };
}

function buildTeams(detail: MatchDetail): MatchTeamsSection {
  return { type: "teams", home: teamLine(detail.homeTeam), away: teamLine(detail.awayTeam) };
}

function buildFans(scoreboard: Scoreboard): MatchFansSection | null {
  if (scoreboard.home.postFf == null || scoreboard.away.postFf == null) return null;
  return { type: "fans", home: scoreboard.home.postFf, away: scoreboard.away.postFf };
}

function buildWinnings(scoreboard: Scoreboard): MatchWinningsSection | null {
  if (scoreboard.home.winnings == null || scoreboard.away.winnings == null) return null;
  return { type: "winnings", home: scoreboard.home.winnings, away: scoreboard.away.winnings };
}

function buildCasualties(detail: MatchDetail, scoreboard: Scoreboard): MatchCasualtiesSection | null {
  // Each casualty names the victim's team (where its Player row lives); resolve
  // the display name from that team's roster.
  const teamFor = (side: TeamSide): MatchTeamDetail =>
    side === "home" ? detail.homeTeam : detail.awayTeam;
  const items = [
    ...(scoreboard.home.casualties ?? []).map((c) => ({
      playerName: playerNameOf(teamFor(c.team), c.rosterPlayerId),
      label: casualtyKindLabel(c.outcome?.kind ?? ""),
    })),
    ...(scoreboard.away.casualties ?? []).map((c) => ({
      playerName: playerNameOf(teamFor(c.team), c.rosterPlayerId),
      label: casualtyKindLabel(c.outcome?.kind ?? ""),
    })),
  ];
  const named = items.filter((i) => i.playerName !== null);
  if (named.length === 0) return null;
  return { type: "casualties", items: named };
}

function buildWeather(result: NonNullable<MatchDetail["result"]>): MatchWeatherSection | null {
  if (result.weather == null || result.weather === "") return null;
  return { type: "weather", label: weatherLabel(result.weather) };
}

function buildPe(detail: MatchDetail, scoreboard: Scoreboard): MatchPeSection {
  return {
    type: "pe",
    home: scoreboard.home.pe.map((row) => ({ playerName: playerNameOf(detail.homeTeam, row.rosterPlayerId), pe: row.pe })),
    away: scoreboard.away.pe.map((row) => ({ playerName: playerNameOf(detail.awayTeam, row.rosterPlayerId), pe: row.pe })),
  };
}

function buildMvp(detail: MatchDetail, scoreboard: Scoreboard): MatchMvpSection | null {
  const home = mvpOf(detail.homeTeam, scoreboard.mvp?.home, scoreboard.home.pe);
  const away = mvpOf(detail.awayTeam, scoreboard.mvp?.away, scoreboard.away.pe);
  if (!home && !away) return null;
  return { type: "mvp", home, away };
}

/**
 * Builds the summary sections for a match detail. A played fixture without a
 * snapshot (walkover) yields `walkover: true` and zero sections so the caller
 * renders the fixture scores + "Victoria por incomparecencia." notice. All
 * other fixtures render only non-empty sections.
 */
export function buildMatchSummary(detail: MatchDetail): MatchSummary {
  const result = detail.result;

  // Walkover: fixture is played (scores present) but there is no persisted
  // snapshot from which to build a summary. Scores set → deriveFixtureStatus
  // already reports `played`; the caller mirrors "no snapshot" → walkover.
  const played = detail.fixture.homeScore != null || detail.fixture.awayScore != null;
  if (played && !result) {
    return { walkover: true, sections: [] };
  }
  if (!result) {
    // Not played and no snapshot (scheduled/pending): no summary sections.
    return { walkover: false, sections: [] };
  }

  const scoreboard = result.scores;
  const sections: MatchSummarySection[] = [];

  const score = buildScore(detail);
  if (score) sections.push(score);

  sections.push(buildTeams(detail));

  const fans = buildFans(scoreboard);
  if (fans) sections.push(fans);

  const winnings = buildWinnings(scoreboard);
  if (winnings) sections.push(winnings);

  const casualties = buildCasualties(detail, scoreboard);
  if (casualties) sections.push(casualties);

  const weather = buildWeather(result);
  if (weather) sections.push(weather);

  const pe = buildPe(detail, scoreboard);
  const mvp = buildMvp(detail, scoreboard);
  if (pe.home.length + pe.away.length > 0) sections.push(pe);
  if (mvp) sections.push(mvp);

  return { walkover: false, sections };
}

/** One snapshot-derived feed row rendered above the finished-live cards
 * (MVT-4). These are NEVER new event kinds (MV-6/LM-16) and NEVER duplicate the
 * MVP rows, which stay event-derived. `reported` is always first. */
export type SummaryFeedRow =
  | { type: "reported"; date: string }
  | { type: "winnings"; home: number; away: number }
  | { type: "fans"; home: number; away: number }
  | { type: "incentives"; team: "home"; value: number };

/**
 * Formats a persisted ISO datetime as the zero-padded Spanish `dd/MM/yyyy`
 * report date (MVT-4 "Partido reportado"). Deterministic and timezone-local —
 * `new Date(iso).getDate()` etc. use the runtime's local tz, matching the
 * mockup's clock-row dates. A missing/invalid string falls back to "" (the
 * caller omits the reported row rather than crash).
 */
export function formatReportDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Builds the snapshot summary rows for a finished live feed (MVT-4): "Partido
 * reportado" (green success, date = result.createdAt), "Ganancias" (per-team
 * winnings), "Fanáticos dedicados" (per-team post-Ff), and "Incentivos" (the
 * single fixed pettyCash, team-assigned card). Renders ONLY when the
 * `MatchResult` snapshot exists — a walkover (result == null) returns `[]`
 * (MV-2 guard) and never invents rows. Rows with null snapshot data are
 * omitted (omit-if-empty, never a placeholder). MVP is deliberately excluded:
 * it stays event-derived, so there is exactly one MVP row per grantee.
 */
export function buildSummaryFeedRows(detail: MatchDetail): SummaryFeedRow[] {
  const result = detail.result;
  if (!result) return [];

  const rows: SummaryFeedRow[] = [];

  const date = formatReportDate(result.createdAt);
  if (date) rows.push({ type: "reported", date });

  const homeWinnings = result.scores.home.winnings;
  const awayWinnings = result.scores.away.winnings;
  if (homeWinnings != null && awayWinnings != null) {
    rows.push({ type: "winnings", home: homeWinnings, away: awayWinnings });
  }

  const homeFf = result.scores.home.postFf;
  const awayFf = result.scores.away.postFf;
  if (homeFf != null && awayFf != null) {
    rows.push({ type: "fans", home: homeFf, away: awayFf });
  }

  // The snapshot stores ONE pettyCash (TV difference) with no per-team split.
  // The row renders as a HOME-assigned card (mock precedent); the inducement
  // chips are deferred to a follow-up slice (MVT-4 open question).
  if (result.pettyCash != null) {
    rows.push({ type: "incentives", team: "home", value: result.pettyCash });
  }

  return rows;
}
