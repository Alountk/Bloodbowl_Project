"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { RACES } from "@/features/teams/data/races";
import {
  RACE_PRESETS,
  presetTodas,
} from "./presets";
import {
  createRuleset,
  updateRuleset,
  type Ruleset,
  type RulesetDraft,
} from "./api";

interface RulesetWizardProps {
  onClose: () => void;
  /** Fired with the persisted ruleset after create/update so the grid refreshes. */
  onSaved: (ruleset: Ruleset) => void;
  /** When set, the wizard opens in edit mode pre-filled from this ruleset. */
  editing?: Ruleset | null;
}

const STEPS = [
  { n: 1, key: "info" },
  { n: 2, key: "races" },
  { n: 3, key: "economy" },
  { n: 4, key: "management" },
] as const;

/** A ruleset as typed by the wizard (numeric fields kept as strings for inputs). */
interface WizardDraft {
  name: string;
  description: string;
  races: string[];
  startingTreasury: string;
  tvCap: string;
  minPlayers: string;
  maxPlayers: string;
  hireFire: "between-jornadas" | "libre";
  seasonReform: boolean;
  mercenaries: boolean;
  active: boolean;
}

function draftFrom(ruleset?: Ruleset | null): WizardDraft {
  if (ruleset) {
    return {
      name: ruleset.name,
      description: ruleset.description ?? "",
      races: ruleset.races.length > 0 ? ruleset.races : presetTodas(),
      startingTreasury: String(ruleset.startingTreasury),
      tvCap: ruleset.tvCap === null ? "" : String(ruleset.tvCap),
      minPlayers: String(ruleset.minPlayers),
      maxPlayers: String(ruleset.maxPlayers),
      hireFire: ruleset.hireFire === "libre" ? "libre" : "between-jornadas",
      seasonReform: ruleset.seasonReform,
      mercenaries: ruleset.mercenaries,
      active: ruleset.active,
    };
  }
  return {
    name: "",
    description: "",
    races: presetTodas(),
    startingTreasury: "1000000",
    tvCap: "",
    minPlayers: "11",
    maxPlayers: "16",
    hireFire: "between-jornadas",
    seasonReform: true,
    mercenaries: false,
    active: true,
  };
}

