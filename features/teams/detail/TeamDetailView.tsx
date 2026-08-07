import type { Race, Team, TeamLeagueType } from "../types";
import { RosterTable } from "../roster-table/RosterTable";
import {
  computeRosterCostFromPlayers,
  computeCoachingCostItems,
  computeCoachingCost,
  APOTHECARY_COST,
  STARTING_TREASURY,
} from "../roster";
import { formatRulebookCost } from "../format";

/** Spanish display labels for the league-type enum (raw tokens never render). */
const LEAGUE_LABELS: Record<TeamLeagueType, string> = {
  open: "Liga Abierta",
  exhibition: "Exhibición",
};

const COACHING_LABELS: Record<string, string> = {
  rerolls: "Segundas oportunidades",
  dedicatedFans: "Fanáticos dedicados",
  assistantCoaches: "Entrenadores asistentes",
  cheerleaders: "Animadoras",
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
}

export function TeamDetailView({ team, race }: TeamDetailViewProps) {
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const treasury = STARTING_TREASURY - rosterCost - coachingCost;
  const coachingItems = computeCoachingCostItems(race, team.coaching);

  return (
    <div className="mx-auto max-w-[860px] bg-white text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]">
      {/* Hero */}
      <header className="bg-[#12225a] px-6 py-[22px] text-white">
        <h1 className="text-[26px] font-black tracking-[0.02em]">{team.name}</h1>
        <p className="mt-2 text-[13px] text-[#cbd5e1]">
          <b className="text-white">{race.name}</b> · {LEAGUE_LABELS[team.leagueType] ?? team.leagueType}
        </p>
        <div className="mt-3">
          <span className="mr-[6px] inline-block rounded-full border border-white/25 bg-white/10 px-[10px] py-[3px] text-[12px] font-bold text-white">
            Equipo listo
          </span>
          <span className="inline-block rounded-full border-[#d11938] bg-[#d11938] px-[10px] py-[3px] text-[12px] font-bold text-white">
            Tesorería: {formatRulebookCost(treasury)}
          </span>
        </div>
      </header>

      <div className="px-6 py-[18px]">
        {/* Plantilla */}
        <section aria-labelledby="plantilla-heading">
          <h2
            id="plantilla-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            Plantilla
          </h2>
          <div className="mx-auto max-w-[860px]">
            <RosterTable readOnly players={team.roster} race={race} />
          </div>
        </section>

        {/* Cuerpo técnico */}
        <section className="mt-5" aria-labelledby="coaching-heading">
          <h2
            id="coaching-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            Cuerpo técnico
          </h2>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#12225a] text-white">
                <th scope="col" className="px-[10px] py-[7px] text-left text-[12px] font-bold uppercase">
                  Concepto
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-left text-[12px] font-bold uppercase">
                  Cantidad
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-right text-[12px] font-bold uppercase">
                  Coste unitario
                </th>
                <th scope="col" className="px-[10px] py-[7px] text-right text-[12px] font-bold uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {coachingItems.map((item) => (
                <tr
                  key={item.key}
                  className="border-b border-[#e2e8f0] odd:bg-white even:bg-[#f1f5f9]"
                >
                  <td className="px-[10px] py-[7px]">{COACHING_LABELS[item.key] ?? item.key}</td>
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
                <td className="px-[10px] py-[7px]">Apotecario</td>
                <td className={`px-[10px] py-[7px] font-bold ${team.coaching.apothecary ? "text-green-600" : ""}`}>
                  {team.coaching.apothecary ? "SÍ" : "NO"}
                </td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(APOTHECARY_COST)}
                </td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(team.coaching.apothecary ? APOTHECARY_COST : 0)}
                </td>
              </tr>
              <tr className="bg-[#e2e8f0] font-bold">
                <td colSpan={3} className="px-[10px] py-[7px]">Total cuerpo técnico</td>
                <td className="px-[10px] py-[7px] text-right tabular-nums">
                  {formatRulebookCost(coachingCost)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Tesorería */}
        <section className="mt-5" aria-labelledby="treasury-heading">
          <h2
            id="treasury-heading"
            className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]"
          >
            Tesorería
          </h2>
          <div className="flex flex-wrap gap-2.5">
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">Coste plantilla</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-[#12225a]">
                {formatRulebookCost(rosterCost)}
              </p>
            </div>
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">Cuerpo técnico</p>
              <p className="mt-0.5 text-[18px] font-extrabold text-[#12225a]">
                {formatRulebookCost(coachingCost)}
              </p>
            </div>
            <div className="flex-1 rounded border border-[#e2e8f0] bg-[#f1f5f9] p-2.5 text-center">
              <p className="text-[11px] uppercase tracking-[0.05em] text-[#64748b]">Tesorería restante</p>
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
