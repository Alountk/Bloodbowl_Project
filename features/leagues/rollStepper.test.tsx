import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { t as translate, DEFAULT_LOCALE } from "@/lib/i18n/dictionaries";
import { resolveInjury, INJURY_OUTCOMES, type InjuryOutcomeKind } from "@/lib/rules/injuries";
import type { TFunc } from "./liveEventLabels";
import {
  RollStepper,
  roll16OptionLabel,
  roll6OptionLabel,
  SEVERITY_CLASS,
  ROLL16_VALUES,
} from "./rollStepper";

// The Spanish-default translator mirrors liveEventLabels' private esT so the
// pure-label assertions are deterministic in the default locale.
const esT: TFunc = (key, params) => translate(DEFAULT_LOCALE, key, params);

/**
 * The shared 1D16(+1D6) roll picker (b2): a compact stepper of roll values that
 * the action bubble drives for Baja / Falta recording. The 1D6 group appears
 * only when the derived band (server-authoritative `resolveInjury` mirror) is
 * permanent. Pure labels mirror RAU-42: "{roll} → {band}" for 1D16 and
 * "{roll} → −{attr}" for 1D6, with the required-1D6 hint on the permanent band.
 */

describe("rollStepper labels (pure, RAU-42 mirror)", () => {
  it("labels a non-permanent 1D16 as {roll} → {band}", () => {
    expect(roll16OptionLabel(8, esT)).toBe("8 → Magullado");
    expect(roll16OptionLabel(12, esT)).toBe("12 → Herida grave");
  });

  it("labels the permanent 1D16 band with the 1D6 hint suffix", () => {
    expect(roll16OptionLabel(13, esT)).toBe("13 → Permanente (tira 1D6)");
    expect(roll16OptionLabel(14, esT)).toBe("14 → Permanente (tira 1D6)");
  });

  it("labels a 1D6 as {roll} → −{upper attribute}", () => {
    expect(roll6OptionLabel(1, esT)).toBe("1 → −AR");
    expect(roll6OptionLabel(3, esT)).toBe("3 → −MV");
    expect(roll6OptionLabel(6, esT)).toBe("6 → −ST");
  });
});

describe("RollStepper — controlled 1D16/1D6 picker", () => {
  function renderStepper(overrides: {
    roll16?: number | "";
    roll6?: number | "";
    onRoll16?: (n: number) => void;
    onRoll6?: (n: number) => void;
  } = {}) {
    const actor = overrides.onRoll16 ?? vi.fn();
    const actor6 = overrides.onRoll6 ?? vi.fn();
    const utils = render(
      <RollStepper roll16={overrides.roll16 ?? ""} roll6={overrides.roll6 ?? ""} onRoll16={actor} onRoll6={actor6} />,
    );
    return { onRoll16: actor, onRoll6: actor6, ...utils };
  }

  it("renders the 16 options with their derived band on the 1D16 stepper", () => {
    renderStepper();
    const stepper = screen.getByTestId("roll-stepper-16");
    expect(stepper).toBeTruthy();
    expect(within(stepper).getAllByRole("button")).toHaveLength(16);
    expect(within(stepper).getByTestId("roll-option-8").textContent).toContain("Magullado");
  });

  it("does NOT render the 1D6 stepper until the derived band is permanent", () => {
    const { rerender } = renderStepper({ roll16: 9 });
    expect(screen.queryByTestId("roll-stepper-6")).toBeNull();
    rerender(<RollStepper roll16={13} roll6={""} onRoll16={vi.fn()} onRoll6={vi.fn()} />);
    expect(screen.getByTestId("roll-stepper-6")).toBeTruthy();
    expect(within(screen.getByTestId("roll-stepper-6")).getAllByRole("button")).toHaveLength(6);
  });

  it("fires with the picked raw roll value, not its label", () => {
    const onRoll16 = vi.fn();
    const onRoll6 = vi.fn();
    const utils = render(<RollStepper roll16={""} roll6={""} onRoll16={onRoll16} onRoll6={onRoll6} />);
    fireEvent.click(within(utils.getByTestId("roll-stepper-16")).getByTestId("roll-option-13"));
    expect(onRoll16).toHaveBeenCalledWith(13);
  });
});

