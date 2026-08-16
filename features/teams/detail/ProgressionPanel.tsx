"use client";

import { useState } from "react";
import { SKILLS } from "@/features/teams/data/skills";
import { accessLetterForCategory, skillDisplayName, skillElite, skillKey } from "@/lib/progression";
import type { ImproveBody, PlayerProgression } from "@/lib/progression";
import type { PlayerAttribute } from "@/lib/rules/improvements";
import type { SkillColumn } from "@/lib/rules/skills";
import { formatRulebookCost } from "@/features/teams/format";
import { useI18n } from "@/lib/i18n";

const RANDOM_CATEGORY_KEYS: Record<SkillColumn, string> = {
  A: "prog.category.A",
  F: "prog.category.F",
  G: "prog.category.G",
  M: "prog.category.M",
  P: "prog.category.P",
  T: "prog.category.T",
};

const ATTRIBUTE_KEYS: Record<PlayerAttribute, string> = {
  ma: "prog.attr.ma",
  st: "prog.attr.st",
  ag: "prog.attr.ag",
  pa: "prog.attr.pa",
  av: "prog.attr.av",
};

const DEFAULT_ACCESS = ["G", "A", "F", "M", "P", "T"] as SkillColumn[];

export interface ProgressionPanelProps {
  player: PlayerProgression;
  /**
   * Fires the improve request (route-backed). Resolves with the endpoint JSON
   * (success: `peRemaining`/`skill`/`candidates`; failure: `{ error }`). The
   * panel surfaces `error` verbatim and shows the returned `peRemaining`.
   */
  onImprove: (body: ImproveBody) => Promise<Record<string, unknown>>;
}

/** Filters the shared catalog to skills the positional may buy for a letter. */
function pickableSkills(accessLetters: string[], ownedKeys: Set<string>) {
  return SKILLS.filter((skill) => {
    const letter = accessLetterForCategory(skill.category);
    if (letter === null || !accessLetters.includes(letter)) return false;
    return !ownedKeys.has(skillKey(skill.id));
  });
}

/**
 * ProgressionPanel — per-player PE spending UI (Spanish league-section copy).
 * Shows the player's PE, improvement count and value bonus, lists acquired
 * skills (élite skills carry a `$` badge + "Élite" tooltip per REQ-RACE-08), and
 * offers the BB2025 Mejorar flows: random roll per accessible category (candidate
 * pick), direct primary/secondary picks from the positional's access letters,
 * and the 1D8 attribute improvement. The server owns ALL dice.
 */
