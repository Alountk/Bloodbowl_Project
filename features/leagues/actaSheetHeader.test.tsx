import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { ActaSheetHeader, type ActaTeamLine } from "./actaSheetHeader";

const home: ActaTeamLine = {
  name: "Águilas de Khemri",
  score: 2,
  rerolls: 3,
  bribes: 1,
  fanFactor: { base: 4, dice: 3, total: 7 },
  inducements: [
    { name: "Sobornos", count: 1 },
    { name: "Barriles de Bloodweiser", count: 2 },
  ],
};
const away: ActaTeamLine = {
  name: "Colmillos del Caos",
  score: 1,
  rerolls: 2,
  bribes: 0,
};

function renderHeader(overrides: Partial<Parameters<typeof ActaSheetHeader>[0]> = {}) {
  return render(
    <ActaSheetHeader
      leagueName="Campo de pruebas"
      round={3}
      status="live"
      half={1}
      turnNumber={4}
      home={home}
      away={away}
      weather="sun"
      weatherRoll={4}
      casualtyTurns={[]}
      {...overrides}
    />,
  );
}

describe("ActaSheetHeader — pre-match data lines (S1)", () => {
  it("renders the inducement list per team and omits the line when a team has none", () => {
    const { container } = renderHeader();
    expect(container.textContent).toContain("Inducements: Sobornos ×1, Barriles de Bloodweiser ×2");
    // The away team has no inducements — its block must not render the line.
    expect(container.textContent?.match(/Inducements:/g)).toHaveLength(1);
  });

  it("renders the fan factor roll as base + dice = total when known", () => {
    const { container } = renderHeader();
    expect(container.textContent).toContain("Afición: 4 + 🎲3 = 7");
    // The away team has no fan_factor data — the line is omitted, never invented.
    expect(container.textContent).not.toContain("Afición: 3");
  });

  it("renders the weather roll in the weather line (S4 data surfaced)", () => {
    const { container } = renderHeader();
    expect(container.textContent).toMatch(/Clima: tirada 4 →/);
  });

  it("keeps the plain weather line when no roll is known", () => {
    const { container } = renderHeader({ weatherRoll: null });
    expect(container.textContent).toMatch(/Clima: /);
    expect(container.textContent).not.toContain("tirada");
  });
});

/** One stepper pill of the current half (the TurnChip carries data-turn). */
function pill(container: HTMLElement, turn: number): HTMLElement | null {
  return container.querySelector(`[data-testid="ui-v2-match-stepper"] [data-turn="${turn}"]`);
}

describe("ActaSheetHeader — turn pills tinted by owning side (S3)", () => {
  it("tints done checks and the active background by the owning side when turnSides is provided", () => {
    // T1 home · T2 away · T3 both/unknown · T4 (active) away.
    const { container } = renderHeader({
      turnSides: ["home", "away", null, "away", null, null, null, null],
    });

    // The check icon is an SVG — jsdom exposes its class via the attribute.
    const checkOf = (turn: number) =>
      pill(container, turn)?.querySelector("svg")?.getAttribute("class") ?? "";
    expect(checkOf(1)).toContain("text-navy");
    expect(checkOf(2)).toContain("text-red");
    expect(checkOf(3)).toContain("text-slate");
    // The active pill backgrounds by the ACTIVE side's color (away = red).
    expect(pill(container, 4)?.className).toContain("bg-red");
    expect(pill(container, 4)?.className).not.toContain("bg-navy");
  });

  it("keeps the legacy state styling when turnSides is absent (backwards compatible)", () => {
    const { container } = renderHeader();

    const checkOf = (turn: number) =>
      pill(container, turn)?.querySelector("svg")?.getAttribute("class") ?? "";
    expect(checkOf(1)).toContain("text-navy");
    expect(pill(container, 4)?.className).toContain("bg-navy");
  });

  it("casualty pills keep the red marker semantics regardless of the owning side", () => {
    const { container } = renderHeader({
      casualtyTurns: [2],
      turnSides: ["home", "away", null, "away", null, null, null, null],
    });

    const casualty = pill(container, 2);
    expect(casualty?.className).toContain("border-red/40");
    expect(casualty?.className).toContain("bg-red/10");
    expect(casualty?.className).toContain("text-red");
    // The corner marker dot keeps its red semantics (it marks a casualty).
    expect(casualty?.querySelector("span[aria-hidden]")?.className).toContain("bg-red");
  });
});
