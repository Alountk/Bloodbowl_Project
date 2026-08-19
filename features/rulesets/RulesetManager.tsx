"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { RACES } from "@/features/teams/data/races";
import {
  deleteRuleset,
  formatGold,
  formatTvCap,
  listRulesets,
  updateRuleset,
  type Ruleset,
} from "./api";
import { RulesetCarousel } from "./RulesetCarousel";
import { RulesetEditor, type RulesetEditorTarget } from "./RulesetEditor";

type EditorState = { kind: "create" } | { kind: "edit"; ruleset: Ruleset } | null;

/** The Option-B card summary chip (razas / tesorería / TV / plantilla / estado). */
function RulesetCard({
  ruleset,
  onEdit,
  onChanged,
}: {
  ruleset: Ruleset;
  onEdit: (ruleset: Ruleset) => void;
  onChanged: (ruleset: Ruleset) => void;
}) {
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const toggleActive = async () => {
    try {
      const updated = await updateRuleset(ruleset.id, { active: !ruleset.active });
      onChanged(updated);
    } catch {
      // Surface the error state by keeping the current card untouched.
    }
  };

  const remove = async () => {
    try {
      await deleteRuleset(ruleset.id);
      onChanged(ruleset);
    } catch {
      setConfirmingDelete(false);
    }
  };

  return (
    <li className="relative flex min-w-[260px] flex-1 snap-start flex-col rounded-xl border-[1.5px] border-slate-200 bg-white p-3.5 transition-colors hover:border-[#12225a]">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onEdit(ruleset)}
          className="text-left text-[15px] font-black text-[#12225a] hover:underline"
        >
          {ruleset.name}
        </button>
        <button
          type="button"
          onClick={() => onEdit(ruleset)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-[#12225a] hover:border-[#12225a]"
        >
          {t("rulesets.edit")}
        </button>
      </div>
      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-slate-500">
        {ruleset.description ?? t("rulesets.noDescription")}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {t("rulesets.chip.races")} <b className="text-[#12225a]">{ruleset.races.length}/{RACES.length}</b>
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {t("rulesets.chip.treasury")} <b className="text-[#12225a]">{formatGold(ruleset.startingTreasury)}</b>
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          {t("rulesets.chip.tv")} <b className="text-[#12225a]">{formatTvCap(ruleset.tvCap)}</b>
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          <b className="text-[#12225a]">{ruleset.minPlayers}–{ruleset.maxPlayers}</b> {t("rulesets.chip.players")}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${
            ruleset.active
              ? "border-[#86efac] bg-[#dcfce7] text-[#166534]"
              : "border-[#fecaca] bg-[#fee2e2] text-[#991b1b]"
          }`}
        >
          {ruleset.active ? t("rulesets.chip.active") : t("rulesets.chip.inactive")}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={toggleActive}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#12225a] hover:text-[#12225a]"
        >
          {ruleset.active ? t("rulesets.deactivate") : t("rulesets.activate")}
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">{t("rulesets.confirmDelete")}</span>
            <button
              type="button"
              onClick={remove}
              className="rounded-md bg-[#d11938] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#b3122f]"
            >
              {t("common.yes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600"
            >
              {t("common.no")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#d11938] hover:text-[#d11938]"
          >
            {t("rulesets.delete")}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The RAU-52b developer-only "Tipos de reglas" section (inline layout): the
 * cards grid with a carousel on top and the tabbed RulesetEditor on the bottom.
 * The parent page already gate-kept the section to developers; every mutation
 * here hits the developer-only API. "+ Nuevo tipo" and per-card "Editar" load
 * the editor below; a dirty editor guards card switches through the editor.
 */
export function RulesetManager() {
  const { t } = useI18n();
  const [rulesets, setRulesets] = useState<Ruleset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [pending, setPending] = useState<RulesetEditorTarget | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listRulesets();
      setRulesets(list);
      // A ruleset that no longer exists (deleted) closes its editor.
      setEditor((current) =>
        current?.kind === "edit" && !list.some((ruleset) => ruleset.id === current.ruleset.id)
          ? null
          : current,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rulesets.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    listRulesets()
      .then((list) => {
        if (!cancelled) setRulesets(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t("rulesets.loadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    if (editor === null) {
      setEditor({ kind: "create" });
      return;
    }
    // The editor decides whether the dirty guard intercepts the switch.
    setPending({ kind: "create" });
  };

  const openEdit = (ruleset: Ruleset) => {
    if (editor === null) {
      setEditor({ kind: "edit", ruleset });
      return;
    }
    setPending({ kind: "edit", ruleset });
  };

  const resolvePending = () => {
    setPending((current) => {
      if (current) setEditor(current);
      return null;
    });
  };

  const cancelPending = () => {
    setPending(null);
  };

  const closeEditor = () => {
    setEditor(null);
    setPending(null);
  };

  return (
    <section aria-labelledby="rulesets-heading">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="min-w-0">
          <h1
            id="rulesets-heading"
            className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
          >
            {t("rulesets.title")} <span className="align-middle rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em]">DEV</span>
          </h1>
          <p className="mt-1 text-[13px] text-[#cbd5e1]">{t("rulesets.heroSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md border-2 border-[#d11938] bg-[#d11938] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#b3122f]"
        >
          {t("rulesets.newRuleset")}
        </button>
      </header>

      {loading ? null : error ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : rulesets.length === 0 ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">{t("rulesets.empty")}</p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
          >
            {t("rulesets.newRuleset")}
          </button>
        </div>
      ) : (
        <RulesetCarousel count={rulesets.length}>
          {rulesets.map((ruleset) => (
            <RulesetCard
              key={ruleset.id}
              ruleset={ruleset}
              onEdit={openEdit}
              onChanged={refresh}
            />
          ))}
        </RulesetCarousel>
      )}

      {editor ? (
        <RulesetEditor
          key={editor.kind === "edit" ? editor.ruleset.id : "create"}
          editing={editor.kind === "edit" ? editor.ruleset : null}
          pending={pending}
          onSaved={refresh}
          onClose={closeEditor}
          onResolvePending={resolvePending}
          onCancelPending={cancelPending}
        />
      ) : (
        <div className="mt-8 border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-500">{t("rulesets.editor.placeholder")}</p>
        </div>
      )}
    </section>
  );
}