export function ProgressionPanel({ player, onImprove }: ProgressionPanelProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pe, setPe] = useState(player.pe);
  const [pendingCategory, setPendingCategory] = useState<SkillColumn | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [pendingRoll, setPendingRoll] = useState(false);
  const { t } = useI18n();

  const accessibleLetters = [
    ...new Set([...player.accessPrimary, ...player.accessSecondary]),
  ] as SkillColumn[];

  const ownedKeys = new Set(player.skills.map(skillKey));
  const primarySkills = pickableSkills(player.accessPrimary, ownedKeys);
  const secondarySkills = pickableSkills(player.accessSecondary, ownedKeys);

  async function run(body: ImproveBody): Promise<Record<string, unknown>> {
    setBusy(true);
    setError(null);
    const res = await onImprove(body);
    if (typeof res.error === "string") {
      setError(res.error);
    } else if (typeof res.peRemaining === "number") {
      setPe(res.peRemaining);
    }
    setBusy(false);
    return res;
  }

  async function startRoll(category: SkillColumn) {
    const res = await run({ type: "random-roll", category });
    const list = (res.candidates ?? []) as unknown[];
    const names = list.filter((c): c is string => typeof c === "string");
    setPendingCategory(category);
    setCandidates(names);
    setPendingRoll(names.length > 0);
  }

  return (
    <div className="rounded border border-[#e2e8f0] bg-[#f8fafc] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-[#12225a]">{player.name}</p>
          <p className="text-[12px] text-[#64748b]">
            {t("prog.pe")} <span data-testid={`pe-${player.rosterPlayerId}`}>{pe}</span>
            {" · "}{t("prog.improvements")}{" "}
            <span data-testid={`improvements-${player.rosterPlayerId}`}>{player.improvements}</span>
            {" · "}{t("prog.value")}{" "}
            <span data-testid={`value-${player.rosterPlayerId}`}>
              {formatRulebookCost(player.valueBonus)}
            </span>
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded bg-[#12225a] px-3 py-1 text-[12px] font-bold text-white"
          >
            {t("prog.improve")}
          </button>
        )}
      </div>

      {/* Acquired skills with élite badge */}
      <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="acquired-skills">
        {player.skills.map((ref) => {
          const display = skillDisplayName(ref);
          const elite = skillElite(ref);
          return (
            <li
              key={ref}
              data-testid={`skill-${ref}`}
              title={elite ? t("prog.elite") : undefined}
              className={`rounded px-2 py-0.5 text-[12px] ${elite ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#e2e8f0] text-[#334155]"}`}
            >
              {display}
              {elite && <span data-testid="elite-badge" className="ml-1 font-black">$</span>}
            </li>
          );
        })}
      </ul>

      {open && (
        <div className="mt-3 space-y-3 border-t border-[#e2e8f0] pt-3">
          {/* Random roll per accessible category */}
          <div>
            <p className="text-[12px] font-semibold text-[#12225a]">{t("prog.randomRoll")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(accessibleLetters.length ? accessibleLetters : DEFAULT_ACCESS).map((letter) => (
                <button
                  key={letter}
                  type="button"
                  disabled={busy}
                  onClick={() => startRoll(letter)}
                  className="rounded border border-[#cbd5e1] px-2 py-1 text-[12px] font-medium text-[#334155] disabled:opacity-50"
                >
                  {t("prog.rollOn", { category: t(RANDOM_CATEGORY_KEYS[letter]) })}
                </button>
              ))}
            </div>
            {pendingRoll && pendingCategory && candidates.length > 0 && (
              <div className="mt-2">
                <p className="text-[12px] text-[#64748b]">
                  {t("prog.pickOne", { category: t(RANDOM_CATEGORY_KEYS[pendingCategory]) })}
                </p>
                <div className="mt-1 flex gap-2">
                  {candidates.map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        void run({ type: "random-pick", selectedSkill: candidate });
                        setPendingRoll(false);
                      }}
                      className="rounded bg-[#d11938] px-2 py-1 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {candidate}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Direct primary pick */}
          {primarySkills.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor={`primary-${player.rosterPlayerId}`} className="text-[12px] font-semibold text-[#12225a]">
                {t("prog.primary")}
              </label>
              <select
                id={`primary-${player.rosterPlayerId}`}
                aria-label={t("prog.primary")}
                className="rounded border border-[#cbd5e1] px-2 py-1 text-[12px]"
              >
                {primarySkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skillDisplayName(skill.id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  const select = (e.currentTarget.closest("div") as HTMLElement).querySelector(
                    "select",
                  ) as HTMLSelectElement;
                  void run({ type: "primary", skillId: select.value });
                }}
                className="rounded bg-[#12225a] px-2 py-1 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {t("prog.buyPrimary")}
              </button>
            </div>
          )}

          {/* Direct secondary pick */}
          {secondarySkills.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor={`secondary-${player.rosterPlayerId}`} className="text-[12px] font-semibold text-[#12225a]">
                {t("prog.secondary")}
              </label>
              <select
                id={`secondary-${player.rosterPlayerId}`}
                aria-label={t("prog.secondary")}
                className="rounded border border-[#cbd5e1] px-2 py-1 text-[12px]"
              >
                {secondarySkills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skillDisplayName(skill.id)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => {
                  const select = (e.currentTarget.closest("div") as HTMLElement).querySelector(
                    "select",
                  ) as HTMLSelectElement;
                  void run({ type: "secondary", skillId: select.value });
                }}
                className="rounded bg-[#12225a] px-2 py-1 text-[12px] font-bold text-white disabled:opacity-50"
              >
                {t("prog.buySecondary")}
              </button>
            </div>
          )}

          {/* Attribute */}
          <div>
            <p className="text-[12px] font-semibold text-[#12225a]">{t("prog.attribute")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(ATTRIBUTE_KEYS) as PlayerAttribute[]).map((attr) => (
                <button
                  key={attr}
                  type="button"
                  disabled={busy}
                  onClick={() => run({ type: "attribute", attribute: attr })}
                  className="rounded border border-[#cbd5e1] px-2 py-1 text-[12px] font-medium text-[#334155] disabled:opacity-50"
                >
                  {t("prog.attributeButton", { attribute: t(ATTRIBUTE_KEYS[attr]) })}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[12px] font-medium text-[#d11938]">
              {error}
            </p>
          )}

          {!busy && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[12px] text-[#64748b] underline"
            >
              {t("prog.close")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
