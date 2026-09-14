"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import {
  buildActaPayload,
  emptyActaState,
  type ActaState,
  type ActaTeamDraft,
} from "./acta/actaState";
import { reconcileRolls } from "./acta/bajasPlan";
import { StepContexto } from "./acta/StepContexto";
import { StepMarcador } from "./acta/StepMarcador";
import { StepAcciones } from "./acta/StepAcciones";
import { StepMvp } from "./acta/StepMvp";
import { StepBajas } from "./acta/StepBajas";
import { StepFinal } from "./acta/StepFinal";
import { StepRevisar, validateActa } from "./acta/StepRevisar";
import type { ResultPayload } from "./api";
import type { RosterPlayerRef } from "./MatchResolveModal";

/** The seven acta steps in order (MAW-2 … MAW-8), as i18n keys. */
const STEP_KEYS = [
  "acta.step.contexto",
  "acta.step.marcador",
  "acta.step.acciones",
  "acta.step.mvp",
  "acta.step.bajas",
  "acta.step.final",
  "acta.step.revisar",
] as const;

const LAST_STEP = STEP_KEYS.length - 1;

/** The focusable descendants the Tab trap cycles through. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Re-aligns one team's positional roll arrays when its Step-2 action lines
 * change: a roll follows its VICTIM by identity (see `reconcileRolls`), so
 * deleting, inserting, or reordering a casualty line can never rebind a
 * recorded roll to a different player (s3d corrective). A side whose actions are
 * untouched is returned unchanged.
 */
function reconcileDraftRolls(prev: ActaTeamDraft, next: ActaTeamDraft): ActaTeamDraft {
  if (prev.actions === next.actions) return next;
  const { injuryRoll, permanentRoll } = reconcileRolls(prev, next.actions);
  return { ...next, injuryRoll, permanentRoll };
}

export interface MatchActaWizardProps {
  open: boolean;
  /** "load" (new result) or "correct" (prefilled correction). */
  mode: "load" | "correct";
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
  onClose: () => void;
  /** Correct-mode prefill (S6 wires `actaPrefill`); read once at mount. */
  initial?: ActaState;
  /**
   * Invoked by the Step-6 "Guardar acta" button with the assembled payload. The
   * shell calls it only when the acta validates (Σ anotaciones == marcador and
   * both MVPs selected); the app wiring lands in s4c. A rejected promise is
   * surfaced in the dialog's `role="alert"` and the acta stays open.
   */
  onSubmit?: (payload: ResultPayload) => void | Promise<void>;
}

/**
 * MatchActaWizard — the "Acta del partido" / "Match report" dialog shell
 * (RAU-122); its copy is localized through `useI18n()`. It
 * owns the step navigation, the shared wizard state, and the modal a11y
 * contract: `role="dialog" aria-modal="true"`, `aria-current="step"` on the
 * active step, a Tab focus trap, Escape-to-close, and focus restore on close.
 * The step bodies live under `features/leagues/acta/`; this slice ships Steps
 * 0–6 (S2 + s3a + s3b + s3c + s4a). The Step-6 footer button is gated by the
 * pure `validateActa` save-block (MAW-8).
 */
export function MatchActaWizard({
  open,
  mode,
  homeName,
  awayName,
  homeRoster,
  awayRoster,
  onClose,
  initial,
  onSubmit,
}: MatchActaWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ActaState>(() => initial ?? emptyActaState());
  // A rejected submit (400/409) must never be swallowed: it is surfaced in the
  // alert below and cleared on the next attempt.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Pending state: while an async submit is in flight the save button is
  // disabled, so a double-click can never fire two overlapping PUTs.
  const [submitting, setSubmitting] = useState(false);
  // Step 2 edits the action lines; the wizard re-aligns each side's positional
  // rolls at that moment so a recorded roll stays bound to its victim (s3d).
  const handleActionsChange = (next: ActaState) =>
    setState((prev) => ({
      ...next,
      home: reconcileDraftRolls(prev.home, next.home),
      away: reconcileDraftRolls(prev.away, next.away),
    }));
  const dialogRef = useRef<HTMLDivElement>(null);
  // The active step body; focus moves here whenever the active step changes so
  // the new step is announced and its controls are the next Tab stop.
  const stepRef = useRef<HTMLDivElement>(null);
  // Keep the latest close handler without re-running the focus effect (an
  // inline parent handler would otherwise refocus on every render).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    (focusables()[0] ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Design requirement: focus-first-on-step-change. Runs after the `[open]`
  // effect (which focuses the first control on mount) so the step body wins
  // when the active step changes.
  useEffect(() => {
    if (!open) return;
    stepRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  const title =
    mode === "correct" ? t("acta.title.correct") : t("acta.title.load");
  const stepLabels = STEP_KEYS.map((key) => t(key));

  let body: ReactNode;
  if (step === 0) {
    body = (
      <StepContexto
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
      />
    );
  } else if (step === 1) {
    body = (
      <StepMarcador
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
      />
    );
  } else if (step === 2) {
    body = (
      <StepAcciones
        state={state}
        onChange={handleActionsChange}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    );
  } else if (step === 3) {
    body = (
      <StepMvp
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    );
  } else if (step === 4) {
    body = (
      <StepBajas
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    );
  } else if (step === 5) {
    body = (
      <StepFinal
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
      />
    );
  } else {
    body = (
      <StepRevisar
        state={state}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    );
  }

  // The Step-6 save block: the same pure validation the step renders gates the
  // footer button, so an invalid acta can never reach `onSubmit` (MAW-8).
  const validation = validateActa(state, homeName, awayName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-border bg-panel shadow-xl outline-none"
      >
        <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
          <h2 className="font-display text-sm font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("acta.close")}
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ {t("acta.close")}
          </button>
        </header>

        <nav
          aria-label={t("acta.nav")}
          className="border-b border-border bg-background px-4 py-2"
        >
          <ol className="flex flex-wrap gap-2">
            {STEP_KEYS.map((key, index) => {
              const label = t(key);
              const active = index === step;
              return (
                <li key={key}>
                  <span
                    aria-current={active ? "step" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      active
                        ? "border-navy bg-panel text-navy"
                        : "border-transparent text-slate"
                    }`}
                  >
                    <b
                      className={`inline-grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                        active ? "bg-red text-white" : "bg-border text-ink"
                      }`}
                    >
                      {index}
                    </b>
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div
          ref={stepRef}
          role="group"
          aria-label={stepLabels[step]}
          tabIndex={-1}
          className="px-4 py-4 outline-none"
        >
          {body}
        </div>

        {submitError ? (
          <p
            role="alert"
            className="border-t border-border bg-panel px-4 py-2 text-sm font-semibold text-red"
          >
            {submitError}
          </p>
        ) : null}

        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
            className="rounded-sm border border-border bg-panel px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            {t("acta.back")}
          </button>
          {step === LAST_STEP ? (
            <button
              type="button"
              onClick={() => {
                if (!validation.ok || submitting) return;
                setSubmitError(null);
                const maybe = onSubmit?.(buildActaPayload(state));
                // Only a thenable submit has an in-flight window; a synchronous
                // handler has nothing to guard, so it never toggles the pending
                // state. The button re-enables on settle for a genuine retry.
                if (maybe instanceof Promise) {
                  setSubmitting(true);
                  maybe
                    .catch(() => setSubmitError(t("acta.saveError")))
                    .finally(() => setSubmitting(false));
                }
              }}
              disabled={!validation.ok || submitting}
              className="rounded-sm bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t("acta.save")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(LAST_STEP, current + 1))}
              disabled={step === LAST_STEP}
              className="rounded-sm bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t("acta.next")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
