import { TeamEmblem } from "@/features/leagues/TeamEmblem";
import { useI18n } from "@/lib/i18n";
import {
  computeRosterCostFromPlayers,
  computeCoachingCostItems,
  computeCoachingCost,
  computeSpendableBalance,
} from "@/features/teams/roster";
import { formatRulebookCost } from "@/features/teams/format";
import type { TeamDetailViewProps } from "./TeamDetailView";

/**
 * ui-refresh V2 surface (UIR-2 / UIR-4) — SLICE 2 SKELETON.
 *
 * Presentation-only container: it receives the identical `TeamDetailViewProps`
 * object the seam spreads into legacy and renders the hero / roster / coaching
 * / treasury sections in a card-based layout that is visibly different from
 * the legacy single-column view (the full Stitch translation lands in slice 3).
 *
 * Presentation-only contract (enforced by slice-3 component tests):
 * - `TeamDetailViewV2Props` IS `TeamDetailViewProps` (single source of truth);
 * - MUST NOT import `features/teams/api` or `AppProvider` — no data fetching,
 *   no mutations; all behavior arrives through props (hire/fire/reorder
 *   callbacks, the `shieldControl` slot);
 * - testid vocabulary: `ui-v2-*` ONLY (task 2.1) — legacy testid names
 *   (`team-roster-table`, `roster-row-*`, ...) are NEVER reused in V2.
 */
export type TeamDetailViewV2Props = TeamDetailViewProps;

const COACHING_LABELS: Record<string, string> = {
  rerolls: "coaching.rerolls",
  dedicatedFans: "coaching.dedicatedFans",
  assistantCoaches: "coaching.assistantCoaches",
  cheerleaders: "coaching.cheerleaders",
};

export function TeamDetailViewV2({
  team,
  race,
  leagueName,
  shieldControl,
}: TeamDetailViewV2Props) {
  const { t } = useI18n();
  // Pure helpers only (design: roster.ts / format.ts are allowed for V2).
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const treasury = computeSpendableBalance(team, race);
  const coachingItems = computeCoachingCostItems(race, team.coaching);
  const leagueLabel = team.leagueId ? (leagueName ?? t("detail.sinLiga")) : t("detail.sinLiga");

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4 bg-panel p-4 text-ink sm:p-6">
      {/* Hero — horizontal navy band: identity on the left, headline numbers
          on the right (legacy stacks them vertically in one header). */}
      <header
        data-testid="ui-v2-hero"
        className="flex flex-col gap-4 rounded border border-navy bg-navy p-4 text-white sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <TeamEmblem teamId={team.id} name={team.name} size="lg" emblem={team.emblem} />
            {shieldControl}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-[0.02em]">{team.name}</h1>
            <p className="mt-1 text-[13px] text-border-subtle">
              <b className="text-white">{race.name}</b> · {leagueLabel}
            </p>
          </div>
        </div>
        <span className="w-fit shrink-0 rounded border border-white/25 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">
          {t("detail.treasuryTag", { amount: formatRulebookCost(treasury) })}
        </span>
      </header>

      {/* Roster — card grid placeholder. Slice 3 replaces this block with
          `v2/RosterV2` (desktop table / mobile cards); the card testids already
          follow the ui-v2-roster-card-* vocabulary (task 2.1). */}
      <section
        data-testid="ui-v2-roster"
        aria-labelledby="ui-v2-roster-heading"
        className="rounded border border-border bg-panel"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-navy px-4 py-3">
          <h2 id="ui-v2-roster-heading" className="text-[16px] font-bold text-navy">
            {t("detail.plantilla")}
          </h2>
          <span className="rounded-full bg-navy-tint px-2.5 py-0.5 text-[11px] font-bold text-white">
            {team.roster.length}
          </span>
        </div>
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {team.roster.map((entry) => (
            <li
              key={entry.id}
              data-testid={`ui-v2-roster-card-${entry.id}`}
              className="flex items-center justify-between gap-3 rounded border border-border bg-fill-hover px-3 py-2"
            >
              <span className="truncate text-[13px] font-semibold text-navy">{entry.name}</span>
              <span className="shrink-0 text-[11px] uppercase tracking-[0.04em] text-slate">
                {entry.positionalKey}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Coaching — stat cards instead of legacy's desktop table / mobile list. */}
      <section
        data-testid="ui-v2-coaching"
        aria-labelledby="ui-v2-coaching-heading"
        className="rounded border border-border bg-panel"
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-navy px-4 py-3">
          <h2 id="ui-v2-coaching-heading" className="text-[16px] font-bold text-navy">
            {t("detail.cuerpoTecnico")}
          </h2>
          <span className="text-[13px] font-bold tabular-nums text-navy">
            {formatRulebookCost(coachingCost)}
          </span>
        </div>
        <dl className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {coachingItems.map((item) => (
            <div
              key={item.key}
              className="rounded border border-border bg-fill-hover px-3 py-2"
            >
              <dt className="text-[11px] uppercase tracking-[0.05em] text-slate">
                {t(COACHING_LABELS[item.key])}
              </dt>
              <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-navy">
                {item.quantity} × {formatRulebookCost(item.unitCost)}
              </dd>
            </div>
          ))}
          <div className="rounded border border-border bg-fill-hover px-3 py-2">
            <dt className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("coaching.apothecary")}
            </dt>
            <dd
              className={`mt-0.5 text-[13px] font-bold ${
                team.coaching.apothecary ? "text-green-600" : "text-navy"
              }`}
            >
              {team.coaching.apothecary ? t("common.yes") : t("common.no")}
            </dd>
          </div>
        </dl>
      </section>

      {/* Treasury — three stat cards on one row (same figures, new shape). */}
      <section
        data-testid="ui-v2-treasury"
        aria-labelledby="ui-v2-treasury-heading"
        className="rounded border border-border bg-panel"
      >
        <div className="border-b-2 border-navy px-4 py-3">
          <h2 id="ui-v2-treasury-heading" className="text-[16px] font-bold text-navy">
            {t("detail.treasury")}
          </h2>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          <div className="rounded border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.treasuryRoster")}
            </p>
            <p className="mt-1 text-[18px] font-extrabold tabular-nums text-navy">
              {formatRulebookCost(rosterCost)}
            </p>
          </div>
          <div className="rounded border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.cuerpoTecnico")}
            </p>
            <p className="mt-1 text-[18px] font-extrabold tabular-nums text-navy">
              {formatRulebookCost(coachingCost)}
            </p>
          </div>
          <div className="rounded border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.treasuryRemaining")}
            </p>
            <p className="mt-1 text-[18px] font-extrabold tabular-nums text-red">
              {formatRulebookCost(treasury)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
