import type { Race, Team, PlayerProgressionCore } from "../types";
import { useIsDesktop } from "../hooks/useIsDesktop";
import {
  computeRosterCostFromPlayers,
  computeCoachingCostItems,
  computeCoachingCost,
  APOTHECARY_COST,
  STARTING_TREASURY,
} from "../roster";
import { formatRulebookCost } from "../format";
import { TeamRosterTable } from "./TeamRosterTable";
import type { ImproveBody } from "@/lib/progression";
import { useI18n } from "@/lib/i18n";

const COACHING_LABELS: Record<string, string> = {
  rerolls: "coaching.rerolls",
  dedicatedFans: "coaching.dedicatedFans",
  assistantCoaches: "coaching.assistantCoaches",
  cheerleaders: "coaching.cheerleaders",
};

export interface TeamDetailViewProps {
  team: Team;
  /**
   * Resolved race for this team. Caller is responsible for passing getRaceById(team.raceId)
   * and constructing a FALLBACK_RACE when the catalog returns undefined:
   *   { id: team.raceId, name: team.raceId, rerollCost: 0, positionals: [] }
   * This ensures RosterTable always receives a valid Race shape and the raw raceId is
   * displayed as the race name (spec requirement: Race-not-in-catalog Fallback).
   */
  race: Race;
  /**
   * Display name of the team's league, when the team is assigned. When absent,
   * the meta line shows "Sin liga". PR2 resolves this from a league store.
   */
  leagueName?: string;
  /**
   * Each roster player's progression state, keyed by `rosterPlayerId`. When
   * provided, the roster renders the TourPlay-style table with PE-spending
   * affordances; otherwise it is read-only (e.g. rival scouting).
   */
  progression?: Record<string, PlayerProgressionCore>;
  /** Improve-route client (rosterPlayerId + body). Required to render spend UI;
   * absent = read-only. Each roster player's modal is bound to its player id. */
  onImprove?: (rosterPlayerId: string, body: ImproveBody) => Promise<Record<string, unknown>>;
  /** Rename-route client (rosterPlayerId + name); absent = read-only. */
  onRename?: (rosterPlayerId: string, name: string) => Promise<Record<string, unknown>>;
  /** Reorder-route client (RAU-9) — full new roster id sequence; absent = read-only. */
  onReorder?: (rosterPlayerIds: string[]) => Promise<Record<string, unknown>>;
  /** Reorder failure surfaced by the caller (shown under the roster table). */
  reorderError?: string | null;
}

