"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatRulebookCost } from "../format";
import { randomPlayerName } from "../data/playerNames";
import { pickableSkills, skillDisplayName, skillKey } from "@/lib/progression";
import type { ImproveBody } from "@/lib/progression";
import { improvementCost, PE_MVP, PLAYER_ATTRIBUTES } from "@/lib/rules";
import type { PlayerAttribute } from "@/lib/rules/improvements";
import type { SkillColumn } from "@/lib/rules/skills";
import { useI18n } from "@/lib/i18n";
import {
  applyAttributeIncreases,
  type BaseAttributeValue,
} from "./characteristics";

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

/** Fallback access letters when the positional declares none (default table). */
const DEFAULT_ACCESS = ["G", "A", "F", "M", "P", "T"] as SkillColumn[];

/** The modal's progress-bar target: 4 × PE_MVP (markers at ★4/★8/★12/★16). */
const PROGRESS_MAX = PE_MVP * 4;

/** The player snapshot the roster table feeds into the improve modal. */
export interface ModalPlayer {
  rosterPlayerId: string;
  /** Dorsal shown in the table (roster order, display-only in the modal). */
  number: number;
  name: string;
  icon: string;
  positionalName: string;
  role: string;
  raceName: string;
  baseAttributes: Record<PlayerAttribute, BaseAttributeValue>;
  attributeIncreases: Partial<Record<PlayerAttribute, number>>;
  /** Base positional cost + value bonus from acquired skills. */
  value: number;
  pe: number;
  improvements: number;
  skills: string[];
  alive: boolean;
  injuries: string[];
  accessPrimary: string[];
  accessSecondary: string[];
}

export interface PlayerImproveModalProps {
  player: ModalPlayer;
  /** Race id for the 🎲 random-name bank. */
  raceId: string;
  /** Names of the OTHER roster players, so a roll never repeats a name. */
  otherNames: string[];
  /** Optional: absent = name stays read-only (read-only rival view never opens the modal). */
  onRename?: (name: string) => Promise<Record<string, unknown>>;
  onImprove: (body: ImproveBody) => Promise<Record<string, unknown>>;
  /** Fire-route client (RAU-10); absent = no Despedir action. Bound to THIS player. */
  onFire?: () => Promise<Record<string, unknown>>;
  onClose: () => void;
}

type UpgradeSelection =
  | ""
  | "attribute"
  | "random"
  | `primary:${string}`
  | `secondary:${string}`;

/**
 * PlayerImproveModal — square, compact PE-spending modal opened from the team
 * detail roster (RAU-46, TourPlay-style). Shows the player's Nº (display-only:
 * the dorsal follows the roster order) and an editable Nombre with a 🎲
 * random-name re-roll, the PE progress bar, and — when the player can pay the
 * next improvement — a "Nuevo skill / característica" select with skill picks
 * grouped by access (Primario/Secundario), a Característica option driving the
 * five attribute selects, and an Aleatorio roll. All costs come from the real
 * improvement cost table; the server owns the dice.
 */
