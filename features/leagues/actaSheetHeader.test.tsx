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
