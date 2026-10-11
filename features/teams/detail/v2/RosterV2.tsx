"use client";

import { Fragment, useMemo, useState } from "react";
import type { PlayerProgressionCore, Race, Team } from "../../types";
import { translateRole } from "../../roster-table/RosterTable";
import { formatRulebookCost } from "../../format";
import { computeSpendableBalance } from "../../roster";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { applyAttributeIncreases, isAttributeBetter } from "../characteristics";
import { HirePlayerDialog } from "../HirePlayerDialog";
import { PlayerImproveModal, type ModalPlayer } from "../PlayerImproveModal";
import { skillDisplayName, skillElite, skillKey } from "@/lib/progression";
import type { ImproveBody } from "@/lib/progression";
import { nextImprovementCost } from "@/lib/rules";
import type { PlayerAttribute } from "@/lib/rules/improvements";
import { useI18n } from "@/lib/i18n";

/**
 * RosterV2 — the ui-refresh V2 roster (task 3.1, UIR-2 / UIR-4).
 *
 * Same information as the legacy `TeamRosterTable` (dorsal, name + status
 * markers, posicional, MA/ST/AG/PA/AR chips with increase arrows, skills with
 * bought/élite marks, PE toward the next improvement, NI/CAS/MVP/valor) in a
 * visibly different ledger presentation: a ruled desktop table OR stacked
 * player cards below the `md` breakpoint (`useIsDesktop`), square corners,
 * hairline borders, uppercase micro-labels.
 *
 * Presentation-only: every behavior arrives through props — the same
 * `PlayerImproveModal` / `HirePlayerDialog` legacy mounts, driven by the SAME
 * handler contract. Testids follow the `ui-v2-*` vocabulary ONLY (task 2.1);
 * legacy testid names are never reused.
 */

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

/**
 * Chip labels for the stat row. The approved Stitch brief renders the armor
 * chip as "AR" (Armadura) while the raw attribute code is `av` — legacy table
 * shows the raw code; V2 follows the brief's MA/ST/AG/PA/AR vocabulary.
 */
const ATTRIBUTE_LABELS: Record<PlayerAttribute, string> = {
  ma: "MA",
  st: "ST",
  ag: "AG",
  pa: "PA",
  av: "AR",
};

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
      origin: starting.has(key) ? "default" : "bought",
      elite: skillElite(ref),
    });
  }
  return refs;
}

export interface RosterV2Props {
  team: Team;
  race: Race;
  /** Progression rows keyed by rosterPlayerId; absent = read-only rival view. */
  progression?: Record<string, PlayerProgressionCore>;
  /** Rename-route client; absent = read-only. */
  onRename?: (rosterPlayerId: string, name: string) => Promise<Record<string, unknown>>;
  /** Improve-route client; absent = read-only. */
  onImprove?: (rosterPlayerId: string, body: ImproveBody) => Promise<Record<string, unknown>>;
  /** Reorder-route client (RAU-9); absent = no acciones column. */
  onReorder?: (rosterPlayerIds: string[]) => Promise<Record<string, unknown>>;
  /** Reorder failure surfaced by the caller (shown under the roster). */
  reorderError?: string | null;
  /** Fire-route client (RAU-10); absent = no Despedir in the modal. */
  onFire?: (rosterPlayerId: string) => Promise<Record<string, unknown>>;
  /**
   * Hire-route client (RAU-11). The container passes `undefined` while the
   * "Editar" toggle is off — same dialog, same contract as legacy.
   */
  onHire?: (positionalKey: string) => Promise<Record<string, unknown>>;
}