export function PlayerImproveModal({
  player,
  raceId,
  otherNames,
  onRename,
  onImprove,
  onFire,
  onClose,
}: PlayerImproveModalProps) {
  const { t } = useI18n();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(player.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<UpgradeSelection>("");
  const [randomCategory, setRandomCategory] = useState<SkillColumn | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [attrPlus, setAttrPlus] = useState<Partial<Record<PlayerAttribute, boolean>>>({});
  const [confirmingFire, setConfirmingFire] = useState(false);
  // Guards the backdrop-close against a click whose mousedown started on an
  // inner control that was re-rendered away mid-click (React retargets the
  // click to the overlay, which would otherwise read as a backdrop click and
  // close the modal while the owner is still interacting with it).
  const pointerDownOnBackdrop = useRef(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accessibleLetters = useMemo(
    () => [...new Set([...player.accessPrimary, ...player.accessSecondary])] as SkillColumn[],
    [player.accessPrimary, player.accessSecondary],
  );

  const next = player.improvements + 1;
  const randomCost = improvementCost(next, "random");
  const primaryCost = improvementCost(next, "primary");
  const secondaryCost = improvementCost(next, "secondary");
  const attributeCost = improvementCost(next, "attribute");
  const minCost = randomCost;
  const canUpgrade = player.pe >= minCost;

  const ownedKeys = useMemo(() => new Set(player.skills.map(skillKey)), [player.skills]);
  const primarySkills = pickableSkills(player.accessPrimary, ownedKeys).filter(
    () => player.pe >= primaryCost,
  );
  const secondarySkills = pickableSkills(player.accessSecondary, ownedKeys).filter(
    () => player.pe >= secondaryCost,
  );

  const pendingAttribute = PLAYER_ATTRIBUTES.find((attr) => attrPlus[attr]) ?? null;

  const progressPct = Math.min(100, Math.round((player.pe / PROGRESS_MAX) * 100));

  function rollName() {
    const used = new Set(otherNames);
    setName(randomPlayerName(raceId, used));
  }

  async function run(body: ImproveBody): Promise<Record<string, unknown>> {
    setBusy(true);
    setError(null);
    const res = await onImprove(body);
    if (typeof res.error === "string") {
      setError(res.error);
    }
    setBusy(false);
    return res;
  }

  async function pickCandidate(skill: string) {
    const res = await run({ type: "random-pick", selectedSkill: skill });
    if (typeof res.error !== "string" && typeof res.peRemaining === "number") {
      onClose();
    }
  }

  async function handleAccept() {
    setBusy(true);
    setError(null);

    // 1. Persist a changed name (a rename error blocks the improvement).
    if (onRename && name.trim() !== player.name) {
      const renamed = await onRename(name.trim());
      if (typeof renamed.error === "string") {
        setError(renamed.error);
        setBusy(false);
        return;
      }
    }

    // 2. Spend the selected improvement.
    if (selection.startsWith("primary:") || selection.startsWith("secondary:")) {
      const [kind, skillId] = selection.split(":");
      const res = await run(
        kind === "primary"
          ? { type: "primary", skillId }
          : { type: "secondary", skillId },
      );
      if (typeof res.error !== "string" && typeof res.peRemaining === "number") {
        onClose();
        return;
      }
    } else if (selection === "attribute" && pendingAttribute) {
      const res = await run({ type: "attribute", attribute: pendingAttribute });
      if (typeof res.error !== "string" && typeof res.peRemaining === "number") {
        onClose();
        return;
      }
    } else if (selection === "random") {
      const category = randomCategory ?? accessibleLetters[0] ?? DEFAULT_ACCESS[0];
      const res = await run({ type: "random-roll", category });
      if (typeof res.error === "string") {
        setBusy(false);
        return;
      }
      const list = Array.isArray(res.candidates)
        ? res.candidates.filter((c): c is string => typeof c === "string")
        : [];
      setCandidates(list);
      setRandomCategory(category);
    } else {
      // No improvement selected — a successful rename (or nothing) closes.
      setBusy(false);
      onClose();
      return;
    }
    setBusy(false);
  }

  async function handleFire() {
    if (!onFire) return;
    setBusy(true);
    setError(null);
    const res = await onFire();
    if (typeof res.error === "string") {
      setError(res.error);
      setConfirmingFire(false);
      setBusy(false);
      return;
    }
    onClose();
  }

  const primaryAccessLabel = player.accessPrimary.join(" · ");
  const secondaryAccessLabel = player.accessSecondary.join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/55 p-4"
      onMouseDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        pointerDownOnBackdrop.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("detail.modal.aria", { name: player.name })}
        data-testid="improve-modal"
        className="w-full max-w-[640px] overflow-hidden bg-white text-[#1a1a1a] shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
      >
        <header className="relative flex items-center gap-3 bg-[#12225a] py-3.5 pr-14 pl-4 text-white">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 text-[15px]">
            {player.icon}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-bold leading-tight">{player.name}</h3>
            <p className="text-[12px] text-[#cbd5e1]">
              {player.positionalName} · ({player.role}, {player.raceName})
            </p>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <p className="text-[17px] font-black tabular-nums">{formatRulebookCost(player.value)}</p>
            <p className="text-[12px] text-[#fde68a]" data-testid="modal-pe-label">
              {t("detail.modal.peAvailable", { count: player.pe })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("detail.modal.close")}
            onClick={onClose}
            className="absolute top-3 right-3 z-10 grid h-7 w-7 place-items-center rounded text-[20px] leading-none text-white hover:bg-white/10"
          >
            ×
          </button>
        </header>

        <div className="p-4">
          <div className="flex flex-wrap gap-2.5">
            <div className="min-w-[90px] flex-1">
              <label className="mb-1 block text-[11px] font-bold tracking-[0.04em] text-[#64748b] uppercase">
                {t("detail.modal.number")}
              </label>
              <span
                title={t("detail.modal.numberTitle")}
                data-testid="modal-number"
                className="block w-full rounded border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-[13.5px] font-bold text-[#94a3b8]"
              >
                {player.number}
              </span>
            </div>
            <div className="min-w-[180px] flex-[2]">
              <label className="mb-1 block text-[11px] font-bold tracking-[0.04em] text-[#64748b] uppercase">
                {t("detail.modal.name")}
              </label>
              <div className="flex gap-1.5">
                <input
                  ref={nameRef}
                  value={name}
                  disabled={!onRename}
                  maxLength={50}
                  onChange={(e) => setName(e.target.value)}
                  aria-label={t("detail.modal.name")}
                  className="min-w-0 flex-1 rounded border border-[#e2e8f0] px-3 py-2 text-[13.5px] outline-none focus:border-[#12225a] disabled:opacity-60"
                />
                {onRename ? (
                  <button
                    type="button"
                    title={t("create.rollName")}
                    aria-label={t("create.rollName")}
                    onClick={rollName}
                    className="shrink-0 rounded bg-[#12225a] px-3 text-white"
                  >
                    🎲
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-[#e2e8f0] pt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[12.5px] font-bold text-[#12225a]">{t("detail.modal.experienced")}</h4>
              {canUpgrade ? (
                <span
                  className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11.5px] font-black text-[#166534]"
                  data-testid="modal-pe-badge"
                >
                  {t("detail.modal.peAvailable", { count: player.pe })}
                </span>
              ) : null}
            </div>
            <div className="mt-2" data-testid="modal-progress">
              <div className="relative h-[8px] w-full overflow-hidden rounded-full bg-[#e2e8f0]">
                <div
                  className="absolute inset-y-0 left-0 bg-[#16a34a]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-bold text-[#64748b]">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n}>★{n * PE_MVP}</span>
                ))}
              </div>
            </div>
          </div>

          {canUpgrade ? (
            <>
              <div className="mt-3 border-t border-[#e2e8f0] pt-3">
                <h4 className="mb-1.5 text-[12.5px] font-bold text-[#12225a]">{t("detail.modal.newUpgrade")}</h4>
                <select
                  value={selection}
                  aria-label={t("detail.modal.newUpgrade")}
                  data-testid="upgrade-select"
                  onChange={(e) => setSelection(e.target.value as UpgradeSelection)}
                  className="w-full rounded border border-[#e2e8f0] px-2 py-2 text-[13px]"
                >
                  <option value="">{t("detail.modal.choose")}</option>
                  {primarySkills.length > 0 ? (
                    <optgroup label={t("detail.modal.primaryGroup", { access: primaryAccessLabel, cost: primaryCost })}>
                      {primarySkills.map((skill) => (
                        <option key={`primary:${skill.id}`} value={`primary:${skill.id}`}>
                          {skillDisplayName(skill.id)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {secondarySkills.length > 0 ? (
                    <optgroup label={t("detail.modal.secondaryGroup", { access: secondaryAccessLabel, cost: secondaryCost })}>
                      {secondarySkills.map((skill) => (
                        <option key={`secondary:${skill.id}`} value={`secondary:${skill.id}`}>
                          {skillDisplayName(skill.id)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {player.pe >= attributeCost ? (
                    <optgroup label={t("detail.modal.attributeGroup", { cost: attributeCost })}>
                      <option value="attribute">
                        {t("detail.modal.attributeGroup", { cost: attributeCost })}
                      </option>
                    </optgroup>
                  ) : null}
                  {player.pe >= randomCost ? (
                    <optgroup label={t("detail.modal.randomGroup", { cost: randomCost })}>
                      <option value="random">
                        {t("detail.modal.randomGroup", { cost: randomCost })}
                      </option>
                    </optgroup>
                  ) : null}
                </select>

                {selection === "random" ? (
                  <div className="mt-2">
                    <label className="mb-1 block text-[11px] font-bold tracking-[0.04em] text-[#64748b] uppercase">
                      {t("detail.modal.randomCategory", { cost: randomCost })}
                    </label>
                    <select
                      value={randomCategory ?? (accessibleLetters[0] ?? DEFAULT_ACCESS[0])}
                      aria-label={t("detail.modal.randomCategory", { cost: randomCost })}
                      data-testid="random-category-select"
                      onChange={(e) => setRandomCategory(e.target.value as SkillColumn)}
                      className="w-full rounded border border-[#e2e8f0] px-2 py-2 text-[13px]"
                    >
                      {(accessibleLetters.length ? accessibleLetters : DEFAULT_ACCESS).map((letter) => (
                        <option key={letter} value={letter}>
                          {t(RANDOM_CATEGORY_KEYS[letter])}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {candidates.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-[12px] text-[#64748b]">
                      {t("prog.pickOne", {
                        category: t(RANDOM_CATEGORY_KEYS[randomCategory ?? (accessibleLetters[0] ?? "G")]),
                      })}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {candidates.map((candidate) => (
                        <button
                          key={candidate}
                          type="button"
                          disabled={busy}
                          onClick={() => void pickCandidate(candidate)}
                          className="rounded bg-[#d11938] px-2 py-1 text-[12px] font-bold text-white disabled:opacity-50"
                        >
                          {candidate}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 border-t border-[#e2e8f0] pt-3">
                <h4 className="mb-1.5 text-[12.5px] font-bold text-[#12225a]">{t("detail.modal.attributes")}</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {PLAYER_ATTRIBUTES.map((attr) => {
                    const increases = player.attributeIncreases[attr] ?? 0;
                    const current = applyAttributeIncreases(attr, player.baseAttributes[attr], increases);
                    const next = applyAttributeIncreases(attr, player.baseAttributes[attr], increases + 1);
                    return (
                      <div key={attr} className="rounded border border-[#e2e8f0] p-1.5 text-center">
                        <label className="block text-[11px] font-bold text-[#64748b]">
                          {t(ATTRIBUTE_KEYS[attr])}
                        </label>
                        <select
                          value={attrPlus[attr] ? "plus" : "current"}
                          aria-label={t(ATTRIBUTE_KEYS[attr])}
                          data-testid={`attr-select-${attr}`}
                          onChange={(e) => {
                            const plus = e.target.value === "plus";
                            setAttrPlus((prev) => ({ ...prev, [attr]: plus }));
                            if (plus) setSelection("attribute");
                          }}
                          className="mt-1 w-full rounded border border-[#e2e8f0] px-1 py-1.5 text-center text-[13px] font-bold"
                        >
                          <option value="current">{current}</option>
                          {player.pe >= attributeCost ? (
                            <option value="plus">
                              {next} ({t("detail.modal.plus")})
                            </option>
                          ) : null}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p
              className="mt-3 border-t border-[#e2e8f0] pt-3 text-[12.5px] text-[#64748b]"
              data-testid="modal-no-pe"
            >
              {t("detail.modal.noPe")}
            </p>
          )}

          {error ? (
            <p role="alert" className="mt-2 text-[12px] font-medium text-[#d11938]">
              {error}
            </p>
          ) : null}

          {confirmingFire ? (
            <div className="mt-4 border-t border-[#e2e8f0] pt-3.5">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">
                {t("detail.modal.fireConfirmTitle", { name: player.name })}
              </p>
              <p className="mt-0.5 text-[12px] text-[#64748b]">{t("detail.modal.fireConfirmBody")}</p>
              <div className="mt-3 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingFire(false)}
                  className="rounded bg-[#f1f5f9] px-4 py-2 text-[13px] font-bold text-[#334155]"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  data-testid="modal-fire-confirm"
                  onClick={() => void handleFire()}
                  className="rounded bg-[#d11938] px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                >
                  {t("detail.modal.fireConfirm")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex justify-end gap-2.5 border-t border-[#e2e8f0] pt-3.5">
              {onFire ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="modal-fire"
                  onClick={() => setConfirmingFire(true)}
                  className="mr-auto rounded bg-[#fef2f2] px-4 py-2 text-[13px] font-bold text-[#d11938]"
                >
                  {t("detail.modal.fire")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded bg-[#f1f5f9] px-4 py-2 text-[13px] font-bold text-[#334155]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAccept()}
                data-testid="modal-accept"
                className="rounded bg-[#d11938] px-5 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {t("detail.modal.accept")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
