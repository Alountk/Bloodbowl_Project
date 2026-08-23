"use client";

import { Fragment, useMemo, useState } from "react";
import type { PlayerEntry, PlayerProgressionCore, Race, Team } from "../types";
import { translateRole } from "../roster-table/RosterTable";
import { formatRulebookCost } from "../format";
import { skillDisplayName, skillElite, skillKey } from "@/lib/progression";
import type { ImproveBody } from "@/lib/progression";
import { nextImprovementCost } from "@/lib/rules";
import type { PlayerAttribute } from "@/lib/rules/improvements";
import { useI18n } from "@/lib/i18n";
import { applyAttributeIncreases, isAttributeBetter } from "./characteristics";
import { PlayerImproveModal, type ModalPlayer } from "./PlayerImproveModal";

/** Positional-role → tasteful emoji placeholder (no art assets). */
const ROLE_ICONS: Record<string, string> = {
  Lineman: "🚶",
  Thrower: "🎯",
  Catcher: "🙌",
  Blitzer: "⚔️",
  Blocker: "🛡️",
  Runner: "🏃",
  "Big Guy": "💪",
  Special: "🔥",
};

const FALLBACK_ICON = "⚡";

const ATTRIBUTES: PlayerAttribute[] = ["ma", "st", "ag", "pa", "av"];

export interface TeamRosterTableProps {
  team: Team;
  race: Race;
  /**
   * Each roster player's progression state, keyed by `rosterPlayerId`. When
   * absent (rival scouting or a failed fetch) the table renders read-only: no
   * click handlers, CAS/MVP "·".
   */
  progression?: Record<string, PlayerProgressionCore>;
  /** Rename-route client (rosterPlayerId + name); absent = read-only. */
  onRename?: (rosterPlayerId: string, name: string) => Promise<Record<string, unknown>>;
  /** Improve-route client (rosterPlayerId + body); absent = read-only. */
  onImprove?: (rosterPlayerId: string, body: ImproveBody) => Promise<Record<string, unknown>>;
  /**
   * Reorder-route client (RAU-9): receives the full roster id sequence in the
   * NEW order; the parent optimistically applies it and reverts on failure.
   * Absent = read-only (no arrows). The dorsal follows the roster order, so
   * reordering renumbers the squad.
   */
  onReorder?: (rosterPlayerIds: string[]) => Promise<Record<string, unknown>>;
  /** A reorder failure surfaced by the parent (shown under the table). */
  reorderError?: string | null;
  /** Fire-route client (RAU-10); absent = no Despedir action in the modal. */
  onFire?: (rosterPlayerId: string) => Promise<Record<string, unknown>>;
}

function iconFor(role: string | undefined): string {
  if (!role) return FALLBACK_ICON;
  return ROLE_ICONS[role] ?? FALLBACK_ICON;
}

function skillRefs(
  positional: Race["positionals"][number] | undefined,
  owned: string[],
): { ref: string; origin: "default" | "bought"; elite: boolean }[] {
  const starting = new Set((positional?.skills ?? []).map((s) => skillKey(s)));
  const seen = new Set<string>();
  const refs: { ref: string; origin: "default" | "bought"; elite: boolean }[] = [];
  for (const ref of [...(positional?.skills ?? []), ...owned]) {
    const key = skillKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({
      ref,
      // Only XP-purchased skills are marked; starting skills stay plain.
      origin: starting.has(key) ? "default" : "bought",
      elite: skillElite(ref),
    });
  }
  return refs;
}

/**
 * TeamRosterTable — rulebook-style dense roster for the team detail page
 * (RAU-46, Option A). Progression lives IN the table (NI, SPP bar toward the
 * next improvement cost, CAS, MVP, value with bonus breakdown) and a row click
 * opens the PE-spending modal for the owner. Read-only when no progression or
 * no onImprove handler is provided (rival scouting / failed fetch).
 */
