import Link from "next/link";
import type { FixtureDraft, FixtureStatus } from "./api";
import { TeamEmblem } from "./TeamEmblem";

/**
 * Pure: resolves the Spanish status label shown on a match card from the
 * server-derived fixture status. `played` means a score/result was recorded —
 * winnerId alone never labels a match Jugado (league-season delta).
 */
export function matchStatusLabel(status: FixtureStatus): string {
  if (status === "played") return "Jugado";
  if (status === "scheduled") return "Programado";
  return "Pendiente";
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
 * Pure: renders the recorded final score as "home : away" (Tourplay center
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
  /** Maps a member team id → resolved race display name (Tourplay card line). */
  raceNameById?: Map<string, string>;
  /** Session user id, used to decide whether the viewer is a match participant. */
  currentUserId: string;
  /** True when the session user owns the league (admin → forfeit/correct control). */
  isLeagueOwner: boolean;
  /** Opens the negotiation panel for this fixture (card click). */
  onNegotiate: (fixture: FixtureDraft) => void;
  /** Opens the forfeit modal for this fixture (admin only). */
  onForfeit: (fixture: FixtureDraft) => void;
  /** Opens the ResultModal to load a result (participant/admin on a scheduled fixture). */
  onLoadResult?: (fixture: FixtureDraft) => void;
  /** Opens the ResultModal to correct a result (admin only on a played fixture). */
  onCorrectResult?: (fixture: FixtureDraft) => void;
}

/**
 * Tourplay-style match card (Design B): a clickable card (opens negotiation)
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
  currentUserId,
  isLeagueOwner,
  onNegotiate,
  onForfeit,
  onLoadResult,
  onCorrectResult,
}: MatchCardProps) {
  const isParticipant =
    fixture.homeOwner?.id === currentUserId || fixture.awayOwner?.id === currentUserId;
  const status = matchStatusLabel(fixture.status);
  const homeName = teamNameById.get(fixture.homeTeamId) ?? "Equipo";
  const awayName = teamNameById.get(fixture.awayTeamId) ?? "Equipo";
  const homeRace = raceNameById?.get(fixture.homeTeamId) ?? "";
  const awayRace = raceNameById?.get(fixture.awayTeamId) ?? "";
  const score = formatMatchScore(fixture.homeScore, fixture.awayScore);
  const liveActive = fixture.live?.status === "live";

  const openNegotiation = () => onNegotiate(fixture);
  const openForfeit = () => onForfeit(fixture);
  const openLoadResult = () => onLoadResult?.(fixture);
  const openCorrectResult = () => onCorrectResult?.(fixture);

  // No result loading while the match is live (the live controls own the
  // scoreboard); after `endMatch` the fixture returns to the normal path.
  const canLoadResult =
    fixture.status === "scheduled" && !liveActive && (isParticipant || isLeagueOwner);

  const played = fixture.status === "played";
  const winnerIsHome = played && fixture.winnerId === fixture.homeTeamId;
  const winnerIsAway = played && fixture.winnerId === fixture.awayTeamId;
  const draw = played && !winnerIsHome && !winnerIsAway;
  const centerScore = liveActive
    ? `${fixture.live?.homeScore ?? 0} : ${fixture.live?.awayScore ?? 0}`
    : score ?? "- : -";

  return (
    <article
      aria-label={`Partido ${fixture.round} ${homeName} vs ${awayName}`}
      className="border border-[#e2e8f0] bg-white transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 bg-[#12225a] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white">
        <span className="flex items-center gap-2">
          <span>Partido {fixture.round} · {liveActive ? "En vivo" : status}</span>
          {liveActive ? (
            <span className="animate-pulse rounded-sm bg-[#d11938] px-1.5 py-px text-[9px] font-extrabold tracking-[0.15em]">
              EN VIVO
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-2">
          {canLoadResult ? (
            <button
              type="button"
              onClick={openLoadResult}
              className="rounded-sm border border-white/40 px-2 py-0.5 text-[10px] font-semibold normal-case text-white hover:border-white"
            >
              Cargar resultado
            </button>
          ) : null}
          {(isLeagueOwner || isParticipant) && fixture.status === "played" ? (
            <button
              type="button"
              onClick={openCorrectResult}
              className="rounded-sm border border-white/40 px-2 py-0.5 text-[10px] font-semibold normal-case text-white hover:border-white"
            >
              Corregir resultado
            </button>
          ) : null}
          {isLeagueOwner && fixture.status !== "played" ? (
            <button
              type="button"
              onClick={openForfeit}
              className="rounded-sm border border-white/40 px-2 py-0.5 text-[10px] font-semibold normal-case text-white hover:border-white"
            >
              Otorgar victoria
            </button>
          ) : null}
        </span>
      </header>
      <div
        role="button"
        tabIndex={0}
        onClick={openNegotiation}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openNegotiation();
          }
        }}
        className="grid cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4"
      >
        <TeamSide
          name={homeName}
          race={homeRace}
          href={`/teams/${fixture.homeTeamId}`}
          emblem={
            <TeamEmblem
              teamId={fixture.homeTeamId}
              name={homeName}
              className={winnerIsHome ? "ring-2 ring-[#12225a] ring-offset-2" : ""}
            />
          }
          outcome={played ? (winnerIsHome ? "win" : draw ? "draw" : "lose") : "none"}
        />
        <div data-testid="match-card-score" className="flex min-w-[52px] flex-col items-center px-1">
          <span
            className={`text-2xl font-black tracking-[0.15em] tabular-nums ${
              liveActive
                ? "text-[#d11938]"
                : played || score
                  ? "text-[#12225a]"
                  : "text-[#cbd5e1]"
            }`}
          >
            {centerScore}
          </span>
          {liveActive ? (
            <span className="text-[9px] font-extrabold tracking-[0.2em] text-[#d11938]">EN VIVO</span>
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
              className={winnerIsAway ? "ring-2 ring-[#12225a] ring-offset-2" : ""}
            />
          }
          outcome={played ? (winnerIsAway ? "win" : draw ? "draw" : "lose") : "none"}
        />
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-[#e2e8f0] px-3 py-1.5 text-[11px] text-slate-500">
        {fixture.status === "scheduled" ? (
          <span>Programado: {formatMatchDate(fixture.scheduledAt)}</span>
        ) : (
          <span />
        )}
        <Link
          href={`/leagues/${fixture.leagueId}/fixtures/${fixture.id}`}
          className="ml-2 inline-block font-semibold text-[#d11938] no-underline hover:opacity-70"
        >
          Ver partido
        </Link>
      </footer>
    </article>
  );
}

/** One team column of the Tourplay card: emblem, name link, race line, and the
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
  const win = outcome === "win";
  const lose = outcome === "lose";
  return (
    <div
      data-winner={win ? "true" : undefined}
      className={`flex min-w-0 flex-col items-center gap-1 text-center ${lose ? "opacity-60" : ""}`}
    >
      {emblem}
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className={`max-w-full truncate font-extrabold no-underline hover:opacity-65 ${
          win ? "text-[#12225a]" : lose ? "text-[#94a3b8]" : "text-[#12225a]"
        }`}
      >
        {name}
      </Link>
      <span className={`max-w-full truncate text-[10px] ${lose ? "text-[#94a3b8]" : "text-slate-500"}`}>
        {race}
      </span>
      {win ? (
        <span className="rounded-sm bg-[#e0e7ff] px-1.5 py-px text-[9px] font-black tracking-[0.15em] text-[#12225a]">
          VICTORIA
        </span>
      ) : null}
    </div>
  );
}
