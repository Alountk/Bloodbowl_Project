"use client";

import { t as translate, DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";
import {
  resolveInjury,
  permanentAttribute,
  type InjuryOutcomeKind,
} from "@/lib/rules/injuries";
import { casualtyBandLabel, type TFunc } from "./liveEventLabels";

/**
 * The shared 1D16(+1D6) roll picker for the live action strip (b2/D3). A compact
 * controlled stepper of roll values (no selects): the 1D16 group labels each
 * option "{roll} → {band}" mirroring RAU-42, and the 1D6 group appears only when
 * the derived band is `permanent` (13-14). The band is DERIVED client-side via
 * the same `resolveInjury` mirror used by the old controls for UX, but the
 * SERVER stays authoritative — the client only ever submits the raw roll values.
 *
 * Testids: `roll-stepper-16` / `roll-stepper-6` containers and `roll-option-{n}`
 * per raw value (scoped by their container — the 1D6 group reuses the same
 * roll-option pattern so its 1..6 never collide with the 1D16 group).
 */

/** The es-default translator (Spanish fallback when no `t` is passed). */
const esT: TFunc = (key, params) => translate(DEFAULT_LOCALE, key, params);

export const ROLL16_VALUES = Array.from({ length: 16 }, (_, i) => i + 1);
export const ROLL6_VALUES = Array.from({ length: 6 }, (_, i) => i + 1);

/**
 * LM-27: the 1D16 severity chip styling per injury band — SAME `resolveInjury`
 * mapping that drives the label. `chip` fills the option background so each band
 * carries its severity color (the band is never hidden when selected); `text`
 * is the dark-on-fill text color that keeps every chip readable under WCAG AA on
 * the light panel. The coloured fills and dark text are the ONLY new colors
 * (MV-7's five-band ramp); Tailwind JIT needs each arbitrary value spelled out.
 *
 * Selected = band fill + a navy ring (the ring, not a navy fill, marks the
 * choice) so the severity band stays visible AND the selection is unambiguous.
 */
export const SEVERITY_CLASS: Record<InjuryOutcomeKind, { chip: string; text: string }> = {
  bruise: { chip: "border-[#cbd5e1] bg-[#f1f5f9]", text: "text-[#334155]" },
  apaleado: { chip: "border-[#fde047] bg-[#fef9c3]", text: "text-[#854d0e]" },
  grave: { chip: "border-[#fcd34d] bg-[#fef3c7]", text: "text-[#92400e]" },
  permanent: { chip: "border-[#fdba74] bg-[#ffedd5]", text: "text-[#9a3412]" },
  dead: { chip: "border-[#fca5a5] bg-[#fee2e2]", text: "text-[#991b1b]" },
};

/** The navy ring marking the selected 1D16 chip on top of its band fill. */
const SELECTED_RING = "ring-2 ring-[#12225a]";

/**
 * RAU-42: the 1D16 option label — "{roll} → {band}" ("8 → Magullado"), with the
 * required-1D6 hint appended to the permanent band ("13 → Permanente (tira
 * 1D6)"). The option's VALUE stays the raw roll; only the label derives it.
 */
export function roll16OptionLabel(n: number, fn: TFunc = esT): string {
  const kind = resolveInjury(n).kind;
  return fn("match.controls.roll16Option", {
    roll: n,
    band: casualtyBandLabel(kind, fn),
  }) + (kind === "permanent" ? fn("match.controls.roll6Suffix") : "");
}

/** RAU-42: the 1D6 option label — "{roll} → −{attr}" ("5 → −AG"). Display-only;
 * the option value stays the raw roll. */
export function roll6OptionLabel(n: number, fn: TFunc = esT): string {
  return fn("match.controls.roll6Option", { roll: n, attr: permanentAttribute(n).toUpperCase() });
}

export interface RollStepperProps {
  /** The currently selected 1D16 raw value ("" = none selected yet). */
  roll16: number | "";
  /** The selected 1D6 value ("" until required); only meaningful when permanent. */
  roll6: number | "";
  onRoll16: (n: number) => void;
  onRoll6: (n: number) => void;
  /** The active translator (the live app passes `useI18n().t`). */
  fn?: TFunc;
}

export function RollStepper({ roll16, roll6, onRoll16, onRoll6, fn }: RollStepperProps) {
  const resolve = fn ?? esT;
  const derivedKind = roll16 === "" ? null : resolveInjury(roll16).kind;
  const needsRoll6 = derivedKind === "permanent";

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-label="1D16"
        data-testid="roll-stepper-16"
        className="flex flex-wrap gap-1.5"
      >
        {ROLL16_VALUES.map((n) => {
          const label = roll16OptionLabel(n, resolve);
          const kind = resolveInjury(n).kind;
          const severity = SEVERITY_CLASS[kind];
          const selected = roll16 === n;
          return (
            <button
              key={n}
              type="button"
              data-testid={`roll-option-${n}`}
              data-band={kind}
              aria-pressed={selected}
              onClick={() => onRoll16(n)}
              className={`rounded border px-2 py-1 text-xs font-bold ${severity.text} ${severity.chip} ${
                selected ? SELECTED_RING : ""
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {needsRoll6 ? (
        <div
          aria-label="1D6"
          data-testid="roll-stepper-6"
          className="flex flex-wrap gap-1.5"
        >
          {ROLL6_VALUES.map((n) => {
            const label = roll6OptionLabel(n, resolve);
            const selected = roll6 === n;
            return (
              <button
                key={n}
                type="button"
                data-testid={`roll-option-${n}`}
                aria-pressed={selected}
                onClick={() => onRoll6(n)}
                className={`rounded border px-2 py-1 text-xs font-bold ${
                  selected
                    ? "border-[#d11938] bg-[#d11938] text-white"
                    : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