export function TeamRosterTable({
  team,
  race,
  progression,
  onRename,
  onImprove,
  onReorder,
  onFire,
  reorderError,
}: TeamRosterTableProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<ModalPlayer | null>(null);

  const interactive = progression != null && onImprove != null;
  const canReorder = interactive && onReorder != null;
  const otherNames = useMemo(
    () => team.roster.map((entry) => entry.name),
    [team.roster],
  );

  if (team.roster.length === 0) {
    return <p className="text-sm text-slate-400">{t("roster.empty")}</p>;
  }

  // RAU-9: swaps a row with its neighbor (direction -1/1) and hands the FULL
  // new id sequence to the parent's reorder client. The parent applies it
  // optimistically (the dorsal re-renders instantly) and reverts on failure.
  const movePlayer = (index: number, direction: -1 | 1) => {
    if (!canReorder) return;
    const target = index + direction;
    if (target < 0 || target >= team.roster.length) return;
    const next = [...team.roster];
    [next[index], next[target]] = [next[target], next[index]];
    void onReorder!(next.map((entry) => entry.id));
  };

  const openPlayer = (entry: PlayerEntry, index: number) => {
    if (!interactive) return;
    const core = progression?.[entry.id];
    const positional = race.positionals.find((p) => p.key === entry.positionalKey);
    const baseCost = positional?.cost ?? 0;
    setSelected({
      rosterPlayerId: entry.id,
      number: index + 1,
      name: entry.name,
      icon: iconFor(positional?.role),
      positionalName: positional?.name ?? t("roster.playerFallback"),
      role: translateRole(positional?.role),
      raceName: race.name,
      baseAttributes: {
        ma: positional?.ma ?? "—",
        st: positional?.st ?? "—",
        ag: positional?.ag ?? "—",
        pa: positional?.pa ?? "—",
        av: positional?.av ?? "—",
      },
      attributeIncreases: core?.attributeIncreases ?? {},
      value: baseCost + (core?.valueBonus ?? 0),
      pe: core?.pe ?? 0,
      improvements: core?.improvements ?? 0,
      skills: core?.skills ?? [],
      alive: core?.alive ?? true,
      injuries: core?.injuries ?? [],
      accessPrimary: positional?.accessPrimary ?? [],
      accessSecondary: positional?.accessSecondary ?? [],
    });
  };

  return (
    <>
      <div className="overflow-x-auto border border-[#e2e8f0]">
        <table className="w-full min-w-[900px] border-collapse text-[12.5px]" data-testid="team-roster-table">
          <thead>
            <tr className="bg-[#12225a] text-white">
              {canReorder ? <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-1 py-2" /> : null}
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.number")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase" />
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-left text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.player")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-left text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.chars")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-left text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.skills")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.ni")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.spp")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.cas")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.mvp")}
              </th>
              <th scope="col" className="sticky top-0 z-10 bg-[#12225a] px-2 py-2 text-center text-[10.5px] font-black tracking-[0.04em] uppercase whitespace-nowrap">
                {t("detail.tbl.value")}
              </th>
            </tr>
          </thead>
          <tbody>
            {team.roster.map((entry, index) => {
              const core = progression?.[entry.id];
              const positional = race.positionals.find((p) => p.key === entry.positionalKey);
              const baseCost = positional?.cost ?? 0;
              const bonus = core?.valueBonus ?? 0;
              const dead = core != null && !core.alive;
              const injured = (core?.injuries?.length ?? 0) > 0 && !dead;
              // RAU-12: a lasting-band casualty keeps the player out of the NEXT
              // match — distinct from the dead row (they WILL come back).
              const missNext = core?.missNextMatch ?? false;
              const refs = skillRefs(positional, core?.skills ?? []);
              const nextCost = nextImprovementCost(core?.improvements ?? 0);
              const pe = core?.pe ?? 0;
              const sppPct = Math.min(100, Math.round((pe / nextCost) * 100));
              const sppReady = pe >= nextCost;
              const cas = core?.stats?.casualties ?? 0;
              const mvp = core?.stats?.mvp ?? 0;
              const clickable = interactive && !dead;

              return (
                <tr
                  key={entry.id}
                  data-testid={`roster-row-${entry.id}`}
                  onClick={() => openPlayer(entry, index)}
                  className={`border-b border-[#e2e8f0] ${dead || injured ? "opacity-60" : ""} ${
                    clickable ? "cursor-pointer hover:bg-[#eef2ff]" : ""
                  }`}
                >
                  {canReorder ? (
                    <td className="px-1 py-1.5 text-center align-middle">
                      <div className="flex flex-col items-center gap-0.5">
                        {index > 0 ? (
                          <button
                            type="button"
                            data-testid={`reorder-up-${entry.id}`}
                            aria-label={t("detail.tbl.reorderUp", { name: entry.name })}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePlayer(index, -1);
                            }}
                            className="grid h-5 w-6 place-items-center rounded-sm text-[11px] leading-none text-[#12225a] hover:bg-[#eef2ff]"
                          >
                            ▲
                          </button>
                        ) : null}
                        {index < team.roster.length - 1 ? (
                          <button
                            type="button"
                            data-testid={`reorder-down-${entry.id}`}
                            aria-label={t("detail.tbl.reorderDown", { name: entry.name })}
                            onClick={(e) => {
                              e.stopPropagation();
                              movePlayer(index, 1);
                            }}
                            className="grid h-5 w-6 place-items-center rounded-sm text-[11px] leading-none text-[#12225a] hover:bg-[#eef2ff]"
                          >
                            ▼
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="inline-grid h-[30px] w-[30px] place-items-center rounded-lg bg-[#12225a] text-[12px] font-black text-white"
                      data-testid={`roster-number-${entry.id}`}
                    >
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="inline-grid h-7 w-7 place-items-center rounded-full text-[15px]"
                      data-testid="player-icon"
                    >
                      {iconFor(positional?.role)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-left">
                    <p className="font-bold text-[#1a1a1a]">
                      {entry.name}
                      {dead ? <span className="ml-1">💀</span> : null}
                      {injured ? <span className="ml-1">🏥</span> : null}
                      {missNext ? (
                        <span
                          className="ml-1 rounded bg-[#fef2f2] px-1 py-0.5 align-middle text-[9.5px] font-black tracking-wide text-[#d11938] uppercase"
                          title={t("detail.tbl.missNextMatchTitle")}
                        >
                          {t("detail.tbl.missNextMatch")}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-[#64748b]">{positional?.name ?? t("roster.playerFallback")}</p>
                    <p className="text-[10px] italic text-[#94a3b8]">
                      ({translateRole(positional?.role)}, {race.name})
                    </p>
                  </td>
                  <td className="px-2 py-1.5 text-left whitespace-nowrap">
                    {ATTRIBUTES.map((attr) => {
                      const base = positional
                        ? { ma: positional.ma, st: positional.st, ag: positional.ag, pa: positional.pa, av: positional.av }[attr]
                        : "—";
                      const display = applyAttributeIncreases(attr, base, core?.attributeIncreases?.[attr] ?? 0);
                      const better = display !== String(base) && isAttributeBetter(attr, base, display);
                      const worse = display !== String(base) && !better;
                      return (
                        <span key={attr} className="mr-1.5 inline-grid grid-cols-[16px_26px] items-center gap-1 text-[11.5px]">
                          <b className="font-semibold text-[#64748b]">{attr.toUpperCase()}</b>
                          <span className={`font-bold ${better ? "text-green-600" : worse ? "text-[#d11938]" : "text-[#1a1a1a]"}`}>
                            {better ? "↑" : worse ? "↓" : ""}{display}
                          </span>
                        </span>
                      );
                    })}
                  </td>
                  <td className="px-2 py-1.5 text-left text-[11.5px] leading-[1.55]">
                    {refs.length > 0 ? (
                      refs.map(({ ref, origin, elite }, index) => (
                        <Fragment key={skillKey(ref)}>
                          <span className="whitespace-nowrap">
                            {origin === "bought" ? (
                              <span
                                className={elite ? "font-extrabold text-[#7c2d12]" : "font-semibold text-[#1a1a1a]"}
                                title={elite ? t("prog.elite") : t("detail.tbl.bought")}
                              >
                                {elite ? (
                                  <span data-testid="elite-diamond" aria-hidden="true">
                                    ◆{" "}
                                  </span>
                                ) : null}
                                {skillDisplayName(ref)}
                              </span>
                            ) : (
                              <span className="text-[#1a1a1a]">{skillDisplayName(ref)}</span>
                            )}
                          </span>
                          {index < refs.length - 1 ? ", " : null}
                        </Fragment>
                      ))
                    ) : (
                      <span>{t("detail.tbl.skillNone")}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center" data-testid={`ni-${entry.id}`}>
                    {(core?.injuries?.length ?? 0) > 0 ? (
                      <span className="font-extrabold text-[#f59e0b]" title={t("detail.tbl.injured")}>
                        🩹x{core?.injuries?.length ?? 0}
                      </span>
                    ) : (
                      <span>·</span>
                    )}
                  </td>
                  <td className="min-w-[86px] px-2 py-1.5 text-center">
                    {core ? (
                      <>
                        <span className="font-extrabold" data-testid={`spp-pe-${entry.id}`}>
                          ★{pe}
                        </span>{" "}
                        <span className="text-[10px] text-[#64748b]">/ {nextCost}</span>
                        <div
                          className="relative mt-0.5 h-[6px] w-full overflow-hidden rounded-full bg-[#e2e8f0]"
                          data-testid={`spp-bar-${entry.id}`}
                          data-ready={sppReady}
                        >
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${sppPct}%`,
                              background: sppReady ? "#16a34a" : "#f59e0b",
                            }}
                          />
                          <div
                            className="absolute inset-0"
                            data-testid={`spp-bar-ticks-${entry.id}`}
                            style={{
                              background:
                                "repeating-linear-gradient(to right, transparent 0 calc(25% - 1px), rgba(100,116,139,.85) calc(25% - 1px) 25%)",
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <span>·</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center" data-testid={`cas-${entry.id}`}>
                    {cas > 0 ? cas : <span>·</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center" data-testid={`mvp-${entry.id}`}>
                    {mvp > 0 ? mvp : <span>·</span>}
                  </td>
                  <td className="px-2 py-1.5 text-center whitespace-nowrap">
                    <p className="font-extrabold" data-testid={`player-value-${entry.id}`}>
                      {formatRulebookCost(baseCost + bonus)}
                    </p>
                    {bonus > 0 ? (
                      <p className="text-[10px] text-[#64748b]" data-testid={`value-breakdown-${entry.id}`}>
                        {t("detail.tbl.valueBreakdown", {
                          base: baseCost / 1000,
                          bonus: bonus / 1000,
                        })}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {reorderError ? (
        <p className="mt-2 text-sm text-[#d11938]" data-testid="roster-reorder-error">
          {reorderError}
        </p>
      ) : null}

      {selected ? (
        <PlayerImproveModal
          player={selected}
          raceId={race.id}
          otherNames={otherNames.filter((n) => n !== selected.name)}
          onRename={onRename ? (name) => onRename(selected.rosterPlayerId, name) : undefined}
          onImprove={(body) => onImprove!(selected.rosterPlayerId, body)}
          onFire={onFire ? () => onFire(selected.rosterPlayerId) : undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
