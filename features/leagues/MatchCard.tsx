import Link from "next/link";
import { DEFAULT_LOCALE, t as translate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/lib/i18n";
import type { FixtureDraft, FixtureStatus } from "./api";
import { TeamEmblem } from "./TeamEmblem";

/** The translator shape used by the pure helpers (es default fallback). */
type CardTFunc = (key: string, params?: Record<string, string | number>) => string;

const esT: CardTFunc = (key, params) => translate(DEFAULT_LOCALE, key, params);

/**
 * Pure: resolves the status label shown on a match card from the server-derived
 * fixture status. `played` means a score/result was recorded — winnerId alone
 * never labels a match Jugado (league-season delta). `t` carries the active
 * locale and defaults to the Spanish dictionary.
 */
export function matchStatusLabel(status: FixtureStatus, fn: CardTFunc = esT): string {
  if (status === "played") return fn("match.status.played");
  if (status === "scheduled") return fn("match.status.scheduled");
  return fn("match.status.pending");
}

/** Pure: formats an agreed ISO timestamp as DD/MM/YYYY HH:MM in the local zone.
 * The negotiation agrees a date AND a time, so the scheduled footer exposes the
 * exact slot (not just the day). */
export function formatMatchDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Pure: renders the recorded final score as "home : away" (rulebook center
 * format). Returns null when scores are absent so the MatchCard can fall back
 * to the pending dash ("- : -").
 */
export function formatMatchScore(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): string | null {
  if (homeScore == null || awayScore == null) return null;
  return `${homeScore} : ${awayScore}`;
}

export interface MatchCardProps {
  fixture: FixtureDraft;
  /** Maps a member team id → team display name (from the league detail). */
  teamNameById: Map<string, string>;
  /** Maps a member team id → resolved race display name (rulebook card line). */
  raceNameById?: Map<string, string>;
  /**
   * RAU-78: maps a member team id → its shield storage value (a `/uploads/
   * shields/` URL, or null when the team has no shield). When present the card
   * renders each side's shield image; when absent (or a side has no entry) the
   * deterministic placeholder shows (TS-6). The live match header is NOT fed by
   * this map — its MVT-8 acronym glyphs stay shield-free.
   */
  emblemById?: Map<string, string | null>;
  /** Session user id, used to decide whether the viewer is a match participant. */
  currentUserId: string;
  /** True when the session user owns the league (admin → forfeit/correct control). */
  isLeagueOwner: boolean;
  /** RAU-40: a finished league is definitive — the card hides the result load,
   * correction and forfeit affordances (the jornada stays visible). */
  leagueFinished?: boolean;
  /** Opens the negotiation panel for this fixture (card click). */
  onNegotiate: (fixture: FixtureDraft) => void;
  /** Opens the forfeit modal for this fixture (admin only). */
  onForfeit: (fixture: FixtureDraft) => void;
  /** LMR-7: true when the viewer may manually reset the fixture's live match —
   * the league owner or a developer/admin holding `live.manage`. The parent
   * computes it from ownership + the session role. */
  canResetLive?: boolean;
  /** Opens the reset confirmation modal for this fixture (owner/dev-admin only). */
  onReset?: (fixture: FixtureDraft) => void;
  /** Opens the ResultModal to load a result (participant/admin on a scheduled fixture). */
  onLoadResult?: (fixture: FixtureDraft) => void;
  /** Opens the ResultModal to correct a result (admin only on a played fixture). */
  onCorrectResult?: (fixture: FixtureDraft) => void;
}

/**
 * rulebook-style match card (Design B): a clickable card (opens negotiation)
 * whose header is "Partido N · <status>" (navy, with a pulsing EN VIVO badge
 * while the live match runs), whose body centers the RESULT (score, or "- : -"
 * before the match) between the two teams, each with its deterministic emblem,
 * name (a link to `/teams/[id]` scouting) and race line. The winner's side is
 * highlighted navy with a "VICTORIA" chip and the loser is grayed; a draw stays
 * neutral. Clicking a team stops propagation so it does not also open
 * negotiation.
 */
export function MatchCard({
  fixture,
  teamNameById,
  raceNameById,
  emblemById,
  currentUserId,
  isLeagueOwner,
  leagueFinished = false,
  onNegotiate,
  onForfeit,
  canResetLive = false,
  onReset,
  onLoadResult,
  onCorrectResult,
}: MatchCardProps) {
  const { t } = useI18n();
  const isParticipant =
    fixture.homeOwner?.id === currentUserId || fixture.awayOwner?.id === currentUserId;
  const status = matchStatusLabel(fixture.status, t);
  const homeName = teamNameById.get(fixture.homeTeamId) ?? t("match.teamFallback");
  const awayName = teamNameById.get(fixture.awayTeamId) ?? t("match.teamFallback");
  const homeRace = raceNameById?.get(fixture.homeTeamId) ?? "";
  const awayRace = raceNameById?.get(fixture.awayTeamId) ?? "";
  const homeEmblem = emblemById?.get(fixture.homeTeamId) ?? null;
  const awayEmblem = emblemById?.get(fixture.awayTeamId) ?? null;
  const score = formatMatchScore(fixture.homeScore, fixture.awayScore);
  const liveActive = fixture.live?.status === "live";

  const openNegotiation = () => {
    if (leagueFinished) return; // finished league: no negotiation affordance
    onNegotiate(fixture);
  };
  const openForfeit = () => {
    if (leagueFinished) return;
    onForfeit(fixture);
  };
  const openReset = () => {
    if (leagueFinished) return;
    onReset?.(fixture);
  };
  const openLoadResult = () => {
    if (leagueFinished) return;
    onLoadResult?.(fixture);
  };
  const openCorrectResult = () => {
    if (leagueFinished) return;
    onCorrectResult?.(fixture);
  };

  // No result loading while the match is live (the live controls own the
  // scoreboard); after `endMatch` the fixture returns to the normal path. A
  // finished league hides every control (RAU-40 — the champion is definitive).
  const canLoadResult =
    !leagueFinished &&
    fixture.status === "scheduled" &&
    !liveActive &&
    (isParticipant || isLeagueOwner);

  const played = fixture.status === "played";

  // LMR-7: the manual reset control is for the owner/dev-admin ONLY, and only
  // while there is a resettable LiveMatch (pending/ready/live) on a league that
  // is not finished. A finished LiveMatch belongs to the resolution wizard.
  const showReset =
    !leagueFinished &&
    canResetLive &&
    fixture.live != null &&
    fixture.live.status !== "finished";

  // The negotiation affordance (Design B) lives in the card body center while a
  // participant can still agree a date: pending or scheduled-but-unplayed
  // (re-negotiation, "rejornar"). Mirrors NegotiationPanel's `negotiationOpen`.
  // Only a PLAYED fixture centers the result instead. The live match owns its
  // scoreboard (no negotiation while running).
  const canNegotiate =
    !leagueFinished &&
    !liveActive &&
    (fixture.status === "pending" || fixture.status === "scheduled");
  const winnerIsHome = played && fixture.winnerId === fixture.homeTeamId;
  const winnerIsAway = played && fixture.winnerId === fixture.awayTeamId;
  const draw = played && !winnerIsHome && !winnerIsAway;
  const centerScore = liveActive
    ? `${fixture.live?.homeScore ?? 0} : ${fixture.live?.awayScore ?? 0}`
    : score ?? "- : -";

  return (
    <article
      aria-label={t("match.aria", { round: fixture.round, home: homeName, away: awayName })}
      className="border border-border bg-panel transition-shadow hover:shadow-card-hover"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2 text-[11px] uppercase tracking-wide text-white">
        <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
          <span className="font-display font-semibold">{t("match.header", { round: fixture.round, status: liveActive ? t("match.liveStatus") : status })}</span>
          {liveActive ? (
            <span className="animate-pulse rounded-sm bg-red px-1.5 py-px text-[9px] font-extrabold tracking-[0.15em]">
              {t("match.liveBadge")}
            </span>
          ) : null}
        </h3>
        <span className="flex flex-wrap gap-2">
          {canLoadResult ? (
            <button
              type="button"
              onClick={openLoadResult}
              className="min-h-6 rounded-sm border border-white/40 px-2.5 py-1 text-[11px] font-semibold normal-case text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {t("result.loadAction")}
            </button>
          ) : null}
          {!leagueFinished && (isLeagueOwner || isParticipant) && fixture.status === "played" ? (
            <button
              type="button"
              onClick={openCorrectResult}
              className="min-h-6 rounded-sm border border-white/40 px-2.5 py-1 text-[11px] font-semibold normal-case text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {t("result.correctAction")}
            </button>
          ) : null}
          {!leagueFinished && isLeagueOwner && fixture.status !== "played" ? (
            <button
              type="button"
              onClick={openForfeit}
              className="min-h-6 rounded-sm border border-white/40 px-2.5 py-1 text-[11px] font-semibold normal-case text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {t("forfeit.title")}
            </button>
          ) : null}
          {showReset ? (
            <button
              type="button"
              onClick={openReset}
              className="min-h-6 rounded-sm border border-white/40 px-2.5 py-1 text-[11px] font-semibold normal-case text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
            >
              {t("reset.action")}
            </button>
          ) : null}
        </span>
      </header>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4 md:gap-4 md:px-6 md:py-6">
        <TeamSide
          name={homeName}
          race={homeRace}
          href={`/teams/${fixture.homeTeamId}`}
          emblem={
            <TeamEmblem
              teamId={fixture.homeTeamId}
              name={homeName}
              emblem={homeEmblem}
              className={winnerIsHome ? "ring-2 ring-navy ring-offset-2" : ""}
            />
          }
          outcome={played ? (winnerIsHome ? "win" : draw ? "draw" : "lose") : "none"}
        />
        <div data-testid="match-card-score" className="flex min-w-[52px] flex-col items-center px-1">
          {canNegotiate ? (
            <button
              type="button"
              onClick={openNegotiation}
              className="min-h-6 rounded-sm px-2 py-1 text-center text-[11px] font-bold text-navy underline decoration-navy/40 underline-offset-2 hover:text-navy-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy"
            >
              {fixture.status === "scheduled" ? t("negotiation.reschedule") : t("match.negotiate")}
            </button>
          ) : (
            <span
              className={`font-display text-2xl font-semibold tabular-nums md:text-4xl ${
                liveActive
                  ? "text-red"
                  : played || score
                    ? "text-navy"
                    : "text-slate"
              }`}
            >
              {centerScore}
            </span>
          )}
          {liveActive ? (
            <span className="text-[9px] font-extrabold tracking-[0.2em] text-red">{t("match.liveBadge")}</span>
          ) : null}
        </div>
        <TeamSide
          name={awayName}
          race={awayRace}
          href={`/teams/${fixture.awayTeamId}`}
          emblem={
            <TeamEmblem
              teamId={fixture.awayTeamId}
              name={awayName}
              emblem={awayEmblem}
              className={winnerIsAway ? "ring-2 ring-navy ring-offset-2" : ""}
            />
          }
          outcome={played ? (winnerIsAway ? "win" : draw ? "draw" : "lose") : "none"}
        />
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-slate">
        {fixture.status === "scheduled" ? (
          <span>{t("match.scheduledFooter", { date: formatMatchDate(fixture.scheduledAt) })}</span>
        ) : (
          <span />
        )}
        <Link
          href={`/leagues/${fixture.leagueId}/fixtures/${fixture.id}`}
          className="ml-2 inline-block min-h-6 px-1 py-1 font-semibold text-red no-underline hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red"
        >
          {t("match.viewMatch")}
        </Link>
      </footer>
    </article>
  );
}

/** One team column of the rulebook card: emblem, name link, race line, and the
 * VICTORIA chip when this side won (the loser is grayed, a draw stays neutral). */
function TeamSide({
  name,
  race,
  href,
  emblem,
  outcome,
}: {
  name: string;
  race: string;
  href: string;
  emblem: React.ReactNode;
  outcome: "win" | "lose" | "draw" | "none";
}) {
  const { t } = useI18n();
  const win = outcome === "win";
  const lose = outcome === "lose";
  return (
    <div
      data-winner={win ? "true" : undefined}
      className="flex min-w-0 flex-col items-center gap-1 text-center"
    >
      {emblem}
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className={`max-w-full truncate font-extrabold no-underline hover:opacity-65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy ${
          win ? "text-navy" : lose ? "text-slate" : "text-navy"
        }`}
      >
        {name}
      </Link>
      <span className="max-w-full truncate text-[10px] text-slate">
        {race}
      </span>
      {win ? (
        <span className="rounded-sm bg-accent-home px-1.5 py-px text-[9px] font-black tracking-[0.15em] text-navy">
          {t("match.victoryChip")}
        </span>
      ) : null}
    </div>
  );
}
