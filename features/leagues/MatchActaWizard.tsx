"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { emptyActaState, type ActaState } from "./acta/actaState";
import { StepContexto } from "./acta/StepContexto";
import { StepMarcador } from "./acta/StepMarcador";
import { StepAcciones } from "./acta/StepAcciones";
import type { RosterPlayerRef } from "./MatchResolveModal";

/** The seven acta steps in order (MAW-2 … MAW-8). */
const STEP_LABELS = [
  "Contexto",
  "Marcador",
  "Acciones",
  "MVP",
  "Bajas",
  "Final",
  "Revisar",
] as const;

const LAST_STEP = STEP_LABELS.length - 1;

/** The focusable descendants the Tab trap cycles through. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
}

/**
 * MatchActaWizard — the Spanish "Acta del partido" dialog shell (RAU-122). It
 * owns the step navigation, the shared wizard state, and the modal a11y
 * contract: `role="dialog" aria-modal="true"`, `aria-current="step"` on the
 * active step, a Tab focus trap, Escape-to-close, and focus restore on close.
 * The step bodies live under `features/leagues/acta/`; this slice ships Steps
 * 0–2 (S2) and leaves 3–6 for the following slices.
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
}: MatchActaWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ActaState>(() => initial ?? emptyActaState());
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

  const title = mode === "correct" ? "Corregir acta del partido" : "Acta del partido";

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
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    );
  } else {
    body = (
      <p className="text-sm text-slate">
        {STEP_LABELS[step]} se completa en una porción posterior.
      </p>
    );
  }

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
            aria-label="Cerrar"
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <nav
          aria-label="Acta del partido"
          className="border-b border-border bg-background px-4 py-2"
        >
          <ol className="flex flex-wrap gap-2">
            {STEP_LABELS.map((label, index) => {
              const active = index === step;
              return (
                <li key={label}>
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
          aria-label={STEP_LABELS[step]}
          tabIndex={-1}
          className="px-4 py-4 outline-none"
        >
          {body}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
            className="rounded-sm border border-border bg-panel px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
          >
            Atrás
          </button>
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(LAST_STEP, current + 1))}
            disabled={step === LAST_STEP}
            className="rounded-sm bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Siguiente
          </button>
        </footer>
      </div>
    </div>
  );
}
