import Link from "next/link";
import { useState } from "react";
import { TeamEmblem } from "@/features/leagues/TeamEmblem";
import { useI18n } from "@/lib/i18n";
import {
  computeRosterCostFromPlayers,
  computeCoachingCostItems,
  computeCoachingCost,
  computeSpendableBalance,
  APOTHECARY_COST,
} from "@/features/teams/roster";
import { formatRulebookCost } from "@/features/teams/format";
import type { TeamDetailViewProps } from "./TeamDetailView";
import { RosterV2 } from "./v2/RosterV2";

/**
 * ui-refresh V2 surface (UIR-2 / UIR-4) — full Stitch translation (slice 3).
 *
 * Presentation-only container: it receives the identical `TeamDetailViewProps`
 * object the seam spreads into legacy and renders the vintage-rulebook V2 —
 * top bar (back arrow, serif navy team name, race + emblem, badge row
 * TV/tesorería/liga), ruled roster (desktop table / mobile cards via
 * `v2/RosterV2`), Progresión summary, Cuerpo técnico and Tesorería.
 *
 * Presentation-only contract (enforced by TeamDetailViewV2.test.tsx):
 * - `TeamDetailViewV2Props` IS `TeamDetailViewProps` (single source of truth);
 * - MUST NOT import `features/teams/api` or `AppProvider` — no data fetching,
 *   no mutations; all behavior arrives through props (hire/fire/reorder
 *   callbacks, the `shieldControl` slot);
 * - testid vocabulary: `ui-v2-*` ONLY (task 2.1) — legacy testid names
 *   (`team-roster-table`, `roster-row-*`, ...) are NEVER reused in V2.
 *
 * Flip discipline (UIR-5, task 3.6): the flag default STAYS OFF (legacy).
 * `useUiFlag()` is consumed only by `app/teams/[teamId]/page.tsx`; flipping
 * this surface to render by default requires `e2e/ui-refresh-roster.spec.ts`
 * green, must not affect any other screen, and ships ONLY as a separate
 * maintainer decision after human review — never as part of this change.
 */
export type TeamDetailViewV2Props = TeamDetailViewProps;

const COACHING_LABELS: Record<string, string> = {
  rerolls: "coaching.rerolls",
  dedicatedFans: "coaching.dedicatedFans",
  assistantCoaches: "coaching.assistantCoaches",
  cheerleaders: "coaching.cheerleaders",
};

const BADGE_CLASS = "border border-border bg-fill-hover px-2.5 py-1 text-[11.5px] font-semibold";

