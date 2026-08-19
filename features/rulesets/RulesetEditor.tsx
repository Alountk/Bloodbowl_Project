"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { RACES } from "@/features/teams/data/races";
import { RACE_PRESETS, presetTodas } from "./presets";
import {
  createRuleset,
  updateRuleset,
  type Ruleset,
  type RulesetDraft,
} from "./api";

export type RulesetTab = "info" | "races" | "economy" | "management";

interface RulesetEditorProps {
  /** When null the editor runs the create (sequential) flow. */
  editing: Ruleset | null;
  onSaved: (ruleset: Ruleset) => void;
  onClose: () => void;
}

const TABS: ReadonlyArray<{ key: RulesetTab; n: number }> = [
  { key: "info", n: 1 },
  { key: "races", n: 2 },
  { key: "economy", n: 3 },
  { key: "management", n: 4 },
];

/** A ruleset as edited by the tabs (numeric fields kept as strings for inputs). */
interface EditorDraft {
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

function draftFrom(ruleset?: Ruleset | null): EditorDraft {
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

type Translate = (key: string, params?: Record<string, string | number>) => string;

function validateTab(tab: RulesetTab, draft: EditorDraft, t: Translate): string | null {
  if (tab === "info" && !draft.name.trim()) {
    return t("rulesets.wizard.errors.nameRequired");
  }
  if (tab === "races" && draft.races.length === 0) {
    return t("rulesets.wizard.errors.noRaces");
  }
  if (tab === "economy") {
    if (!parsePositiveInt(draft.startingTreasury)) {
      return t("rulesets.wizard.errors.treasury");
    }
    const tvCap = draft.tvCap.trim() === "" ? null : parsePositiveInt(draft.tvCap);
    if (draft.tvCap.trim() !== "" && !tvCap) {
      return t("rulesets.wizard.errors.tvCap");
    }
    const min = parsePositiveInt(draft.minPlayers);
    const max = parsePositiveInt(draft.maxPlayers);
    if (!min || !max || min > 16 || max > 16) {
      return t("rulesets.wizard.errors.players");
    }
    if (min > max) {
      return t("rulesets.wizard.errors.minMax");
    }
  }
  return null;
}

/** First invalid tab in wizard order, or null when the whole draft is valid. */
function firstInvalid(draft: EditorDraft, t: Translate): { tab: RulesetTab; message: string } | null {
  for (const { key } of TABS) {
    const message = validateTab(key, draft, t);
    if (message) return { tab: key, message };
  }
  return null;
}

function tabIndex(tab: RulesetTab): number {
  return TABS.findIndex(({ key }) => key === tab);
}

/**
 * RAU-52b inline ruleset editor (developer-only section): the bottom half of
 * the page under the cards grid. Create mode walks the 4 tabs sequentially
 * ("Siguiente →" ... "Crear tipo de reglas" POSTs). Edit mode loads a card and
 * allows free tab navigation. Nothing persists until an explicit save.
 */
export function RulesetEditor({ editing, onSaved, onClose }: RulesetEditorProps) {
  const { t } = useI18n();
  const createMode = editing === null;
  const [activeTab, setActiveTab] = useState<RulesetTab>("info");
  const [draft, setDraft] = useState<EditorDraft>(() => draftFrom(editing));
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof EditorDraft>(field: K, value: EditorDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setStepError(null);
  };

  const go = (tab: RulesetTab) => {
    setActiveTab(tab);
    setStepError(null);
  };

  const requestTab = (tab: RulesetTab) => {
    if (tab !== activeTab) go(tab);
  };

  const payload = (): RulesetDraft => ({
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
  });

  /** Validates every tab; on success persists (POST in create, PATCH in edit). */
  const persist = async (): Promise<boolean> => {
    const invalid = firstInvalid(draft, t);
    if (invalid) {
      go(invalid.tab);
      setStepError(invalid.message);
      return false;
    }
    setSubmitting(true);
    setStepError(null);
    try {
      const saved = editing
        ? await updateRuleset(editing.id, payload())
        : await createRuleset(payload());
      onSaved(saved);
      return true;
    } catch (e) {
      setStepError(e instanceof Error ? e.message : t("rulesets.wizard.errors.save"));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    const message = validateTab(activeTab, draft, t);
    if (message) {
      setStepError(message);
      return;
    }
    go(TABS[Math.min(TABS.length - 1, tabIndex(activeTab) + 1)].key);
  };

  const back = () => {
    setStepError(null);
    go(TABS[Math.max(0, tabIndex(activeTab) - 1)].key);
  };

  const create = async () => {
    const ok = await persist();
    if (ok) onClose();
  };

  const save = async () => {
    await persist();
  };

  const inputClass =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#12225a]";
  const labelClass = "mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-slate-500";

  const onLastStep = tabIndex(activeTab) === TABS.length - 1;
  const stepNumber = TABS[tabIndex(activeTab)].n;

  return (
    <div className="mt-8">
      <div className="border border-slate-200 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.06)]">
        {/* Tab bar */}
        <div role="tablist" aria-label={t("rulesets.editor.tablist")} className="flex border-b border-slate-200 bg-slate-100">
          {TABS.map(({ key, n }) => {
            const active = key === activeTab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`ruleset-tab-${key}`}
                aria-selected={active}
                aria-controls={`ruleset-panel-${key}`}
                disabled={createMode}
                onClick={() => requestTab(key)}
                className={`flex-1 border-b-[3px] px-2 py-3 text-center text-xs font-extrabold transition-colors ${
                  active
                    ? "border-[#d11938] bg-white text-[#12225a]"
                    : createMode
                      ? "cursor-not-allowed border-transparent bg-slate-100 text-slate-400"
                      : "border-transparent text-slate-500 hover:bg-white hover:text-[#12225a]"
                }`}
              >
                {t(`rulesets.wizard.steps.${key}`, { n: String(n) })}
              </button>
            );
          })}
        </div>

        {/* Active tab panel */}
        <div
          role="tabpanel"
          id={`ruleset-panel-${activeTab}`}
          aria-labelledby={`ruleset-tab-${activeTab}`}
          className="p-5"
        >
          {activeTab === "info" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="ruleset-name" className={labelClass}>
                  {t("rulesets.wizard.name")}
                </label>
                <input
                  id="ruleset-name"
                  value={draft.name}
                  onChange={(event) => setField("name", event.target.value)}
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
                  onChange={(event) => setField("description", event.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "races" ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {RACE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setField("races", preset.apply())}
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
                        onChange={(event) =>
                          setField(
                            "races",
                            event.target.checked
                              ? [...draft.races, race.id]
                              : draft.races.filter((raceId) => raceId !== race.id),
                          )
                        }
                        className="h-3.5 w-3.5 accent-[#12225a]"
                      />
                      {race.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "economy" ? (
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
                  onChange={(event) => setField("startingTreasury", event.target.value)}
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
                  onChange={(event) => setField("tvCap", event.target.value)}
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
                  onChange={(event) => setField("minPlayers", event.target.value)}
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
                  onChange={(event) => setField("maxPlayers", event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "management" ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="ruleset-hirefire" className={labelClass}>
                  {t("rulesets.wizard.hireFire")}
                </label>
                <select
                  id="ruleset-hirefire"
                  value={draft.hireFire}
                  onChange={(event) =>
                    setField("hireFire", event.target.value as EditorDraft["hireFire"])
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
                      onChange={(event) => setField(field, event.target.checked)}
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

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={createMode && stepNumber > 1 ? back : onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[#12225a] hover:text-[#12225a]"
          >
            {createMode
              ? stepNumber === 1
                ? t("common.cancel")
                : t("rulesets.wizard.back")
              : t("common.cancel")}
          </button>
          {createMode ? (
            !onLastStep ? (
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
                onClick={() => void create()}
                disabled={submitting}
                className="rounded-md bg-[#d11938] px-5 py-2 text-sm font-bold text-white hover:bg-[#b3122f] disabled:opacity-60"
              >
                {submitting ? t("rulesets.editor.creating") : t("rulesets.editor.createAction")}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => void save()}
              disabled={submitting}
              className="rounded-md bg-[#12225a] px-5 py-2 text-sm font-bold text-white hover:bg-[#0f1d48] disabled:opacity-60"
            >
              {submitting ? t("rulesets.wizard.saving") : t("rulesets.editor.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
