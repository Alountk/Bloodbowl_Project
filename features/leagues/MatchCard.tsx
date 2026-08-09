import Link from "next/link";
import type { FixtureDraft, FixtureStatus } from "./api";

/** Pure: resolves the Spanish status label shown on a match card. */
export function matchStatusLabel(
  status: FixtureStatus,
  scheduledAt: string | null,
  winnerId: string | null,
): string {
  if (status === "played" || winnerId) return "Jugado";
  if (status === "scheduled" || scheduledAt) return "Programado";
  return "Pendiente";
}

/** Pure: formats an ISO timestamp as DD/MM/YYYY in the user's local zone. */
export function formatMatchDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface MatchCardProps {
  fixture: FixtureDraft;
  /** Maps a member team id → team display name (from the league detail). */
  teamNameById: Map<string, string>;
  /** Session user id, used to decide whether the viewer is a match participant. */
  currentUserId: string;
  /** True when the session user owns the league (admin → forfeit control). */
  isLeagueOwner: boolean;
  /** Opens the negotiation panel for this fixture (card click). */
  onNegotiate: (fixture: FixtureDraft) => void;
  /** Opens the forfeit modal for this fixture (admin only). */
  onForfeit: (fixture: FixtureDraft) => void;
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
}: MatchCardProps) {
  void currentUserId;
  const status = matchStatusLabel(fixture.status, fixture.scheduledAt, fixture.winnerId);
  const homeName = teamNameById.get(fixture.homeTeamId) ?? "Equipo";
  const awayName = teamNameById.get(fixture.awayTeamId) ?? "Equipo";

  const openNegotiation = () => onNegotiate(fixture);
  const openForfeit = () => onForfeit(fixture);

  return (
    <article
      aria-label={`Partido ${fixture.round} ${homeName} vs ${awayName}`}
      className="border border-[#e2e8f0] bg-white transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-[#d11938]">
        <span>Partido {fixture.round} · {status}</span>
        {isLeagueOwner && fixture.status !== "played" ? (
          <button
            type="button"
            onClick={openForfeit}
            className="rounded-sm border border-slate-300 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
          >
            Otorgar victoria
          </button>
        ) : null}
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
          href={`/teams/${fixture.homeTeamId}`}
        />
        <span className="text-[13px] font-black tracking-[0.05em] text-[#d11938]">VS</span>
        <TeamSide
          name={awayName}
          ownerName={fixture.awayOwner?.name ?? null}
          href={`/teams/${fixture.awayTeamId}`}
        />
      </div>
      {fixture.status === "scheduled" || fixture.status === "played" ? (
        <footer className="border-t border-[#e2e8f0] px-3 py-1.5 text-center text-[11px] text-slate-500">
          {fixture.status === "scheduled" ? (
            <>Programado: {formatMatchDate(fixture.scheduledAt)}</>
          ) : (
            <>
              Jugado · Ganador: {teamNameById.get(fixture.winnerId ?? "") ?? "Equipo"}
            </>
          )}
        </footer>
      ) : null}
    </article>
  );
}

function TeamSide({
  name,
  ownerName,
  href,
}: {
  name: string;
  ownerName: string | null;
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
      {ownerName ? <span className="mt-0.5 block text-[11px] text-slate-400">{ownerName}</span> : null}
    </div>
  );
}
