"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { createLeague } from "./api";

interface CreateLeagueModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a league is created so the list can refresh. */
  onCreate: () => Promise<void>;
}

/**
 * Rulebook create-league modal: name (unique globally) + optional description.
 * The per-turn clock option was REMOVED (D15): the deprecated columns remain on
 * the League row but the creation UI no longer exposes them. On POST the API
 * returns 409 for a duplicate name, surfaced as an inline error without closing
 * the modal so the user can pick another name.
 */
export function CreateLeagueModal({ open, onClose, onCreate }: CreateLeagueModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("leagues.create.nameRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLeague(trimmed, description.trim() === "" ? null : description.trim());
      setName("");
      setDescription("");
      onClose();
      await onCreate();
    } catch (e) {
      // Duplicate league name (unique global) → 409; stay open so the user retries.
      const message = e instanceof Error ? e.message : t("leagues.create.error");
      setError(message === "League name already exists" ? t("leagues.create.duplicateName") : message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClassName =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Rulebook scrim; click closes. */}
      <button
        type="button"
        aria-label={t("leagues.create.closeAria")}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("leagues.create.title")}
        className="relative z-10 w-full max-w-[480px] border border-slate-200 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
      >
        <header className="border-b-[3px] border-[#d11938] bg-[#12225a] px-5 py-4 text-white">
          <h2 className="text-lg font-black tracking-[0.02em]">{t("leagues.create.title")}</h2>
        </header>
        <form onSubmit={submit} noValidate className="space-y-4 p-5">
          <div>
            <label htmlFor="league-name" className="mb-1 block text-sm font-medium text-slate-700">
              {t("leagues.create.name")}
            </label>
            <input
              id="league-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("leagues.create.namePlaceholder")}
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="league-description" className="mb-1 block text-sm font-medium text-slate-700">
              {t("leagues.create.description")}
            </label>
            <textarea
              id="league-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder={t("leagues.create.descriptionPlaceholder")}
              className={fieldClassName}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
            >
              {t("leagues.create.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
