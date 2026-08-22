import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { formatMatchDate } from "@/features/leagues/MatchCard";
import type { UpcomingFixture } from "./selectUpcomingFixtures";

/** The no-date placeholder shown when a fixture has no agreed `scheduledAt`.
 * The localized `matches.noDate` key lands with the route slice (b2); until
 * then a neutral English literal avoids a dangling key reference. */
const NO_DATE_PLACEHOLDER = "No date set";

export interface UpcomingMatchCardProps {
  fixture: UpcomingFixture;
}

/**
 * UpcomingMatchCard (Design B / MP-2): a light, rulebook-toned card listing
 * the league name, "Jornada {round}", both team names (falling back to
 * `match.teamFallback` when the detail map has no team), the agreed date (or
 * a no-date placeholder when undated) and — while the live match runs — an
 * EN VIVO badge. The whole card is a link to `/leagues/[id]/fixtures/[id]`.
 */
export function UpcomingMatchCard({ fixture }: UpcomingMatchCardProps) {
  const { t } = useI18n();

  const homeName = fixture.homeTeamName ?? t("match.teamFallback");
  const awayName = fixture.awayTeamName ?? t("match.teamFallback");
  const dateLabel = fixture.scheduledAt
    ? formatMatchDate(fixture.scheduledAt)
    : NO_DATE_PLACEHOLDER;
  const liveActive = fixture.live?.status === "live";

  return (
    <Link
      href={`/leagues/${fixture.leagueId}/fixtures/${fixture.id}`}
      className="flex h-full flex-col overflow-hidden border border-[#e2e8f0] bg-white transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 bg-[#12225a] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white">
        <span className="truncate">{fixture.leagueName}</span>
        <span className="flex items-center gap-2">
          <span>{t("leagues.jornada", { round: fixture.round })}</span>
          {liveActive ? (
            <span className="rounded-sm bg-[#d11938] px-1.5 py-px text-[9px] font-extrabold tracking-[0.15em]">
              {t("match.liveBadge")}
            </span>
          ) : null}
        </span>
      </header>
      <div className="grid flex-1 grid-cols-2 items-center gap-2 px-3 py-3 text-center">
        <span className="truncate font-extrabold text-[#12225a]">{homeName}</span>
        <span className="truncate font-extrabold text-[#12225a]">{awayName}</span>
      </div>
      <footer className="border-t border-[#e2e8f0] px-3 py-2 text-[11px] font-semibold text-slate-500">
        {dateLabel}
      </footer>
    </Link>
  );
}