function parsePositiveInt(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The Option-B 4-step ruleset wizard (RAU-52, developer-only section):
 * 1 Información → 2 Razas (31 checkboxes + presets) → 3 Economía y plantilla
 * → 4 Gestión y reglas. Saves via POST (new) or PATCH (edit). Rulebook-light
 * tokens, red accent on the active step, navy primary actions.
 *
 * The parent mounts this component ONLY while the wizard is open, so the draft
 * state initializes fresh from `editing` on every mount (no reset effect).
 */
export function RulesetWizard({ onClose, onSaved, editing }: RulesetWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<WizardDraft>(() => draftFrom(editing));
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleRace = (id: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      races: checked
        ? [...current.races, id]
        : current.races.filter((raceId) => raceId !== id),
    }));
    setStepError(null);
  };

  const applyPreset = (apply: () => string[]) => {
    setDraft((current) => ({ ...current, races: apply() }));
    setStepError(null);
  };

  const validateStep = (): boolean => {
    if (step === 1) {
      if (!draft.name.trim()) {
        setStepError(t("rulesets.wizard.errors.nameRequired"));
        return false;
      }
    }
    if (step === 2) {
      if (draft.races.length === 0) {
        setStepError(t("rulesets.wizard.errors.noRaces"));
        return false;
      }
    }
    if (step === 3) {
      const treasury = parsePositiveInt(draft.startingTreasury);
      if (!treasury) {
        setStepError(t("rulesets.wizard.errors.treasury"));
        return false;
      }
      const tvCap = draft.tvCap.trim() === "" ? null : parsePositiveInt(draft.tvCap);
      if (draft.tvCap.trim() !== "" && !tvCap) {
        setStepError(t("rulesets.wizard.errors.tvCap"));
        return false;
      }
      const min = parsePositiveInt(draft.minPlayers);
      const max = parsePositiveInt(draft.maxPlayers);
      if (!min || !max || min > 16 || max > 16) {
        setStepError(t("rulesets.wizard.errors.players"));
        return false;
      }
      if (min > max) {
        setStepError(t("rulesets.wizard.errors.minMax"));
        return false;
      }
    }
    setStepError(null);
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((current) => current + 1);
  };

  const back = () => {
    setStepError(null);
    setStep((current) => Math.max(1, current - 1));
  };

  const save = async () => {
    if (!validateStep()) return;
    const payload: RulesetDraft = {
      name: draft.name.trim(),
      description: draft.description.trim() === "" ? null : draft.description.trim(),
      races: draft.races,
      startingTreasury: parsePositiveInt(draft.startingTreasury) ?? 0,
      tvCap: draft.tvCap.trim() === "" ? null : parsePositiveInt(draft.tvCap),
      minPlayers: parsePositiveInt(draft.minPlayers) ?? 0,
      maxPlayers: parsePositiveInt(draft.maxPlayers) ?? 0,
      hireFire: draft.hireFire,
      seasonReform: draft.seasonReform,
      mercenaries: draft.mercenaries,
      active: draft.active,
    };
    setSubmitting(true);
    setStepError(null);
    try {
      const saved = editing ? await updateRuleset(editing.id, payload) : await createRuleset(payload);
      onSaved(saved);
      onClose();
    } catch (e) {
      setStepError(e instanceof Error ? e.message : t("rulesets.wizard.errors.save"));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#12225a]";
  const labelClass = "mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("rulesets.wizard.closeAria")}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("rulesets.wizard.title")}
        className="relative z-10 w-full max-w-[720px] overflow-hidden border border-slate-200 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
      >
        {/* Step bar */}
        <div className="flex border-b border-slate-200 bg-slate-100">
          {STEPS.map(({ n, key }) => {
            const isNow = n === step;
            const isDone = n < step;
            return (
              <div
                key={key}
                aria-current={isNow ? "step" : undefined}
                className={`flex-1 border-b-[3px] px-2 py-3 text-center text-xs font-extrabold ${
                  isNow
                    ? "border-[#d11938] bg-white text-[#12225a]"
                    : isDone
                      ? "border-transparent text-green-700"
                      : "border-transparent text-slate-400"
                }`}
              >
                {t(`rulesets.wizard.steps.${key}`, { n: String(n) })}
              </div>
            );
          })}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="ruleset-name" className={labelClass}>
                  {t("rulesets.wizard.name")}
                </label>
                <input
                  id="ruleset-name"
                  value={draft.name}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, name: event.target.value }));
                    setStepError(null);
                  }}
                  placeholder={t("rulesets.wizard.namePlaceholder")}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ruleset-description" className={labelClass}>
                  {t("rulesets.wizard.description")}
                </label>
                <textarea
                  id="ruleset-description"
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {RACE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.apply)}
                    className="rounded-md border border-[#c7d2fe] bg-[#eef2ff] px-2.5 py-1 text-xs font-extrabold text-[#12225a] hover:bg-[#e0e7ff]"
                  >
                    {t(`rulesets.wizard.presets.${preset.key}`)}
                  </button>
                ))}
                <span className="ml-auto text-xs font-bold text-slate-500">
                  {t("rulesets.wizard.racesCount", { count: draft.races.length, total: RACES.length })}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {RACES.map((race) => {
                  const checked = draft.races.includes(race.id);
                  return (
                    <label
                      key={race.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] ${
                        checked
                          ? "border-[#12225a]/30 bg-white text-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleRace(race.id, event.target.checked)}
                        className="h-3.5 w-3.5 accent-[#12225a]"
                      />
                      {race.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ruleset-treasury" className={labelClass}>
                  {t("rulesets.wizard.treasury")}
                </label>
                <input
                  id="ruleset-treasury"
                  type="number"
                  min={1}
                  value={draft.startingTreasury}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, startingTreasury: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ruleset-tvcap" className={labelClass}>
                  {t("rulesets.wizard.tvCap")}
                </label>
                <input
                  id="ruleset-tvcap"
                  type="number"
                  min={1}
                  placeholder={t("rulesets.wizard.tvCapEmpty")}
                  value={draft.tvCap}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tvCap: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ruleset-min" className={labelClass}>
                  {t("rulesets.wizard.minPlayers")}
                </label>
                <input
                  id="ruleset-min"
                  type="number"
                  min={1}
                  max={16}
                  value={draft.minPlayers}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, minPlayers: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="ruleset-max" className={labelClass}>
                  {t("rulesets.wizard.maxPlayers")}
                </label>
                <input
                  id="ruleset-max"
                  type="number"
                  min={1}
                  max={16}
                  value={draft.maxPlayers}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, maxPlayers: event.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="ruleset-hirefire" className={labelClass}>
                  {t("rulesets.wizard.hireFire")}
                </label>
                <select
                  id="ruleset-hirefire"
                  value={draft.hireFire}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      hireFire: event.target.value as "between-jornadas" | "libre",
                    }))
                  }
                  className={inputClass}
                >
                  <option value="between-jornadas">{t("rulesets.wizard.hireFireBetween")}</option>
                  <option value="libre">{t("rulesets.wizard.hireFireLibre")}</option>
                </select>
              </div>
              <div className="space-y-3">
                {(
                  [
                    ["seasonReform", t("rulesets.wizard.seasonReform")],
                    ["mercenaries", t("rulesets.wizard.mercenaries")],
                    ["active", t("rulesets.wizard.active")],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft[field]}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [field]: event.target.checked }))
                      }
                      className="h-4 w-4 accent-[#12225a]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {stepError ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {stepError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={step === 1 ? onClose : back}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[#12225a] hover:text-[#12225a]"
          >
            {step === 1 ? t("common.cancel") : t("rulesets.wizard.back")}
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-[#12225a] px-5 py-2 text-sm font-bold text-white hover:bg-[#0f1d48]"
            >
              {t("rulesets.wizard.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={submitting}
              className="rounded-md bg-[#d11938] px-5 py-2 text-sm font-bold text-white hover:bg-[#b3122f] disabled:opacity-60"
            >
              {submitting ? t("rulesets.wizard.saving") : t("rulesets.wizard.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
