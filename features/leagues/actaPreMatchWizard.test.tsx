import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ActaPreMatchSection,
  ActaPreMatchWizard,
  type ActaPreMatchSnapshot,
} from "./actaPreMatchWizard";

const HOME = "Águilas de Khemri";
const AWAY = "Colmillos del Caos";

function emptySnapshot(): ActaPreMatchSnapshot {
  return {
    fans: { home: null, away: null },
    weather: null,
    weatherDice: { home: null, away: null },
    inducements: { home: [], away: [] },
    inducementsDone: { home: false, away: false },
    kickDice: { home: null, away: null },
    kicking: null,
  };
}

/** Steps 1-3 confirmed for my side: the wizard must open at Paso 4. */
function readySnapshot(): ActaPreMatchSnapshot {
  return {
    fans: { home: { base: 4, dice: 2, total: 6 }, away: null },
    weather: { roll: 7, value: "perfect" },
    weatherDice: { home: 4, away: 3 },
    inducements: { home: [{ id: "bribes", count: 1 }], away: [] },
    inducementsDone: { home: true, away: false },
    kickDice: { home: null, away: null },
    kicking: null,
  };
}

function renderWizard(
  overrides: Partial<ComponentProps<typeof ActaPreMatchWizard>> = {},
) {
  const onCommit = vi.fn();
  const onDismiss = vi.fn();
  const onFinish = vi.fn();
  const dice = { d3: vi.fn(() => 2), d6: vi.fn(() => 5) };
  render(
    <ActaPreMatchWizard
      open
      homeName={HOME}
      awayName={AWAY}
      homeBase={4}
      awayBase={3}
      viewerSide="home"
      snapshot={emptySnapshot()}
      onCommit={onCommit}
      onDismiss={onDismiss}
      onFinish={onFinish}
      dice={dice}
      {...overrides}
    />,
  );
  return { onCommit, onDismiss, onFinish, dice };
}

const dialog = () => screen.getByRole("dialog", { name: "Antes del partido" });
const step = (n: number, name: string) =>
  screen.getByRole("group", { name: `Paso ${n} · ${name}` });

