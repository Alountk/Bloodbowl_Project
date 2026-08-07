"use client";

import type { PlayerEntry, Race } from "../types";
import { computeRosterCostFromPlayers, MAX_REROLLS } from "../roster";
import { getSkillById } from "../data/skills";

export interface RosterTableProps {
  players: PlayerEntry[];
  race: Race;
  readOnly?: boolean;
  showTotals?: boolean;
  onRename?: (id: string, name: string) => void;
  onRemove?: (id: string) => void;
  remainingBudget?: number;
  /** Centered rulebook banner text; rendered only when the roster is non-empty. */
  bannerText?: string;
  /** When provided, renders the rulebook bottom footer row with Apotecario status. */
  apothecary?: boolean;
}

/** Formats a cost as the rulebook does: thousands grouped by non-breaking spaces, e.g. 50000 -> "50 000". */
export function formatRulebookCost(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Role -> Spanish label for the position subtitle. */
export const ROLE_TRANSLATIONS: Record<string, string> = {
  Lineman: "Línea",
  Thrower: "Lanzador",
  Catcher: "Receptor",
  Blitzer: "Blitzer",
  "Big Guy": "Grandullón",
};

/** Translates a positional role to Spanish, defaulting to "Otro" for unknown roles. */
export function translateRole(role: string | undefined): string {
  if (!role) return "Otro";
  return ROLE_TRANSLATIONS[role] ?? "Otro";
}

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

const HEADERS = ["CANT.", "POSICIÓN", "COSTE", "MV", "FU", "AG", "PS", "AR", "HABILIDADES Y RASGOS", "PRIMARIAS", "SECUNDARIAS"];

export function RosterTable({
  players,
  race,
  readOnly = false,
  showTotals = true,
  onRename,
  onRemove,
  remainingBudget,
  bannerText,
  apothecary,
}: RosterTableProps) {
  const totalCost = computeRosterCostFromPlayers(race, players);

  if (players.length === 0) {
    return <p className="text-sm text-slate-400">No players in roster yet.</p>;
  }

  const showBanner = bannerText !== undefined && bannerText.length > 0;

  return (
    <div className="overflow-x-auto">
      <div className="max-w-[900px] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
        {showBanner ? (
          <div className="border-y-[5px] border-[#12225a] bg-white py-[5px] text-center text-[28px] text-[#12225a]">
            {bannerText}
          </div>
        ) : null}
        <table className="w-full text-sm">
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className={`bg-[#d11938] px-[5px] py-2 text-white ${
                    header === "POSICIÓN" || header === "HABILIDADES Y RASGOS"
                      ? "text-left"
                      : "text-center"
                  } font-black uppercase`}
                >
                  {header}
                </th>
              ))}
              {!readOnly ? <th scope="col" className="bg-[#d11938] px-[5px] py-2"></th> : null}
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const positional = race.positionals.find((p) => p.key === player.positionalKey);
              const primary = positional?.accessPrimary ?? [];
              const secondary = positional?.accessSecondary ?? [];
              return (
                <tr
                  key={player.id}
                  className="odd:bg-white even:bg-[#e6eef5]"
                >
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional ? `${Math.min(positional.min ?? 0, positional.max)}-${positional.max}` : "—"}
                  </td>
                  <td className="px-[5px] py-2 text-left align-top text-[#1a1a1a]">
                    {readOnly ? (
                      <span>{player.name}</span>
                    ) : (
                      <input
                        value={player.name}
                        onChange={(e) => onRename?.(player.id, e.target.value)}
                        aria-label={`Player name for ${player.name}`}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-900 outline-none focus:border-blue-500"
                      />
                    )}
                    <span className="pos-subtext mt-0.5 block text-[11px] text-[#333]">
                      ({race.name}, {translateRole(positional?.role)})
                    </span>
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional ? formatRulebookCost(positional.cost) : "—"}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">{positional?.ma ?? "—"}</td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">{positional?.st ?? "—"}</td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">{positional?.ag ?? "—"}</td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">{positional?.pa ?? "—"}</td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">{positional?.av ?? "—"}</td>
                  <td className="px-[5px] py-2 text-left align-top text-[#1a1a1a]">
                    {positional && positional.skills.length > 0 ? (
                      <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {positional.skills.map((skillId) => {
                          const skill = getSkillById(skillId);
                          const es = skill?.translations.find((t) => t.id === "es")?.translation;
                          return (
                            <li key={skillId} className="text-xs">
                              {es ?? skill?.name ?? skillId}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <span>Ninguna</span>
                    )}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {primary.length > 0 ? primary.join(" ") : "—"}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {secondary.length > 0 ? secondary.join(" ") : "—"}
                  </td>
                  {!readOnly ? (
                    <td className="px-[5px] py-2 text-center align-top">
                      <button
                        type="button"
                        aria-label={`Remove ${player.name}`}
                        onClick={() => onRemove?.(player.id)}
                        className="rounded px-2 py-0.5 text-xs text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          {showTotals ? (
            <tfoot>
              <tr className="font-medium text-[#1a1a1a]">
                <td colSpan={10} className="px-[5px] py-2 text-left">
                  {players.length} player{players.length === 1 ? "" : "s"}
                </td>
                <td className="px-[5px] py-2 text-center">{formatRulebookCost(totalCost)}</td>
                {!readOnly ? (
                  <td className="px-[5px] py-2 text-center">
                    {remainingBudget !== undefined ? (
                      <span className="text-xs">{formatGold(remainingBudget)} left</span>
                    ) : null}
                  </td>
                ) : null}
              </tr>
              {apothecary !== undefined ? (
                <tr className="bg-[#12225a] text-[13px] font-bold text-white">
                  <td colSpan={5} className="px-[5px] py-2 text-left">
                    {`0-${MAX_REROLLS} Segundas oportunidades: ${formatRulebookCost(race.rerollCost)} M.O. cada una`}
                  </td>
                  <td colSpan={6} className="px-[5px] py-2 text-left">
                    {`Apotecario: ${apothecary ? "SÍ" : "NO"}`}
                  </td>
                  {!readOnly ? <td className="px-[5px] py-2"></td> : null}
                </tr>
              ) : null}
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
