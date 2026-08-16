"use client";

import type { PlayerEntry, Race } from "../types";
import { computeRosterCostFromPlayers, MAX_REROLLS } from "../roster";
import { getSkillById } from "../data/skills";
import { formatRulebookCost } from "../format";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { useI18n } from "@/lib/i18n";

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

const RULEBOOK_HEADER_KEYS = [
  "position",
  "cost",
  "ma",
  "st",
  "ag",
  "pa",
  "av",
  "skills",
  "primary",
  "secondary",
] as const;

const RULEBOOK_HEADER_T_KEY: Record<(typeof RULEBOOK_HEADER_KEYS)[number], string> = {
  position: "roster.header.position",
  cost: "roster.header.cost",
  ma: "roster.header.ma",
  st: "roster.header.st",
  ag: "roster.header.ag",
  pa: "roster.header.pa",
  av: "roster.header.av",
  skills: "roster.header.skills",
  primary: "roster.header.primary",
  secondary: "roster.header.secondary",
};

/** Resolves the Spanish (fallback English) skill names for a positional. */
function resolveSkillNames(positional: Race["positionals"][number]): string[] {
  return positional.skills.map((skillId) => {
    const skill = getSkillById(skillId);
    const es = skill?.translations.find((t) => t.id === "es")?.translation;
    return es ?? skill?.name ?? skillId;
  });
}

interface PlayerCellData {
  player: PlayerEntry;
  positional: Race["positionals"][number] | undefined;
  primary: string[];
  secondary: string[];
  skillNames: string[];
}

/** Builds the per-player data shared by the desktop book table and mobile cards. */
function buildPlayerData(players: PlayerEntry[], race: Race): PlayerCellData[] {
  return players.map((player) => {
    const positional = race.positionals.find((p) => p.key === player.positionalKey);
    return {
      player,
      positional,
      primary: positional?.accessPrimary ?? [],
      secondary: positional?.accessSecondary ?? [],
      skillNames: positional ? resolveSkillNames(positional) : [],
    };
  });
}

/** Stats chips shared by desktop and mobile so the mv/fu/ag/ps/ar values stay identical. */
function StatsChips({ data }: { data: PlayerCellData }) {
  const { t } = useI18n();
  const stats: Array<[string, string]> = [
    [t("roster.header.ma"), data.positional?.ma?.toString() ?? "—"],
    [t("roster.header.st"), data.positional?.st?.toString() ?? "—"],
    [t("roster.header.ag"), data.positional?.ag ?? "—"],
    [t("roster.header.pa"), data.positional?.pa ?? "—"],
    [t("roster.header.av"), data.positional?.av ?? "—"],
  ];
  return (
    <div className="flex flex-wrap gap-1">
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
  );
}

