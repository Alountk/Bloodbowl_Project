import { useState } from "react";
import { useI18n } from "@/lib/i18n";

export interface ResetLiveMatchModalProps {
  open: boolean;
  /** Async confirm: resolves on a successful reset (the modal then closes);
   * rejects with an Error whose message is surfaced as an alert. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/**
 * Confirmation dialog for the manual live-match reset (LMR-7), mirroring the
 * `ForfeitModal` chrome (`role="dialog"`, aria-label, navy header). It confirms
 * a single destructive action: the parent owns the POST, the modal owns the
 * pending state (actions disabled, "Reiniciando…") and the error alert, and it
 * closes itself ONLY on success (a rejection keeps it open with the alert).
 * Renders nothing when closed.
 */
export function ResetLiveMatchModal({ open, onConfirm, onClose }: ResetLiveMatchModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  if (!open) return null;

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("reset.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("reset.dialogAria")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md border border-border bg-panel shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
          <h3 className="text-sm font-bold">{t("reset.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("common.close")}
            className="text-xs font-semibold text-white/80 hover:text-white disabled:opacity-50"
          >
            ✕ {t("common.close")}
          </button>
        </header>
        <div className="px-4 py-3">
          <p className="mb-3 text-sm text-slate-600">{t("reset.prompt")}</p>
          {error ? (
            <p role="alert" className="mb-3 text-sm font-semibold text-red">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void confirm()}
              className="rounded-sm bg-red px-4 py-2 text-sm font-bold text-white hover:bg-red-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t("reset.submitting") : t("reset.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