export function RosterV2({
  team,
  race,
  progression,
  onRename,
  onImprove,
  onReorder,
  reorderError,
  onFire,
  onHire,
}: RosterV2Props) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const [selected, setSelected] = useState<ModalPlayer | null>(null);
  const [hiring, setHiring] = useState(false);

  const interactive = progression != null && onImprove != null;
  const canReorder = interactive && onReorder != null;
  const otherNames = useMemo(() => team.roster.map((entry) => entry.name), [team.roster]);
  // The hire dialog's available balance (same pure helper the legacy view uses).
  const balance = computeSpendableBalance(team, race);

  const rows = team.roster.map((entry, index) => {
    const core = progression?.[entry.id];
    const positional = race.positionals.find((p) => p.key === entry.positionalKey);
    const baseCost = positional?.cost ?? 0;
    const bonus = core?.valueBonus ?? 0;
    const dead = core != null && !core.alive;
    const injuries = core?.injuries?.length ?? 0;
    const injured = injuries > 0 && !dead;
    const missNext = core?.missNextMatch ?? false;
    const refs = skillRefs(positional, core?.skills ?? []);
    const nextCost = nextImprovementCost(core?.improvements ?? 0);
    const pe = core?.pe ?? 0;
    const pct = Math.min(100, Math.round((pe / nextCost) * 100));
    const ready = pe >= nextCost;
    const cas = core?.stats?.casualties ?? 0;
    const mvp = core?.stats?.mvp ?? 0;
    const canOpen = interactive && !dead;
    return {
      entry,
      index,
      core,
      positional,
      baseCost,
      bonus,
      dead,
      injuries,
      injured,
      missNext,
      refs,
      nextCost,
      pe,
      pct,
      ready,
      cas,
      mvp,
      canOpen,
    };
  });

  // RAU-9: swap with the neighbor and hand the FULL new id sequence to the
  // parent's reorder client (the parent applies it optimistically / reverts).
  const movePlayer = (index: number, direction: -1 | 1) => {
    if (!canReorder) return;
    const target = index + direction;
    if (target < 0 || target >= team.roster.length) return;
    const next = [...team.roster];
    [next[index], next[target]] = [next[target], next[index]];
    void onReorder!(next.map((entry) => entry.id));
  };

  const openPlayer = (row: (typeof rows)[number]) => {
    if (!row.canOpen) return;
    const { entry, index, core, positional } = row;
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
      value: (positional?.cost ?? 0) + (core?.valueBonus ?? 0),
      pe: core?.pe ?? 0,
      improvements: core?.improvements ?? 0,
      skills: core?.skills ?? [],
      alive: core?.alive ?? true,
      injuries: core?.injuries ?? [],
      accessPrimary: positional?.accessPrimary ?? [],
      accessSecondary: positional?.accessSecondary ?? [],
    });
  };

  // --- Shared cell fragments (desktop cells / mobile cards render the same) ---

  const statusMarkers = (row: (typeof rows)[number]) => (
    <>
      {row.core == null && (row.entry.pe ?? 0) > 0 ? (
        <span className="text-[10px] font-black text-red">★{row.entry.pe}</span>
      ) : null}
      {row.dead ? <span title={t("detail.tbl.dead")}>💀</span> : null}
      {row.injured ? <span title={t("detail.tbl.injured")}>🏥</span> : null}
      {row.missNext ? (
        <span
          title={t("detail.tbl.missNextMatchTitle")}
          className="border border-ack-review-border bg-ack-review-fill px-1 text-[9px] font-black uppercase text-red"
        >
          {t("detail.tbl.missNextMatch")}
        </span>
      ) : null}
    </>
  );

  const statChips = (row: (typeof rows)[number]) => (
    <span className="flex flex-wrap items-center gap-1">
      {ATTRIBUTES.map((attr) => {
        const base = row.positional
          ? {
              ma: row.positional.ma,
              st: row.positional.st,
              ag: row.positional.ag,
              pa: row.positional.pa,
              av: row.positional.av,
            }[attr]
          : "—";
        const display = applyAttributeIncreases(
          attr,
          base,
          row.core?.attributeIncreases?.[attr] ?? 0,
        );
        const better = display !== String(base) && isAttributeBetter(attr, base, display);
        const worse = display !== String(base) && !better;
        return (
          <span
            key={attr}
            className="inline-flex items-center gap-1 border border-border bg-fill-hover px-1.5 py-0.5"
          >
            <b className="text-[9px] font-bold uppercase tracking-[0.04em] text-slate">
              {ATTRIBUTE_LABELS[attr]}
            </b>
            <span
              className={`text-[11.5px] font-bold tabular-nums ${
                better ? "text-success" : worse ? "text-red" : "text-ink"
              }`}
            >
              {better ? "↑" : worse ? "↓" : ""}
              {display}
            </span>
          </span>
        );
      })}
    </span>
  );

  const skillsLine = (row: (typeof rows)[number]) =>
    row.refs.length > 0 ? (
      row.refs.map(({ ref, origin, elite }, i) => (
        <Fragment key={skillKey(ref)}>
          <span className="whitespace-nowrap">
            {origin === "bought" ? (
              <span
                className={elite ? "font-extrabold text-red" : "font-semibold text-ink"}
                title={elite ? t("prog.elite") : t("detail.tbl.bought")}
              >
                {elite ? <span aria-hidden="true">◆ </span> : null}
                {skillDisplayName(ref)}
              </span>
            ) : (
              <span className="text-ink">{skillDisplayName(ref)}</span>
            )}
          </span>
          {i < row.refs.length - 1 ? ", " : null}
        </Fragment>
      ))
    ) : (
      <span>{t("detail.tbl.skillNone")}</span>
    );

  /** PE star + next-cost + progress bar (+ the upgrade affordance). */
  const peCell = (row: (typeof rows)[number], opts: { alwaysShowImprove: boolean }) => (
    <span className="flex flex-col items-center gap-1">
      {row.core ? (
        <>
          <span
            data-testid={`ui-v2-pe-${row.entry.id}`}
            className="text-[12px] font-bold text-star"
          >
            ★{row.pe}
            <span className="ml-1 text-[10px] font-normal text-slate">/ {row.nextCost}</span>
          </span>
          <span
            className="relative block h-[5px] w-14 overflow-hidden border border-border bg-fill-hover"
            data-testid={`ui-v2-pe-bar-${row.entry.id}`}
            data-ready={row.ready}
          >
            <span
              className={`absolute inset-y-0 left-0 ${row.ready ? "bg-success" : "bg-warning-deep"}`}
              style={{ width: `${row.pct}%` }}
            />
          </span>
        </>
      ) : (
        <span className="text-[12px] text-slate">
          {(row.entry.pe ?? 0) > 0 ? (
            <span data-testid={`ui-v2-pe-${row.entry.id}`} className="font-bold text-star">
              ★{row.entry.pe}
            </span>
          ) : (
            "·"
          )}
        </span>
      )}
      {row.canOpen ? (
        <button
          type="button"
          data-testid={`ui-v2-improve-${row.entry.id}`}
          aria-label={t("detail.modal.aria", { name: row.entry.name })}
          onClick={(e) => {
            e.stopPropagation();
            openPlayer(row);
          }}
          className={`border border-border bg-panel px-2 py-0.5 text-[11px] font-bold leading-none text-navy hover:bg-fill-hover focus-visible:opacity-100 ${
            opts.alwaysShowImprove ? "opacity-100" : "opacity-0 transition group-hover:opacity-100"
          }`}
        >
          +★
        </button>
      ) : null}
    </span>
  );

  const reorderButtons = (row: (typeof rows)[number]) => {
    if (!canReorder) return null;
    return (
      <>
        {row.index > 0 ? (
          <button
            type="button"
            data-testid={`ui-v2-reorder-up-${row.entry.id}`}
            aria-label={t("detail.tbl.reorderUp", { name: row.entry.name })}
            onClick={(e) => {
              e.stopPropagation();
              movePlayer(row.index, -1);
            }}
            className="grid h-6 w-6 place-items-center border border-border bg-panel text-[10px] leading-none text-navy hover:bg-fill-hover"
          >
            ▲
          </button>
        ) : null}
        {row.index < team.roster.length - 1 ? (
          <button
            type="button"
            data-testid={`ui-v2-reorder-down-${row.entry.id}`}
            aria-label={t("detail.tbl.reorderDown", { name: row.entry.name })}
            onClick={(e) => {
              e.stopPropagation();
              movePlayer(row.index, 1);
            }}
            className="grid h-6 w-6 place-items-center border border-border bg-panel text-[10px] leading-none text-navy hover:bg-fill-hover"
          >
            ▼
          </button>
        ) : null}
      </>
    );
  };

  const metaLine = (row: (typeof rows)[number]) => (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate">
      <span data-testid={`ui-v2-ni-${row.entry.id}`}>
        {t("detail.tbl.ni")}{" "}
        {row.injuries > 0 ? (
          <b className="font-extrabold text-warning-deep">🩹x{row.injuries}</b>
        ) : (
          "·"
        )}
      </span>
      <span>
        {t("detail.tbl.cas")}{" "}
        <b
          data-testid={`ui-v2-cas-${row.entry.id}`}
          className="font-bold tabular-nums text-ink"
        >
          {row.cas > 0 ? row.cas : "·"}
        </b>
      </span>
      <span>
        {t("detail.tbl.mvp")}{" "}
        <b
          data-testid={`ui-v2-mvp-${row.entry.id}`}
          className="font-bold tabular-nums text-ink"
        >
          {row.mvp > 0 ? row.mvp : "·"}
        </b>
      </span>
      <span>
        {t("detail.tbl.value")}{" "}
        <b
          data-testid={`ui-v2-value-${row.entry.id}`}
          className="font-bold tabular-nums text-ink"
        >
          {formatRulebookCost(row.baseCost + row.bonus)}
        </b>
        {row.bonus > 0 ? (
          <span
            data-testid={`ui-v2-value-breakdown-${row.entry.id}`}
            className="ml-1 text-[10px]"
          >
            {t("detail.tbl.valueBreakdown", {
              base: row.baseCost / 1000,
              bonus: row.bonus / 1000,
            })}
          </span>
        ) : null}
      </span>
    </span>
  );

  // --- Section chrome -------------------------------------------------------

  const rosterHeader = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-navy px-4 py-3">
      <h2
        id="ui-v2-roster-heading"
        className="font-display text-[17px] font-semibold text-navy"
      >
        {t("detail.plantilla")}
      </h2>
      <div className="flex items-center gap-2">
        <span className="border border-navy bg-navy px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
          {team.roster.length}
        </span>
        {onHire ? (
          <button
            type="button"
            data-testid="ui-v2-hire"
            onClick={() => setHiring(true)}
            className="border border-navy bg-navy px-3 py-1 text-[12px] font-bold uppercase tracking-[0.04em] text-white hover:bg-navy-hover"
          >
            {t("detail.hire")}
          </button>
        ) : null}
      </div>
    </div>
  );

  const desktopTable = (
    <div className="overflow-x-auto">
      <table
        className="w-full min-w-[920px] border-collapse text-[12.5px]"
        data-testid="ui-v2-roster-table"
      >
        <thead>
          <tr className="border-b-2 border-navy bg-fill-hover text-[10.5px] font-bold uppercase tracking-[0.06em] text-slate">
            <th scope="col" className="px-2 py-2 text-center">
              #
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              {t("detail.modal.name")}
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              Posicional
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              {t("detail.tbl.chars")}
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              {t("detail.tbl.skills")}
            </th>
            <th scope="col" className="px-2 py-2 text-center">
              PE
            </th>
            <th scope="col" className="px-2 py-2 text-center">
              {t("detail.tbl.ni")}
            </th>
            <th scope="col" className="px-2 py-2 text-center">
              {t("detail.tbl.cas")}
            </th>
            <th scope="col" className="px-2 py-2 text-center">
              {t("detail.tbl.mvp")}
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              {t("detail.tbl.value")}
            </th>
            {canReorder ? (
              <th scope="col" className="px-2 py-2 text-center">
                Acciones
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.entry.id}
              data-testid={`ui-v2-roster-row-${row.entry.id}`}
              onClick={() => openPlayer(row)}
              className={`group border-b border-border ${
                row.dead || row.injured ? "opacity-60" : ""
              } ${row.canOpen ? "cursor-pointer hover:bg-fill-hover" : ""}`}
            >
              {/* Dorsal */}
              <td className="px-2 py-2 text-center">
                <span className="inline-grid h-7 w-7 place-items-center border border-navy bg-navy text-[12px] font-bold text-white">
                  {row.index + 1}
                </span>
              </td>
              {/* Nombre */}
              <td className="px-2 py-2 text-left">
                <p className="flex items-center gap-1 font-semibold text-ink">
                  <span aria-hidden="true">{iconFor(row.positional?.role)}</span>
                  <span className="truncate">{row.entry.name}</span>
                  {statusMarkers(row)}
                </p>
              </td>
              {/* Posicional */}
              <td className="px-2 py-2 text-left">
                <p className="text-[12.5px] text-navy">
                  {row.positional?.name ?? t("roster.playerFallback")}
                </p>
                <p className="text-[10.5px] italic text-slate">
                  ({translateRole(row.positional?.role)}, {race.name})
                </p>
              </td>
              {/* Características */}
              <td className="px-2 py-2 text-left whitespace-nowrap">{statChips(row)}</td>
              {/* Habilidades */}
              <td className="px-2 py-2 text-left text-[11.5px] leading-[1.55]">
                {skillsLine(row)}
              </td>
              {/* PE */}
              <td className="px-2 py-2 text-center">{peCell(row, { alwaysShowImprove: false })}</td>
              {/* NI / CAS / MVP / Valor */}
              <td
                data-testid={`ui-v2-ni-${row.entry.id}`}
                className="px-2 py-2 text-center whitespace-nowrap"
              >
                {row.injuries > 0 ? (
                  <b
                    className="font-extrabold text-warning-deep"
                    title={t("detail.tbl.injured")}
                  >
                    🩹x{row.injuries}
                  </b>
                ) : (
                  <span className="text-slate">·</span>
                )}
              </td>
              <td
                data-testid={`ui-v2-cas-${row.entry.id}`}
                className="px-2 py-2 text-center font-bold tabular-nums"
              >
                {row.cas > 0 ? row.cas : <span className="font-normal text-slate">·</span>}
              </td>
              <td
                data-testid={`ui-v2-mvp-${row.entry.id}`}
                className="px-2 py-2 text-center font-bold tabular-nums"
              >
                {row.mvp > 0 ? row.mvp : <span className="font-normal text-slate">·</span>}
              </td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <p
                  data-testid={`ui-v2-value-${row.entry.id}`}
                  className="font-bold tabular-nums text-ink"
                >
                  {formatRulebookCost(row.baseCost + row.bonus)}
                </p>
                {row.bonus > 0 ? (
                  <p
                    data-testid={`ui-v2-value-breakdown-${row.entry.id}`}
                    className="text-[10px] text-slate"
                  >
                    {t("detail.tbl.valueBreakdown", {
                      base: row.baseCost / 1000,
                      bonus: row.bonus / 1000,
                    })}
                  </p>
                ) : null}
              </td>
              {canReorder ? (
                <td className="px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {reorderButtons(row)}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const mobileCards = (
    <ul className="flex flex-col gap-2 p-3">
      {rows.map((row) => (
        <li
          key={row.entry.id}
          data-testid={`ui-v2-roster-card-${row.entry.id}`}
          className={`border border-border bg-panel ${row.dead || row.injured ? "opacity-60" : ""} ${
            row.canOpen ? "cursor-pointer" : ""
          }`}
          onClick={() => openPlayer(row)}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-grid h-7 w-7 shrink-0 place-items-center border border-navy bg-navy text-[12px] font-bold text-white">
                {row.index + 1}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-[13.5px] font-semibold text-ink">
                  <span aria-hidden="true">{iconFor(row.positional?.role)}</span>
                  <span className="truncate">{row.entry.name}</span>
                  {statusMarkers(row)}
                </p>
                <p className="truncate text-[12px] text-navy">
                  {row.positional?.name ?? t("roster.playerFallback")}
                </p>
                <p className="truncate text-[10.5px] italic text-slate">
                  ({translateRole(row.positional?.role)}, {race.name})
                </p>
              </div>
            </div>
            {peCell(row, { alwaysShowImprove: true })}
          </div>
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
            {statChips(row)}
          </div>
          <div className="border-b border-border px-3 py-2 text-[11.5px] leading-[1.55]">
            {skillsLine(row)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            {metaLine(row)}
            {canReorder ? (
              <span className="flex items-center gap-1">{reorderButtons(row)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <section
        data-testid="ui-v2-roster"
        aria-labelledby="ui-v2-roster-heading"
        className="border border-border bg-panel"
      >
        {rosterHeader}
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-slate" data-testid="ui-v2-roster-empty">
            {t("roster.empty")}
          </p>
        ) : isDesktop ? (
          desktopTable
        ) : (
          mobileCards
        )}
        {reorderError ? (
          <p className="border-t border-border px-4 py-2 text-sm text-red" data-testid="ui-v2-reorder-error">
            {reorderError}
          </p>
        ) : null}
      </section>

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

      {hiring && onHire ? (
        <HirePlayerDialog
          race={race}
          roster={team.roster}
          balance={balance}
          onHire={onHire}
          onClose={() => setHiring(false)}
        />
      ) : null}
    </>
  );
}