describe("rollStepper 1D16 severity bands (LM-27)", () => {
  function renderStepper() {
    const utils = render(
      <RollStepper roll16={""} roll6={""} onRoll16={vi.fn()} onRoll6={vi.fn()} />,
    );
    return within(utils.getByTestId("roll-stepper-16"));
  }

  it("tags every 1D16 chip with the severity band derived from the roll", () => {
    const stepper = renderStepper();
    for (const n of ROLL16_VALUES) {
      expect(stepper.getByTestId(`roll-option-${n}`).getAttribute("data-band")).toBe(
        resolveInjury(n).kind,
      );
    }
  });

  it("paints each ramp boundary with its own independent band (LM-27 literal bands)", () => {
    const stepper = renderStepper();
    // Independent boundary mapping 1|9|11|13|15 opens each band; a lone
    // resolveInjury passthrough (single grey for every roll) would fail here.
    const boundaries: Record<number, InjuryOutcomeKind> = {
      1: "bruise",
      8: "bruise",
      9: "apaleado",
      10: "apaleado",
      11: "grave",
      12: "grave",
      13: "permanent",
      14: "permanent",
      15: "dead",
      16: "dead",
    };
    for (const [roll, band] of Object.entries(boundaries)) {
      expect(stepper.getByTestId(`roll-option-${roll}`).getAttribute("data-band")).toBe(band);
    }
  });

  it("gives each severity band its own chip + dark-text class in the exported map", () => {
    // LM-27 / MV-7: the map must cover every possible band, and each band text
    // color MUST be a literal dark-on-light string (no navy fill hiding the band).
    expect(ROLL16_VALUES.map((n) => resolveInjury(n).kind)).toEqual([
      "bruise",
      "bruise",
      "bruise",
      "bruise",
      "bruise",
      "bruise",
      "bruise",
      "bruise",
      "apaleado",
      "apaleado",
      "grave",
      "grave",
      "permanent",
      "permanent",
      "dead",
      "dead",
    ]);
    expect(INJURY_OUTCOMES).toEqual([
      "bruise",
      "apaleado",
      "grave",
      "permanent",
      "dead",
    ]);
    for (const kind of INJURY_OUTCOMES) {
      const entry = SEVERITY_CLASS[kind];
      expect(entry.chip).toBeTypeOf("string");
      expect(entry.text).toBeTypeOf("string");
      // text/fill contrast: text class is present and distinct (dark text on a
      // light band fill). A band never relies on the navy selected fill.
      expect(entry.chip).toContain("bg-[#");
      expect(entry.text).not.toBe("");
    }
  });

  it("keeps band identity on a chip selected to confirm (no band-hidden navy fill)", () => {
    const { rerender } = render(
      <RollStepper roll16={13} roll6={""} onRoll16={vi.fn()} onRoll6={vi.fn()} />,
    );
    const selected = screen.getByTestId("roll-option-13");
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.getAttribute("data-band")).toBe("permanent");
    rerender(<RollStepper roll16={8} roll6={""} onRoll16={vi.fn()} onRoll6={vi.fn()} />);
    expect(screen.getByTestId("roll-option-8").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("roll-option-8").getAttribute("data-band")).toBe("bruise");
  });

  it("does not reveal severity on a 1D6 chip (1D6 stays neutral) while permanent", () => {
    const utils = render(
      <RollStepper roll16={14} roll6={3} onRoll16={vi.fn()} onRoll6={vi.fn()} />,
    );
    const roll6 = within(utils.getByTestId("roll-stepper-6"));
    for (const n of Array.from({ length: 6 }, (_, i) => i + 1)) {
      expect(roll6.getByTestId(`roll-option-${n}`).getAttribute("data-band")).toBeNull();
    }
  });
});
