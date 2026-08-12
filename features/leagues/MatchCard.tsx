import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import type { FixtureDraft, FixtureStatus } from "./api";

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
 * Pure: renders the recorded final score as "home – away" (en-dash) when both
 * scores are present. Returns null when scores are absent so the MatchCard can
 * fall back to the winner-only footer (legacy/forfeit rows without raw scores).
 */
export function formatMatchScore(
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): string | null {
  if (homeScore == null || awayScore == null) return null;
  return `${homeScore} – ${awayScore}`;
}

export interface MatchCardProps {
  fixture: FixtureDraft;
  /** Maps a member team id → team display name (from the league detail). */
  teamNameById: Map<string, string>;
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
 * Pattern B match card: a clickable card (opens negotiation) whose header is
 * "Partido N · <status>", whose body centers a "VS" with each team on its own
 * side (team name with the owner user below, from the API), and whose team names
 * are links to the rival's scouting page `/teams/[id]`. Clicking a team stops
 * propagation so it does not also open negotiation.
 */
export function MatchCard({
  fixture,
  teamNameById,
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
  const score = formatMatchScore(fixture.homeScore, fixture.awayScore);
  const winnerName = teamNameById.get(fixture.winnerId ?? "") ?? "Equipo";

  const openNegotiation = () => onNegotiate(fixture);
  const openForfeit = () => onForfeit(fixture);
  const openLoadResult = () => onLoadResult?.(fixture);
  const openCorrectResult = () => onCorrectResult?.(fixture);

  const canLoadResult = fixture.status === "scheduled" && (isParticipant || isLeagueOwner);

  return (
    <article
      aria-label={`Partido ${fixture.round} ${homeName} vs ${awayName}`}
      className="border border-[#e2e8f0] bg-white transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#d11938]">
        <span>Partido {fixture.round} · {status}</span>
        <span className="flex gap-2">
          {canLoadResult ? (
            <button
              type="button"
              onClick={openLoadResult}
              className="rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
            >
              Cargar resultado
            </button>
          ) : null}
          {(isLeagueOwner || isParticipant) && fixture.status === "played" ? (
            <button
              type="button"
              onClick={openCorrectResult}
              className="rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
            >
              Corregir resultado
            </button>
          ) : null}
          {isLeagueOwner && fixture.status !== "played" ? (
            <button
              type="button"
              onClick={openForfeit}
              className="rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
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
        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-4"
      >
        <TeamSide
          name={homeName}
          ownerName={fixture.homeOwner?.name ?? null}
          ownerAvatar={fixture.homeOwner?.avatar ?? null}
          href={`/teams/${fixture.homeTeamId}`}
        />
        <span className="text-[13px] font-black tracking-[0.05em] text-[#d11938]">VS</span>
        <TeamSide
          name={awayName}
          ownerName={fixture.awayOwner?.name ?? null}
          ownerAvatar={fixture.awayOwner?.avatar ?? null}
          href={`/teams/${fixture.awayTeamId}`}
        />
      </div>
      <footer className="border-t border-[#e2e8f0] px-3 py-1.5 text-center text-[11px] text-slate-500">
        {fixture.status === "scheduled" ? (
          <>Programado: {formatMatchDate(fixture.scheduledAt)}</>
        ) : fixture.status === "played" ? (
          <>
            Jugado{score ? ` · ${score}` : ""} · Ganador: {winnerName}
          </>
        ) : null}
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

function TeamSide({
  name,
  ownerName,
  ownerAvatar,
  href,
}: {
  name: string;
  ownerName: string | null;
  ownerAvatar: string | null;
  href: string;
}) {
  return (
    <div className="flex-1 text-center">
      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className="font-bold text-[#12225a] no-underline hover:opacity-65"
      >
        {name}
      </Link>
      {ownerName ? (
        <span className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-slate-400">
          <UserAvatar src={ownerAvatar} />
          {ownerName}
        </span>
      ) : null}
    </div>
  );
}
