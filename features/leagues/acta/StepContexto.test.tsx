import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { StepContexto } from "./StepContexto";
import { ACTA_WEATHER_OPTIONS, emptyActaState, type ActaState } from "./actaState";

/**
 * s6b corrective — the Contexto step must render its weather option LABELS from
 * the active locale while the option VALUES stay the canonical Spanish strings
 * the payload and DB persist. Assertions use textContent/attributes — this repo
 * has no jest-dom matchers.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";

function renderStep(initialLocale: "es" | "en") {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <StepContexto
        state={emptyActaState()}
        onChange={() => {}}
        homeName={homeName}
        awayName={awayName}
      />
    </I18nProvider>,
  );
}

function weatherSelect(): HTMLSelectElement {
  // The step's only combobox is the weather select; query by role so the helper
  // stays locale-independent.
  return screen.getByRole("combobox") as HTMLSelectElement;
}

function optionTexts(select: HTMLSelectElement): (string | null)[] {
  return Array.from(select.options).map((option) => option.textContent);
}

function optionValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((option) => option.value);
}

describe("StepContexto — weather locale (s6b corrective)", () => {
  it("renders the English weather labels under an English provider, keeping the persisted values", () => {
    renderStep("en");

    const select = weatherSelect();
    expect(optionTexts(select)).toEqual([
      "Perfect",
      "Scorching heat",
      "Very sunny",
      "Rainy",
      "Blizzard",
    ]);
    // The payload/DB value is NEVER translated: it stays the canonical Spanish.
    expect(optionValues(select)).toEqual([...ACTA_WEATHER_OPTIONS]);
  });

  it("keeps the canonical Spanish weather labels under the Spanish provider", () => {
    renderStep("es");

    const select = weatherSelect();
    expect(optionTexts(select)).toEqual([...ACTA_WEATHER_OPTIONS]);
    expect(optionValues(select)).toEqual([...ACTA_WEATHER_OPTIONS]);
  });
});

describe("StepContexto — attendance FF range", () => {
  function ffInput(teamName: string): HTMLInputElement {
    return screen.getByLabelText(`Factor fan · ${teamName}`) as HTMLInputElement;
  }

  it("constrains both Factor fan inputs to the legal attendance range 2..10", () => {
    renderStep("es");

    for (const input of [ffInput(homeName), ffInput(awayName)]) {
      expect(input.getAttribute("min")).toBe("2");
      expect(input.getAttribute("max")).toBe("10");
    }
  });

  it("keeps the unset-omitted behaviour: clearing a Factor fan input yields undefined, not 0", () => {
    let next: ActaState | undefined;
    render(
      <I18nProvider initialLocale="es">
        <StepContexto
          state={emptyActaState()}
          onChange={(state) => {
            next = state;
          }}
          homeName={homeName}
          awayName={awayName}
        />
      </I18nProvider>,
    );

    fireEvent.change(ffInput(homeName), { target: { value: "0" } });
    expect(next?.home.ff).toBeUndefined();
  });
});