/** Labeled skill/access rows shared by desktop and mobile. */
function SkillAccessRows({ data }: { data: PlayerCellData }) {
  const { t } = useI18n();
  const { skillNames, primary, secondary } = data;
  return (
    <div className="space-y-1 text-xs text-[#1a1a1a]">
      <div>
        <span className="font-bold text-[#12225a]">{t("roster.skillsLabel")}</span>:{" "}
        <span>{skillNames.length > 0 ? skillNames.join(", ") : t("roster.none")}</span>
      </div>
      <div>
        <span className="font-bold text-[#12225a]">{t("roster.header.primary")}</span>:{" "}
        <span>{primary.length > 0 ? primary.join(" ") : "—"}</span>
      </div>
      <div>
        <span className="font-bold text-[#12225a]">{t("roster.header.secondary")}</span>:{" "}
        <span>{secondary.length > 0 ? secondary.join(" ") : "—"}</span>
      </div>
    </div>
  );
}

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
  const isDesktop = useIsDesktop();
  const { t } = useI18n();
  const totalCost = computeRosterCostFromPlayers(race, players);

  if (players.length === 0) {
    return <p className="text-sm text-slate-400">{t("roster.empty")}</p>;
  }

  // Banner is a rulebook editable-mode affordance; read-only renders must never show it.
  const showBanner = !readOnly && bannerText !== undefined && bannerText.length > 0;

  const playersData = buildPlayerData(players, race);
  const playerCountLabel =
    players.length === 1
      ? t("roster.playersOne", { count: players.length })
      : t("roster.playersMany", { count: players.length });

  return isDesktop ? (
    <div className="max-h-[55vh] overflow-auto">
      <div className="overflow-x-auto">
        <div className="min-w-[640px] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
          {showBanner ? (
            <div className="border-y-[5px] border-[#12225a] bg-white py-[5px] text-center text-[28px] text-[#12225a]">
              {bannerText}
            </div>
          ) : null}
          <table className="w-full text-sm">
            <thead>
              <tr>
                {RULEBOOK_HEADER_KEYS.map((headerKey) => (
                  <th
                    key={headerKey}
                    scope="col"
                    className={`sticky top-0 z-10 bg-[#d11938] px-[5px] py-2 text-white ${
                      headerKey === "position" || headerKey === "skills"
                        ? "text-left"
                        : "text-center"
                    } font-black uppercase`}
                  >
                    {t(RULEBOOK_HEADER_T_KEY[headerKey])}
                  </th>
                ))}
                {!readOnly ? <th scope="col" className="sticky top-0 z-10 bg-[#d11938] px-[5px] py-2"></th> : null}
              </tr>
            </thead>
            <tbody>
              {playersData.map(({ player, positional, primary, secondary, skillNames }) => (
                <tr
                  key={player.id}
                  className="odd:bg-white even:bg-[#e6eef5]"
                >
                  <td className="px-[5px] py-2 text-left align-top text-[#1a1a1a]">
                    {readOnly ? (
                      <span>{player.name}</span>
                    ) : (
                      <input
                        value={player.name}
                        onChange={(e) => onRename?.(player.id, e.target.value)}
                        aria-label={t("roster.playerNameAria", { name: player.name })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-0.5 text-slate-900 outline-none focus:border-blue-500"
                      />
                    )}
                    {readOnly ? (
                      <span className="pos-subtext mt-0.5 block text-[11px] text-[#333]">
                        ({race.name}, {translateRole(positional?.role)})
                      </span>
                    ) : (
                      <span className="pos-subtext mt-0.5 block text-[11px] text-[#333]">
                        {positional?.name ?? t("roster.playerFallback")} · ({race.name}, {translateRole(positional?.role)})
                      </span>
                    )}
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
                        {skillNames.map((skillName) => (
                          <li key={skillName} className="text-xs">
                            {skillName}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span>{t("roster.none")}</span>
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
                        aria-label={t("roster.removeAria", { name: player.name })}
                        onClick={() => onRemove?.(player.id)}
                        className="rounded px-2 py-0.5 text-xs text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            {showTotals ? (
              <tfoot>
                {readOnly ? (
                  <tr className="bg-[#12225a] font-bold text-white">
                    <td colSpan={7} className="px-[5px] py-2 text-left">
                      {t("roster.readOnlyTotal", { count: players.length })}
                    </td>
                    <td className="px-[5px] py-2 text-center">{formatRulebookCost(totalCost)}</td>
                    <td colSpan={2} className="px-[5px] py-2"></td>
                  </tr>
                ) : (
                  <tr className="font-medium text-[#1a1a1a]">
                    <td colSpan={9} className="px-[5px] py-2 text-left">
                      {playerCountLabel}
                    </td>
                    <td className="px-[5px] py-2 text-center">{formatRulebookCost(totalCost)}</td>
                    <td className="px-[5px] py-2 text-center">
                      {remainingBudget !== undefined ? (
                        <span className="text-xs">
                          {t("roster.remainingLeft", { amount: formatGold(remainingBudget) })}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )}
                {apothecary !== undefined ? (
                  <tr className="bg-[#12225a] text-[13px] font-bold text-white">
                    <td colSpan={4} className="px-[5px] py-2 text-left">
                      {t("roster.rerollFooter", {
                        max: MAX_REROLLS,
                        cost: formatRulebookCost(race.rerollCost),
                      })}
                    </td>
                    <td colSpan={6} className="px-[5px] py-2 text-left">
                      {t("roster.apothecaryFooter", {
                        status: apothecary ? t("common.yes") : t("common.no"),
                      })}
                    </td>
                    {!readOnly ? <td className="px-[5px] py-2"></td> : null}
                  </tr>
                ) : null}
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  ) : (
    <div className="mx-auto max-w-[900px]">
      <div className="space-y-3">
          {showBanner ? (
            <div className="border-y-[5px] border-[#12225a] bg-white py-[5px] text-center text-[20px] text-[#12225a]">
              {bannerText}
            </div>
          ) : null}
          {playersData.map((data) => {
            const { player, positional } = data;
            return (
              <div
                key={player.id}
                className="rounded-md border border-[#e2e8f0] bg-white p-3 shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {readOnly ? (
                      <span className="text-sm font-semibold text-[#1a1a1a]">{player.name}</span>
                    ) : (
                      <input
                        value={player.name}
                        onChange={(e) => onRename?.(player.id, e.target.value)}
                        aria-label={t("roster.playerNameAria", { name: player.name })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-0.5 text-sm text-slate-900 outline-none focus:border-blue-500"
                      />
                    )}
                    <span className="block text-[11px] text-[#333]">
                      {positional?.name ?? t("roster.playerFallback")} · ({race.name}, {translateRole(positional?.role)})
                    </span>
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      aria-label={t("roster.removeAria", { name: player.name })}
                      onClick={() => onRemove?.(player.id)}
                      className="rounded px-2 py-0.5 text-xs text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                <div className="mt-2">
                  <StatsChips data={data} />
                </div>

                <div className="mt-2 flex items-baseline gap-1 text-xs text-[#334155]">
                  <span className="font-bold text-[#12225a]">{t("roster.costLabel")}</span>
                  <span>{positional ? formatRulebookCost(positional.cost) : "—"}</span>
                </div>

                <div className="mt-2 border-t border-[#e2e8f0] pt-2">
                  <SkillAccessRows data={data} />
                </div>
              </div>
            );
          })}
          {showTotals ? (
            <div className="rounded-md border border-[#12225a] bg-[#12225a] px-3 py-2 text-[13px] font-bold text-white">
              {readOnly ? (
                <span>
                  {t("roster.mobileTotal", {
                    count: players.length,
                    cost: formatRulebookCost(totalCost),
                  })}
                </span>
              ) : (
                <span>
                  {t("roster.mobileTotal", {
                    count: players.length,
                    cost: formatRulebookCost(totalCost),
                  })}
                  {remainingBudget !== undefined ? (
                    <span className="ml-1 font-medium text-[#cbd5e1]">
                      {t("roster.remainingLeft", { amount: formatGold(remainingBudget) })}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          ) : null}
          {apothecary !== undefined ? (
            <div className="rounded-md border border-[#e2e8f0] bg-white px-3 py-2 text-[13px] font-bold text-[#1a1a1a]">
              <span>
                {t("roster.rerollFooter", {
                  max: MAX_REROLLS,
                  cost: formatRulebookCost(race.rerollCost),
                })}
              </span>
              <span className="ml-2">
                {t("roster.apothecaryFooter", {
                  status: apothecary ? t("common.yes") : t("common.no"),
                })}
              </span>
            </div>
          ) : null}
          </div>
        </div>
      );
  }