export function TeamDetailViewV2({
  team,
  race,
  leagueName,
  progression,
  onImprove,
  onRename,
  onReorder,
  reorderError,
  onHire,
  onFire,
  shieldControl,
}: TeamDetailViewV2Props) {
  const { t } = useI18n();
  // Top-bar action row (Stitch "Editar" / "Emblema"):
  //  - Editar toggles the roster's hire affordance (default ON = legacy parity
  //    — the "Contratar" action is visible exactly where legacy shows it);
  //  - Emblema toggles the owner's `shieldControl` slot (upload/remove shield),
  //    OPEN by default — legacy parity: the shield control is always visible
  //    for the owner, so the V2 hides nothing.
  // Both are pure presentation toggles: the underlying behavior is unchanged
  // and still arrives exclusively through props.
  const [editMode, setEditMode] = useState(true);
  const [emblemOpen, setEmblemOpen] = useState(true);
  const hireClient = editMode ? onHire : undefined;

  // Pure helpers only (design: roster.ts / format.ts are allowed for V2).
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const treasury = computeSpendableBalance(team, race);
  const coachingItems = computeCoachingCostItems(race, team.coaching);
  const leagueLabel = team.leagueId ? (leagueName ?? t("detail.sinLiga")) : t("detail.sinLiga");
  // Team value badge: players + sideline staff + available gold.
  const teamValue = rosterCost + coachingCost + treasury;

  // Progresión summary: plantilla PE (progression rows, or the served read-only
  // projection), dead count and miss-next-match count.
  const totalPe = team.roster.reduce(
    (sum, entry) => sum + (progression?.[entry.id]?.pe ?? entry.pe ?? 0),
    0,
  );
  const deadCount = team.roster.filter((entry) => {
    const core = progression?.[entry.id];
    return core != null && !core.alive;
  }).length;
  const missNextCount = team.roster.filter(
    (entry) => progression?.[entry.id]?.missNextMatch === true,
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 border border-border bg-panel p-4 text-ink shadow-card-hover sm:p-5">
      {/* Top bar — back arrow, emblem, serif navy team name, race + league. */}
      <header
        data-testid="ui-v2-hero"
        className="border border-border bg-panel"
      >
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Link
            href="/teams"
            data-testid="ui-v2-back"
            aria-label={t("leagues.back")}
            className="grid h-9 w-9 shrink-0 place-items-center border border-border bg-fill-hover text-[15px] font-bold text-navy hover:bg-navy hover:text-white"
          >
            ←
          </Link>
          <TeamEmblem teamId={team.id} name={team.name} size="lg" emblem={team.emblem} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-[24px] leading-tight font-semibold text-navy sm:text-[28px]">
              {team.name}
            </h1>
            <p className="mt-0.5 truncate text-[12.5px] text-slate">
              <b className="text-ink">{race.name}</b> · {leagueLabel}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {onHire ? (
              <button
                type="button"
                data-testid="ui-v2-action-edit"
                aria-pressed={editMode}
                onClick={() => setEditMode((value) => !value)}
                className={`border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] ${
                  editMode
                    ? "border-navy bg-navy text-white hover:bg-navy-hover"
                    : "border-border bg-fill-hover text-navy hover:bg-panel"
                }`}
              >
                {t("rulesets.edit")}
              </button>
            ) : null}
            {shieldControl ? (
              <button
                type="button"
                data-testid="ui-v2-action-emblem"
                aria-pressed={emblemOpen}
                onClick={() => setEmblemOpen((value) => !value)}
                className={`border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] ${
                  emblemOpen
                    ? "border-navy bg-navy text-white hover:bg-navy-hover"
                    : "border-border bg-fill-hover text-navy hover:bg-panel"
                }`}
              >
                Emblema
              </button>
            ) : null}
          </div>
        </div>

        {/* Badge row: TV / tesorería / liga / estado (legacy hero tags kept). */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <span
            data-testid="ui-v2-tv"
            className={`${BADGE_CLASS} font-bold tabular-nums text-navy`}
          >
            TV: {formatRulebookCost(teamValue)}
          </span>
          <span
            data-testid="ui-v2-treasury-badge"
            className="border border-red bg-red px-2.5 py-1 text-[11.5px] font-bold text-white"
          >
            {t("detail.treasuryTag", { amount: formatRulebookCost(treasury) })}
          </span>
          <span data-testid="ui-v2-league-badge" className={BADGE_CLASS}>
            {leagueLabel}
          </span>
          <span
            data-testid="ui-v2-ready-badge"
            className="border border-navy-tint bg-navy-tint px-2.5 py-1 text-[11.5px] font-bold text-white"
          >
            {t("detail.equipoListo")}
          </span>
        </div>

        {/* Emblem panel — reveals the page-passed owner shield control. */}
        {emblemOpen && shieldControl ? (
          <div
            data-testid="ui-v2-emblem-panel"
            className="border-t border-border bg-fill-hover px-4 py-3"
          >
            {shieldControl}
          </div>
        ) : null}
      </header>

      {/* Roster — desktop ruled table / mobile stacked cards (v2/RosterV2). */}
      <RosterV2
        team={team}
        race={race}
        progression={progression}
        onRename={onRename}
        onImprove={onImprove}
        onReorder={onReorder}
        reorderError={reorderError}
        onFire={onFire}
        onHire={hireClient}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Progresión — plantilla PE + bajas summary card. */}
        <section
          data-testid="ui-v2-progresion"
          aria-labelledby="ui-v2-progresion-heading"
          className="border border-border bg-panel"
        >
          <div className="border-b-2 border-navy px-4 py-3">
            <h2
              id="ui-v2-progresion-heading"
              className="font-display text-[17px] font-semibold text-navy"
            >
              Progresión
            </h2>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-3">
            <div className="border border-border bg-fill-hover px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
                PE de plantilla
              </p>
              <p
                className="font-display mt-0.5 text-[18px] font-extrabold text-star"
                data-testid="ui-v2-prog-pe"
              >
                ★{totalPe}
              </p>
            </div>
            <div className="border border-border bg-fill-hover px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
                {t("detail.tbl.dead")}
              </p>
              <p
                className="font-display mt-0.5 text-[18px] font-extrabold text-ink"
                data-testid="ui-v2-prog-dead"
              >
                {deadCount}
              </p>
            </div>
            <div className="border border-border bg-fill-hover px-3 py-2 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
                {t("detail.tbl.missNextMatch")}
              </p>
              <p
                className="font-display mt-0.5 text-[18px] font-extrabold text-ink"
                data-testid="ui-v2-prog-miss-next"
              >
                {missNextCount}
              </p>
            </div>
          </div>
        </section>

        {/* Cuerpo técnico — ledger cards instead of legacy's table/list. */}
        <section
          data-testid="ui-v2-coaching"
          aria-labelledby="ui-v2-coaching-heading"
          className="border border-border bg-panel"
        >
          <div className="border-b-2 border-navy px-4 py-3">
            <h2
              id="ui-v2-coaching-heading"
              className="font-display text-[17px] font-semibold text-navy"
            >
              {t("detail.cuerpoTecnico")}
            </h2>
          </div>
          <dl className="grid gap-2 p-4 sm:grid-cols-2">
            {coachingItems.map((item) => (
              <div key={item.key} className="border border-border bg-fill-hover px-3 py-2">
                <dt className="text-[11px] uppercase tracking-[0.05em] text-slate">
                  {t(COACHING_LABELS[item.key])}
                </dt>
                <dd className="mt-0.5 text-[13px] font-bold tabular-nums text-navy">
                  {formatRulebookCost(item.total)}
                </dd>
                <dd className="text-[11px] text-slate">
                  {item.quantity} × {formatRulebookCost(item.unitCost)}
                </dd>
              </div>
            ))}
            <div className="border border-border bg-fill-hover px-3 py-2">
              <dt className="text-[11px] uppercase tracking-[0.05em] text-slate">
                {t("coaching.apothecary")}
              </dt>
              <dd
                className={`mt-0.5 text-[13px] font-bold ${
                  team.coaching.apothecary ? "text-success" : "text-navy"
                }`}
              >
                {team.coaching.apothecary ? t("common.yes") : t("common.no")}
              </dd>
              <dd className="text-[11px] text-slate">{formatRulebookCost(APOTHECARY_COST)}</dd>
            </div>
            <div className="flex items-center justify-between border-t-2 border-navy px-3 pt-2 sm:col-span-full">
              <dt className="text-[12px] font-bold uppercase tracking-[0.05em] text-navy">
                {t("detail.coachingTotalRow")}
              </dt>
              <dd className="text-[13px] font-bold tabular-nums text-navy">
                {formatRulebookCost(coachingCost)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Tesorería — three stat cards on one row (same figures as legacy). */}
      <section
        data-testid="ui-v2-treasury"
        aria-labelledby="ui-v2-treasury-heading"
        className="border border-border bg-panel"
      >
        <div className="border-b-2 border-navy px-4 py-3">
          <h2
            id="ui-v2-treasury-heading"
            className="font-display text-[17px] font-semibold text-navy"
          >
            {t("detail.treasury")}
          </h2>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-3">
          <div className="border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.treasuryRoster")}
            </p>
            <p className="font-display mt-1 text-[18px] font-extrabold tabular-nums text-navy">
              {formatRulebookCost(rosterCost)}
            </p>
          </div>
          <div className="border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.cuerpoTecnico")}
            </p>
            <p className="font-display mt-1 text-[18px] font-extrabold tabular-nums text-navy">
              {formatRulebookCost(coachingCost)}
            </p>
          </div>
          <div className="border border-border bg-fill-hover p-3 text-center">
            <p className="text-[11px] uppercase tracking-[0.05em] text-slate">
              {t("detail.treasuryRemaining")}
            </p>
            <p className="font-display mt-1 text-[18px] font-extrabold tabular-nums text-red">
              {formatRulebookCost(treasury)}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