describe("ActaPreMatchWizard — modal «Antes del partido» (S6 · Opción 5)", () => {
  it("closed renders nothing at all", () => {
    renderWizard({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders ONE step at a time, keeps the substitutes note, and never stacks the steps", () => {
    renderWizard();
    expect(dialog()).toBeTruthy();
    expect(step(1, "Los Hinchas")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Paso 2 · El Clima" })).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Paso 3 · Incentivos" }),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Paso 4 · Equipo pateador" }),
    ).toBeNull();
    expect(screen.getByText(/Sustitutos: solo en liga/)).toBeTruthy();
  });

  it("the step rail lists the four rulebook steps in order and marks the active one", () => {
    renderWizard();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    const items = within(rail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Los Hinchas/),
      expect.stringMatching(/El Clima/),
      expect.stringMatching(/Incentivos/),
      expect.stringMatching(/Equipo pateador/),
    ]);
    expect(items[0].getAttribute("aria-current")).toBe("step");
    expect(items[1].getAttribute("aria-current")).toBeNull();
  });

  it("opens at the first step still pending for my side", () => {
    const snapshot = emptySnapshot();
    snapshot.fans.home = { base: 4, dice: 1, total: 5 };
    snapshot.weather = { roll: 7, value: "perfect" };
    snapshot.weatherDice = { home: 4, away: 3 };
    renderWizard({ snapshot });
    expect(step(3, "Incentivos")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Paso 1 · Los Hinchas" })).toBeNull();
  });

  it("the dice button rolls AND records the result directly (no confirm dance)", () => {
    const { onCommit, dice } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D3" }));
    expect(dice.d3).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      step: "fanRoll",
      side: "home",
      line: { base: 4, dice: 2, total: 6 },
    });
    expect(step(1, "Los Hinchas").textContent).toContain("4 + 2 = 6");
    expect(step(1, "Los Hinchas").textContent).toMatch(/Registrado/);
  });

  it("a recorded die plus Siguiente records exactly once (the direct record is the commit)", () => {
    const { onCommit } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("the die button is the only way to enter a roll (no manual field)", () => {
    renderWizard();
    // S7.2: rolls are automatic — the die button is the ONLY entry point.
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByText("Manual")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Tirar / })).toHaveLength(1);
  });

  it("clicking the die plays the roll animation and reveals the result", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D3" }));
    // The die glyph spins on roll; the recorded result is revealed after it.
    expect(screen.getByTestId("die-glyph").className).toMatch(/dice-roll/);
    expect(screen.getByRole("status").className).toMatch(/dice-reveal/);
  });

  it("Atrás returns to the previous step without recording anything", () => {
    const { onCommit } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(step(1, "Los Hinchas")).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("capture stays per side: my single die control, no rival controls", () => {
    renderWizard();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /^Tirar / })).toHaveLength(1);
  });

  it("the weather step shows the rival's confirmed die read-only and resolves the 2D6 live", () => {
    const snapshot = emptySnapshot();
    snapshot.fans.home = { base: 4, dice: 1, total: 5 };
    snapshot.weatherDice.away = 3;
    renderWizard({ snapshot, dice: { d3: vi.fn(() => 2), d6: vi.fn(() => 4) } });
    const weather = step(2, "El Clima");
    expect(
      within(weather).getByText(/Colmillos del Caos: 3/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6" }));
    expect(weather.textContent).toMatch(/2D6 = 7/);
    expect(weather.textContent).toContain("Clima perfecto");
    expect(
      within(weather).getByRole("table", { name: "Tabla oficial de clima" }),
    ).toBeTruthy();
  });

  it("the incentives step shows price/cap, honors the cap and records my cart on advance", () => {
    const snapshot = emptySnapshot();
    snapshot.fans.home = { base: 4, dice: 1, total: 5 };
    snapshot.weather = { roll: 7, value: "perfect" };
    snapshot.weatherDice = { home: 4, away: 3 };
    const { onCommit } = renderWizard({ snapshot });
    const incentives = step(3, "Incentivos");
    expect(incentives.textContent).toContain("100.000");
    const add = () =>
      fireEvent.click(
        within(incentives).getByRole("button", { name: "Añadir Sobornos" }),
      );
    add();
    add();
    add();
    add(); // cap = 3
    fireEvent.click(
      screen.getByRole("button", { name: "Avanzar al Equipo pateador" }),
    );
    expect(onCommit).toHaveBeenCalledWith({
      step: "inducements",
      side: "home",
      items: [{ id: "bribes", count: 3 }],
    });
  });

  it("the kick step: the winner's coach decides who kicks and Finalizar closes the wizard", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 5, away: 3 };
    const { onCommit, onFinish } = renderWizard({ snapshot });
    const kick = step(4, "Equipo pateador");
    expect(kick.textContent).toMatch(/Gana/);
    fireEvent.click(
      within(kick).getByRole("button", { name: "Patea Colmillos del Caos" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(onCommit).toHaveBeenCalledWith({
      step: "kicking",
      kicking: "away",
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("a kick tie forces the shared re-roll", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 4, away: 4 };
    const { onCommit } = renderWizard({ snapshot });
    fireEvent.click(screen.getByRole("button", { name: "Repetir tirada" }));
    expect(onCommit).toHaveBeenCalledWith({ step: "kickTie" });
  });

  it("the loser's coach gets no decision controls and can still finish", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 2, away: 5 };
    const { onCommit, onFinish } = renderWizard({ snapshot });
    expect(
      screen.queryByRole("group", { name: "Quién patea" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Cerrar dismisses the modal without finishing", () => {
    const { onDismiss, onFinish } = renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });
});

/** Both sides complete with a DECIDED toss (6–2, the winner sends the rival
 * to kick) — the state the mocked demo dice can never reach on their own. */
function completeSnapshot(): ActaPreMatchSnapshot {
  return {
    fans: {
      home: { base: 4, dice: 2, total: 6 },
      away: { base: 3, dice: 1, total: 4 },
    },
    weather: { roll: 8, value: "perfect" },
    weatherDice: { home: 5, away: 3 },
    inducements: {
      home: [{ id: "bribes", count: 1 }],
      away: [{ id: "weather-mage", count: 1 }],
    },
    inducementsDone: { home: true, away: true },
    kickDice: { home: 6, away: 2 },
    kicking: "away",
  };
}

describe("ActaPreMatchSection — S7 derived states (derived only, no new flags)", () => {
  it("both complete + decided toss: ONE grouped display with every phase, the winner and who kicks — and no edit trigger", () => {
    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        snapshot={completeSnapshot()}
        onCommit={() => undefined}
      />,
    );
    const summary = screen.getByRole("region", { name: "Lo que ha sucedido" });
    for (const phase of ["Afición", "Clima", "Incentivos", "Sorteo"]) {
      expect(summary.textContent).toMatch(new RegExp(phase));
    }
    expect(summary.textContent).toMatch(/gana Águilas de Khemri/);
    expect(summary.textContent).toMatch(/Patea: Colmillos del Caos/);
    // S7.3: no trigger once my sequence is complete.
    expect(
      screen.queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
  });
});
