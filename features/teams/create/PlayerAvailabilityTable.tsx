"use client";

import type { PlayerEntry, Race } from "../types";
import { STARTING_TREASURY } from "../roster";
import { getSkillById } from "../data/skills";
import { formatRulebookCost } from "../format";
import { translateRole } from "../roster-table/RosterTable";

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
 * the roster cap (but the row stays visible).
 */
export function PlayerAvailabilityTable({
  race,
  players,
  totalCost,
  onAdd,
  maxPlayers,
}: PlayerAvailabilityTableProps) {
  const countFor = (positionalKey: string): number =>
    players.filter((player) => player.positionalKey === positionalKey).length;

  return (
    <div className="max-h-[55vh] overflow-auto">
      <div className="overflow-x-auto">
        <div className="min-w-[640px] md:min-w-0 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
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
            {race.positionals.map((positional) => {
              const count = countFor(positional.key);
              // A row disappears entirely once its positional reaches its max.
              if (count >= positional.max) return null;

              const overBudget = totalCost + positional.cost > STARTING_TREASURY;
              const atMaxPlayers = players.length >= maxPlayers;
              const disabled = overBudget || atMaxPlayers;

              return (
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
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