export function TeamDetailView({ team, race, leagueName, progression, onImprove, onRename, onReorder, reorderError }: TeamDetailViewProps) {
  const isDesktop = useIsDesktop();
  const { t } = useI18n();
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const treasury = STARTING_TREASURY - rosterCost - coachingCost;
  const coachingItems = computeCoachingCostItems(race, team.coaching);
  const leagueLabel = team.leagueId ? (leagueName ?? t("detail.sinLiga")) : t("detail.sinLiga");

  return (
    <div className="mx-auto max-w-[860px] bg-white text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]">
      {/* Hero */}
      <header className="bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <h1 className="text-2xl font-black tracking-[0.02em] md:text-[28px]">{team.name}</h1>
        <p className="mt-2 text-[13px] text-[#cbd5e1]">
          <b className="text-white">{race.name}</b> · {leagueLabel}
        </p>
        <div className="mt-3">
          <span className="mr-[6px] inline-block rounded-full border border-white/25 bg-white/10 px-[10px] py-[3px] text-[12px] font-bold text-white">
            {t("detail.equipoListo")}
          </span>
          <span className="inline-block rounded-full border-[#d11938] bg-[#d11938] px-[10px] py-[3px] text-[12px] font-bold text-white">
            {t("detail.treasuryTag", { amount: formatRulebookCost(treasury) })}
          </span>
        </div>
      </header>

      <div className="px-6 py-[18px]">
        {/* Plantilla (TourPlay-style roster with progression in the table) */}
        <section aria-labelledby="plantilla-heading">
          <h2
            id="plantilla-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            {t("detail.plantilla")}
          </h2>
          <div className="mx-auto max-w-[860px]">
            <TeamRosterTable
              team={team}
              race={race}
              progression={progression}
              onRename={onRename}
              onImprove={onImprove}
              onReorder={onReorder}
              reorderError={reorderError}
            />
          </div>
        </section>

        {/* Cuerpo técnico */}
        <section className="mt-5" aria-labelledby="coaching-heading">
          <h2
            id="coaching-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            {t("detail.cuerpoTecnico")}
          </h2>
          {isDesktop ? (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
              <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#12225a] text-white">
                <th scope="col" className="px-[10px] py-[7px] text-left text-[12px] font-bold uppercase">
                  {t("detail.coachingConcept")}
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-left text-[12px] font-bold uppercase">
                  {t("detail.coachingQty")}
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-right text-[12px] font-bold uppercase">
                  {t("detail.coachingUnitCost")}
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-right text-[12px] font-bold uppercase">
                  {t("detail.coachingTotal")}
                </th>
              </tr>
            </thead>
            <tbody>
              {coachingItems.map((item) => (
                <tr
                  key={item.key}
                  className="border-b border-[#e2e8f0] odd:bg-white even:bg-[#f1f5f9]"
                >
                  <td className="px-[10px] py-[7px]">{t(COACHING_LABELS[item.key])}</td>
                  <td className="px-[10px] py-[7px]">{item.quantity}</td>
                  <td className="px-[10px] py-[7px] text-right tabular-nums">
                    {formatRulebookCost(item.unitCost)}
                  </td>
                  <td className="px-[10px] py-[7px] text-right tabular-nums">
                    {formatRulebookCost(item.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-[#e2e8f0] odd:bg-white even:bg-[#f1f5f9]">
                <td className="px-[10px] py-[7px]">{t("coaching.apothecary")}</td>
                <td className={`px-[10px] py-[7px] font-bold ${team.coaching.apothecary ? "text-green-600" : ""}`}>
                  {team.coaching.apothecary ? t("common.yes") : t("common.no")}
                </td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(APOTHECARY_COST)}
                </td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(team.coaching.apothecary ? APOTHECARY_COST : 0)}
                </td>
              </tr>
              <tr className="bg-[#e2e8f0] font-bold">
                <td colSpan={3} className="px-[10px] py-[7px]">{t("detail.coachingTotalRow")}</td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(coachingCost)}
                </td>
              </tr>
            </tbody>
              </table>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#e2e8f0] rounded border border-[#e2e8f0] bg-white">
              {coachingItems.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1a1a]">
                      {t(COACHING_LABELS[item.key])}
                    </p>
                    <p className="text-[11px] text-[#64748b]">
                      {item.quantity} × {formatRulebookCost(item.unitCost)}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold tabular-nums text-[#12225a]">
                    {formatRulebookCost(item.total)}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[#1a1a1a]">{t("coaching.apothecary")}</p>
                  <p className="text-[11px] text-[#64748b]">50 000</p>
                </div>
                <p
                  className={`text-[13px] font-bold tabular-nums ${
                    team.coaching.apothecary ? "text-green-600" : "text-[#1a1a1a]"
                  }`}
                >
                  {team.coaching.apothecary ? t("common.yes") : t("common.no")}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 bg-[#e2e8f0] px-3 py-2">
                <p className="text-[13px] font-bold text-[#1a1a1a]">{t("detail.coachingTotalRow")}</p>
                <p className="text-[13px] font-bold tabular-nums text-[#12225a]">
                  {formatRulebookCost(coachingCost)}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Tesorería */}
        <section className="mt-5" aria-labelledby="treasury-heading">
          <h2
            id="treasury-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            {t("detail.treasury")}
          </h2>
          <div className="flex flex-wrap gap-2.5">
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">{t("detail.treasuryRoster")}</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-[#12225a]">
                {formatRulebookCost(rosterCost)}
              </p>
            </div>
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">{t("detail.cuerpoTecnico")}</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-[#12225a]">
                {formatRulebookCost(coachingCost)}
              </p>
            </div>
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">{t("detail.treasuryRemaining")}</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-[#d11938]">
                {formatRulebookCost(treasury)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
