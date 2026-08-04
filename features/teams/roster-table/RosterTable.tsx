"use client";

import type { PlayerEntry, Race } from "../types";
import { computeRosterCostFromPlayers } from "../roster";

export interface RosterTableProps {
  players: PlayerEntry[];
  race: Race;
  readOnly?: boolean;
  showTotals?: boolean;
  onRename?: (id: string, name: string) => void;
  onRemove?: (id: string) => void;
  remainingBudget?: number;
}

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

export function RosterTable({
  players,
  race,
  readOnly = false,
  showTotals = true,
  onRename,
  onRemove,
  remainingBudget,
}: RosterTableProps) {
  const totalCost = computeRosterCostFromPlayers(race, players);

  if (players.length === 0) {
    return <p className="text-sm text-slate-400">No players in roster yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-blue-600/20 text-left text-xs text-slate-400">
            <th scope="col" className="pb-2 pr-4 font-medium">Name</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Role</th>
            <th scope="col" className="pb-2 pr-2 font-medium">MA</th>
            <th scope="col" className="pb-2 pr-2 font-medium">ST</th>
            <th scope="col" className="pb-2 pr-2 font-medium">AG</th>
            <th scope="col" className="pb-2 pr-2 font-medium">PA</th>
            <th scope="col" className="pb-2 pr-2 font-medium">AV</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Cost</th>
            {!readOnly ? <th scope="col" className="pb-2 font-medium"></th> : null}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const positional = race.positionals.find((p) => p.key === player.positionalKey);
            return (
              <tr key={player.id} className="border-b border-blue-600/10">
                <td className="py-2 pr-4">
                  {readOnly ? (
                    <span className="text-white">{player.name}</span>
                  ) : (
                    <input
                      value={player.name}
                      onChange={(e) => onRename?.(player.id, e.target.value)}
                      aria-label={`Player name for ${player.name}`}
                      className="w-full rounded border border-blue-600/20 bg-slate-700 px-2 py-0.5 text-white outline-none focus:border-blue-500"
                    />
                  )}
                </td>
                <td className="py-2 pr-4 text-slate-300">{positional?.role ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-300">{positional?.ma ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-300">{positional?.st ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-300">{positional?.ag ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-300">{positional?.pa ?? "—"}</td>
                <td className="py-2 pr-2 text-slate-300">{positional?.av ?? "—"}</td>
                <td className="py-2 pr-4 text-slate-300">
                  {positional ? formatGold(positional.cost) : "—"}
                </td>
                {!readOnly ? (
                  <td className="py-2">
                    <button
                      type="button"
                      aria-label={`Remove ${player.name}`}
                      onClick={() => onRemove?.(player.id)}
                      className="rounded px-2 py-0.5 text-xs text-red-400 hover:text-red-300"
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
            <tr className="border-t border-blue-600/20 font-medium text-slate-300">
              <td colSpan={readOnly ? 7 : 7} className="pt-2 pr-4">
                {players.length} player{players.length === 1 ? "" : "s"}
              </td>
              <td className="pt-2 pr-4">{formatGold(totalCost)}</td>
              {!readOnly ? (
                <td className="pt-2">
                  {remainingBudget !== undefined ? (
                    <span className="text-xs text-slate-400">{formatGold(remainingBudget)} left</span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
