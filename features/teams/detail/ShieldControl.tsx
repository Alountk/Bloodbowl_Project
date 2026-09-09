"use client";

import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { removeTeamShield, uploadTeamShield } from "../api";

export interface ShieldControlProps {
  teamId: string;
  /** Whether the team already has a stored shield → shows the "Quitar escudo" action. */
  hasEmblem: boolean;
  /**
   * Called after a SUCCESSFUL upload or removal so the caller re-lists the team
   * and the fresh `emblem` reaches the render surface (the page wiring passes
   * the AppProvider `refreshTeams`). A rejected re-list never surfaces as an
   * upload error — the mutation already succeeded and the store converges on
   * the next list.
   */
  onShieldChanged?: () => void | Promise<void>;
}

/**
 * RAU-78: the OWNER-only shield control rendered in the team-detail hero. The
 * page mounts it only for the session owner (TS-4); this component never sees a
 * rival team. "Subir escudo" opens a direct JPEG/PNG/WebP picker (no crop — the
 * server cover-crops to a 512 WebP) and "Quitar escudo" appears once the team
 * has an emblem. Pending/error/success feedback is announced through live
 * regions keyed off `detail.shield.*` (ES default for the detail surface).
 */
export function ShieldControl({ teamId, hasEmblem, onShieldChanged }: ShieldControlProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /** Best-effort team re-list after a successful mutation. */
  async function refresh() {
    try {
      await onShieldChanged?.();
    } catch {
      // A failed refresh must not mask a successful mutation with an error.
    }
  }

  async function runMutation(mutation: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      await mutation();
      setSuccess(true);
      await refresh();
    } catch {
      setError(t("detail.shield.error"));
    } finally {
      setPending(false);
    }
  }

  function handleFileSelected(file?: File | null) {
    if (!file || pending) return;
    void runMutation(() => uploadTeamShield(teamId, file));
  }

  function handleRemove() {
    if (pending) return;
    void runMutation(() => removeTeamShield(teamId));
  }

  const actionClasses =
    "rounded-full border border-white/25 bg-white/10 px-[10px] py-[3px] text-[12px] font-bold text-white " +
    "hover:border-white/60 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div data-testid="shield-control" className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="shield-upload-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          className={actionClasses}
        >
          {t("detail.shield.upload")}
        </button>
        {hasEmblem ? (
          <button
            type="button"
            data-testid="shield-remove-button"
            onClick={handleRemove}
            disabled={pending}
            className={`${actionClasses} hover:border-red hover:text-red`}
          >
            {t("detail.shield.remove")}
          </button>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        data-testid="shield-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0])}
      />
      {pending ? (
        <span
          role="status"
          data-testid="shield-status-pending"
          className="text-[11px] font-semibold text-white/70"
        >
          {t("detail.shield.pending")}
        </span>
      ) : null}
      {!pending && error ? (
        <span
          role="alert"
          data-testid="shield-status-error"
          className="rounded-full bg-red px-[8px] py-[2px] text-[10.5px] font-bold text-white"
        >
          {error}
        </span>
      ) : null}
      {!pending && !error && success ? (
        <span
          role="status"
          data-testid="shield-status-success"
          className="rounded-full bg-white/10 px-[8px] py-[2px] text-[10.5px] font-bold text-white"
        >
          {t("detail.shield.success")}
        </span>
      ) : null}
    </div>
  );
}
