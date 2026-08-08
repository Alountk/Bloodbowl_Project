"use client";

import type { PlayerEntry, Race } from "../types";
import { STARTING_TREASURY } from "../roster";
import { getSkillById } from "../data/skills";
import { formatRulebookCost } from "../format";
import { translateRole } from "../roster-table/RosterTable";
import { useIsDesktop } from "../hooks/useIsDesktop";

export interface PlayerAvailabilityTableProps {
  race: Race;
  players: PlayerEntry[];
  /** Current total roster + coaching cost used to gate over-budget adds. */
  totalCost: number;
  onAdd: (positionalKey: string) => void;
  /** Global roster cap (MAX_PLAYERS) used to disable adds when full. */
  maxPlayers: number;
}

const AVAILABILITY_HEADERS = [
  "POSICIÓN",
  "COSTE",
  "MV",
  "FU",
  "AG",
  "PS",
  "AR",
  "HABILIDADES Y RASGOS",
  "DISP.",
];

/**

 * Rulebook-style availability table listing every positional a race offers,
 * with the selectable count and an Add action. Rows disappear once their
 * positional reaches its max; the Add button disables when over budget or at
 * the roster cap (but the row stays visible). Below `md` renders one stacked
 * row per positional instead of the book table.
 */
export function PlayerAvailabilityTable({
  race,
  players,
  totalCost,
  onAdd,
  maxPlayers,
}: PlayerAvailabilityTableProps) {
  const isDesktop = useIsDesktop();
  const countFor = (positionalKey: string): number =>
    players.filter((player) => player.positionalKey === positionalKey).length;

  // Shared per-row data consumed by both the book table and the mobile rows.
  const rows = race.positionals
    .map((positional) => {
      const count = countFor(positional.key);
      const overBudget = totalCost + positional.cost > STARTING_TREASURY;
      const atMaxPlayers = players.length >= maxPlayers;
      return {
        positional,
        count,
        missingCount: positional.max - count,
        disabled: overBudget || atMaxPlayers,
      };
    })
    // A row disappears entirely once its positional reaches its max.
    .filter((row) => row.missingCount > 0);

  return isDesktop ? (
    <div className="max-h-[55vh] overflow-auto">
      <div className="overflow-x-auto">
        <div className="min-w-[640px] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {AVAILABILITY_HEADERS.map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className={`sticky top-0 z-10 bg-[#d11938] px-[5px] py-2 text-white ${
                      header === "POSICIÓN" || header === "HABILIDADES Y RASGOS"
                        ? "text-left"
                        : "text-center"
                    } font-black uppercase`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ positional, count, disabled }) => (
                <tr key={positional.key} className="odd:bg-white even:bg-[#e6eef5]">
                  <td className="px-[5px] py-2 text-left align-top text-[#1a1a1a]">
                    <span>
                      {positional.name} · ({race.name}, {translateRole(positional.role)})
                    </span>
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {formatRulebookCost(positional.cost)}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional.ma}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional.st}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional.ag}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional.pa}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top text-[#1a1a1a]">
                    {positional.av}
                  </td>
                  <td className="px-[5px] py-2 text-left align-top text-[#1a1a1a]">
                    {positional.skills.length > 0 ? (
                      <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {positional.skills.map((skillId) => {
                          const skill = getSkillById(skillId);
                          const es = skill?.translations.find((t) => t.id === "es")?.translation;
                          return <li key={skillId} className="text-xs">{es ?? skill?.name ?? skillId}</li>;
                        })}
                      </ul>
                    ) : (
                      <span>Ninguna</span>
                    )}
                  </td>
                  <td className="px-[5px] py-2 text-center align-top">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xs text-[#64748b]">
                        {count}/{positional.max}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add ${positional.name}`}
                        onClick={() => onAdd(positional.key)}
                        disabled={disabled}
                        className="rounded-md border border-slate-300 px-2 py-0.5 text-sm text-[#334155] hover:border-[#12225a] hover:text-[#12225a] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        + Add
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-[900px]">
      <div className="space-y-3">
          {rows.map(({ positional, count, disabled }) => {
            const stats: Array<[string, string]> = [
              ["MV", positional.ma.toString()],
              ["FU", positional.st.toString()],
              ["AG", positional.ag],
              ["PS", positional.pa],
              ["AR", positional.av],
            ];
            return (
              <div
                key={positional.key}
                className="rounded-md border border-[#e2e8f0] bg-white p-3 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-[#1a1a1a]">{positional.name}</span>
                    <span className="block text-[11px] text-[#333]">
                      <span>{"("}{race.name}, {translateRole(positional.role)}{")"}</span>
                      {" · "}
                      <span className="font-medium text-[#64748b]">{formatRulebookCost(positional.cost)}</span>
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs text-[#64748b]">
                      {count}/{positional.max}
                    </span>
                    <button
                      type="button"
                      aria-label={`Add ${positional.name}`}
                      onClick={() => onAdd(positional.key)}
                      disabled={disabled}
                      className="rounded-md border border-slate-300 px-2 py-0.5 text-sm text-[#334155] hover:border-[#12225a] hover:text-[#12225a] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {stats.map(([label, value]) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded bg-[#eaf0f6] px-1.5 py-0.5 text-xs text-[#1a1a1a]"
                    >
                      <span className="font-bold text-[#12225a]">{label}</span>
                      <span>{value}</span>
                    </span>
                  ))}
                </div>

                <div className="mt-2 border-t border-[#e2e8f0] pt-2 space-y-1 text-xs text-[#1a1a1a]">
                  <div>
                    <span className="font-bold text-[#12225a]">SKILLS</span>:{" "}
                    <span>
                      {positional.skills.length > 0
                        ? positional.skills
                            .map((skillId) => {
                              const skill = getSkillById(skillId);
                              const es = skill?.translations.find((t) => t.id === "es")?.translation;
                              return es ?? skill?.name ?? skillId;
                            })
                            .join(", ")
                        : "Ninguna"}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-[#12225a]">PRIMARIAS</span>:{" "}
                    <span>{positional.accessPrimary.length > 0 ? positional.accessPrimary.join(" ") : "—"}</span>
                  </div>
                  <div>
                    <span className="font-bold text-[#12225a]">SECUNDARIAS</span>:{" "}
                    <span>{positional.accessSecondary.length > 0 ? positional.accessSecondary.join(" ") : "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      );
  }
