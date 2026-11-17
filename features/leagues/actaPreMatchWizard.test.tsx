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

/** S8 · T7/U9 finance fixture (PRE_MATCH_FINANCE of actaFlow.fixtures,
 * inlined so the wizard suite stays self-contained). */
const FINANCE = {
  home: { value: 1_240_000, treasury: 1_000_000, raceId: "tomb-kings" },
  away: { value: 1_160_000, treasury: 10_000, raceId: "orc" },
};

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
  const dice = { d3: vi.fn(() => 2), d6: vi.fn(() => 5), d16: vi.fn(() => 7) };
  const props: ComponentProps<typeof ActaPreMatchWizard> = {
    open: true,
    homeName: HOME,
    awayName: AWAY,
    homeBase: 4,
    awayBase: 3,
    viewerSide: "home",
    finance: FINANCE,
    snapshot: emptySnapshot(),
    onCommit,
    onDismiss,
    onFinish,
    dice,
    ...overrides,
  };
  const view = render(<ActaPreMatchWizard {...props} />);
  const rerender = (
    next: Partial<ComponentProps<typeof ActaPreMatchWizard>> = {},
  ) => view.rerender(<ActaPreMatchWizard {...props} {...next} />);
  return { onCommit, onDismiss, onFinish, dice, rerender };
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

  it("the die cannot be rolled again once it has been recorded", () => {
    renderWizard();
    const die = screen.getByRole("button", { name: "Tirar 1D3" });
    expect((die as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(die);
    const after = screen.getByRole("button", { name: "Tirar 1D3" });
    expect((after as HTMLButtonElement).disabled).toBe(true);
    expect(step(1, "Los Hinchas").textContent).toMatch(/Registrado/);
  });

  it("the wizard cannot advance until the die of the step is rolled", () => {
    renderWizard();
    expect(
      (
        screen.getByRole("button", { name: "Avanzar al Clima" }) as
          | HTMLButtonElement
          | null
      )?.disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D3" }));
    expect(
      (screen.getByRole("button", { name: "Avanzar al Clima" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    expect(
      (
        screen.getByRole("button", { name: "Avanzar a Incentivos" }) as
          HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6" }));
    expect(
      (
        screen.getByRole("button", { name: "Avanzar a Incentivos" }) as
          HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("the wizard only moves forward: after a step there is no way back", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    expect(step(2, "El Clima")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Atrás" })).toBeNull();
  });

  it("the kick step cannot finish on a tie: re-roll first, then it unlocks", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 5, away: 5 };
    const { rerender } = renderWizard({ snapshot });
    const finish = () =>
      screen.getByRole("button", { name: "Finalizar" }) as HTMLButtonElement;
    expect(finish().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Repetir tirada" }));
    // The reducer clears BOTH dice on kickTie — model that transition, then
    // the die unlocks for the shared re-roll.
    rerender({ snapshot: { ...snapshot, kickDice: { home: null, away: null } } });
    expect(finish().disabled).toBe(true); // dice cleared — nothing to finish on
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6" }));
    expect(finish().disabled).toBe(false);
  });

  it("the winner finishes the kick step without picking who receives (that comes after)", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 5, away: 3 };
    const { onCommit, onFinish } = renderWizard({ snapshot });
    const finish = () =>
      screen.getByRole("button", { name: "Finalizar" }) as HTMLButtonElement;
    // Die in + toss resolved → nothing else gates the wizard's last step.
    expect(finish().disabled).toBe(false);
    fireEvent.click(finish());
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalledWith({
      step: "kicking",
      kicking: expect.anything(),
    });
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

  it("the kick step shows the toss only: the receiver choice lives OUTSIDE the wizard", () => {
    const snapshot = readySnapshot();
    snapshot.kickDice = { home: 5, away: 3 };
    const { onFinish } = renderWizard({ snapshot });
    const kick = step(4, "Equipo pateador");
    expect(kick.textContent).toMatch(/Gana/);
    expect(screen.queryByRole("group", { name: "Quién patea" })).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Patea / })).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
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
        finance={FINANCE}
        snapshot={completeSnapshot()}
        onCommit={() => undefined}
      />,
    );
    const summary = screen.getByRole("region", { name: "Lo que ha sucedido" });
    for (const phase of ["Afición", "Clima", "Incentivos", "Sorteo"]) {
      expect(summary.textContent).toMatch(new RegExp(phase));
    }
    expect(summary.textContent).toMatch(/gana Águilas de Khemri/);
    expect(summary.textContent).toMatch(/Recibe: Águilas de Khemri/);
    // S7.3: no trigger once my sequence is complete.
    expect(
      screen.queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
    // The receiver was already decided here → no pending picker.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
  });

  it("only the toss WINNER gets the receiver picker after the sequence (inputs styled as buttons)", () => {
    const snapshot = completeSnapshot();
    snapshot.kicking = null;
    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        finance={FINANCE}
        snapshot={snapshot}
        onCommit={() => undefined}
      />,
    );
    const picker = screen.getByRole("group", {
      name: "¿Quién recibe el balón?",
    });
    expect(within(picker).getAllByRole("radio")).toHaveLength(2);
    expect(within(picker).getByRole("radio", { name: `Recibe ${HOME}` })).toBeTruthy();
    expect(within(picker).getByRole("radio", { name: `Recibe ${AWAY}` })).toBeTruthy();
    const accept = within(picker).getByRole("button", {
      name: "Aceptar",
    }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    // The grouped display stays; the sequence remains closed (S7.3).
    expect(screen.getByRole("region", { name: "Lo que ha sucedido" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
  });

  it("picking who receives and pressing Aceptar records who KICKS", () => {
    const snapshot = completeSnapshot();
    snapshot.kicking = null;
    const onCommit = vi.fn();
    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        finance={FINANCE}
        snapshot={snapshot}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: `Recibe ${AWAY}` }));
    const accept = screen.getByRole("button", {
      name: "Aceptar",
    }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    fireEvent.click(accept);
    // The receiver's rival is the team that kicks.
    expect(onCommit).toHaveBeenCalledWith({ step: "kicking", kicking: "home" });
  });

  it("the toss loser waits for the winner's receiver decision instead of picking", () => {
    const snapshot = completeSnapshot();
    snapshot.kicking = null;
    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="away"
        finance={FINANCE}
        snapshot={snapshot}
        onCommit={() => undefined}
      />,
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(
      screen.getByText(
        /Esperando a que Águilas de Khemri decida quién recibe el balón/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Lo que ha sucedido" })).toBeTruthy();
  });
});

/** Steps 1-2 confirmed for BOTH sides — the wizard opens at Paso 3. */
function step3Snapshot(): ActaPreMatchSnapshot {
  return {
    ...emptySnapshot(),
    fans: {
      home: { base: 4, dice: 1, total: 5 },
      away: { base: 3, dice: 1, total: 4 },
    },
    weather: { roll: 7, value: "perfect" },
    weatherDice: { home: 4, away: 3 },
  };
}

describe("ActaPreMatchWizard — S8 · dinero disponible, categorías y Star Players (T7/U9)", () => {
  it("viewer home (mayor VE): the money panel shows the treasury as DISPONIBLE TOTAL with gastado/restante", () => {
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "home" });
    const panel = screen.getByRole("group", { name: "Dinero disponible" });
    expect(panel.textContent).toContain("DISPONIBLE TOTAL");
    expect(panel.textContent).toContain("1.000.000 M.O.");
    expect(panel.textContent).toContain("De tu Tesorería");
    expect(panel.textContent).toContain("Gastado 0 M.O.");
    expect(panel.textContent).toContain("Restante 1.000.000 M.O.");
  });

  it("viewer away (menor VE) with the rival committed: the 140.000 worked example with its desglose", () => {
    const snapshot = step3Snapshot();
    snapshot.inducements.home = [{ id: "bloodweiser-kegs", count: 1 }];
    snapshot.inducementsDone.home = true;
    renderWizard({ snapshot, viewerSide: "away" });
    const panel = screen.getByRole("group", { name: "Dinero disponible" });
    expect(panel.textContent).toContain("Presupuesto de Caja Menor");
    expect(panel.textContent).toContain("140.000 M.O.");
    expect(panel.textContent).toMatch(/ΔVE \(Diferencial\): \+80\.000/);
    expect(panel.textContent).toMatch(/\+ Gasto rival en Tesorería: \+50\.000/);
    expect(panel.textContent).toMatch(/= Efectivo en Caja Menor: 130\.000/);
    expect(panel.textContent).toMatch(/Aportación de tu Tesorería: \+10\.000/);
    expect(screen.getByText(/Lo que no gaste se pierde/)).toBeTruthy();
  });

  it("the catalog renders the numbered category groups in rulebook order", () => {
    renderWizard({ snapshot: step3Snapshot() });
    for (const name of [
      "01 · Afición y banquillo",
      "02 · Árbitro y suerte",
      "03 · Salud del plantil",
      "04 · Magia y preparación",
      "06 · Plantilla — Mercenarios",
    ]) {
      expect(screen.getByRole("group", { name })).toBeTruthy();
    }
  });

  it("the Griff Oberwald star card shows price, minimal stats, skills and «Juega por» BEFORE hiring", () => {
    renderWizard({ snapshot: step3Snapshot() });
    const card = screen.getByRole("group", { name: "Griff Oberwald" });
    expect(card.textContent).toContain("300.000 M.O.");
    const table = within(card).getByRole("table", {
      name: "Estadísticas de Griff Oberwald",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["MA", "ST", "AG", "PA", "AV"]);
    expect(
      within(table)
        .getAllByRole("cell")
        .map((td) => td.textContent),
    ).toEqual(["7", "4", "2+", "3+", "9+"]);
    expect(within(card).getByText("Block")).toBeTruthy();
    expect(card.textContent).toContain("Juega por: Old World Classic");
  });

  it("«Fichar Griff Oberwald» is disabled under the petty-cash budget and enabled for the mayor treasury; hiring adds ×1 and reveals «Quitar»", () => {
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "away" });
    // Menor VE: 80.000 ΔVE + 0 rival + 10.000 tesorería < 300.000.
    const ficharAway = screen.getByRole("button", {
      name: "Fichar Griff Oberwald",
    }) as HTMLButtonElement;
    expect(ficharAway.disabled).toBe(true);
    // Mayor VE: 1.000.000 de tesorería — fichar is open.
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "home" });
    const fichar = screen.getAllByRole("button", {
      name: "Fichar Griff Oberwald",
    })[1] as HTMLButtonElement;
    expect(fichar.disabled).toBe(false);
    fireEvent.click(fichar);
    expect(screen.getAllByText("×1").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quitar Griff Oberwald" })).toHaveLength(1);
  });

  it("the Mercenarios row is a reserved dynamic-cost placeholder: no stepper, «EN DESARROLLO»", () => {
    renderWizard({ snapshot: step3Snapshot() });
    expect(screen.queryByRole("button", { name: "Añadir Mercenarios" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar Mercenarios" })).toBeNull();
    expect(screen.getByText("EN DESARROLLO")).toBeTruthy();
    expect(screen.getByText("Mercenarios de Alquiler")).toBeTruthy();
  });

  it("the step-3 footer tracks the money: gastado and disponible with the rulebook figures", () => {
    renderWizard({ snapshot: step3Snapshot() });
    expect(
      screen.getByText(
        /Paso 3 de 4 · Gastado 0 M\.O\. · Disponible 1\.000\.000 M\.O\./,
      ),
    ).toBeTruthy();
  });

  it("TRIANGULATE: an unconfirmed rival leaves its treasury spend at +0 · pendiente in the desglose", () => {
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "away" });
    const panel = screen.getByRole("group", { name: "Dinero disponible" });
    expect(panel.textContent).toMatch(
      /\+ Gasto rival en Tesorería: \+0 · pendiente/,
    );
    expect(panel.textContent).toMatch(/= Efectivo en Caja Menor: 80\.000/);
  });

  it("TRIANGULATE: the + gate honors the remaining budget, not only the cap", () => {
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "home" });
    const addTraining = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Añadir Entrenamiento Adicional" }),
      );
    for (let i = 0; i < 8; i += 1) addTraining(); // 800.000 de 1.000.000
    const chef = screen.getByRole("button", {
      name: "Añadir Chef Master Halfling",
    }) as HTMLButtonElement;
    expect(chef.disabled).toBe(true); // 300.000 > restante 200.000
    const wizard = screen.getByRole("button", {
      name: "Añadir Mago",
    }) as HTMLButtonElement;
    expect(wizard.disabled).toBe(false); // 150.000 cabe
  });

  it("TRIANGULATE: ineligible rows are dimmed, badged and reasoned — never purchasable", () => {
    renderWizard({ snapshot: step3Snapshot(), viewerSide: "home" });
    // tomb-kings no lleva «Señores de los No Muertos» (IND-5, digest md:532).
    const add = screen.getByRole("button", {
      name: "Añadir Asistente de Morgue",
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getAllByText("No elegible").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/No elegible: requiere Señores de los No Muertos/),
    ).toBeTruthy();
  });
});

/**
 * T29 (user L95): the «Plegarias a Nuffle» reveal step is the ONLY MANUAL roll
 * of this part — «esta de aqui es la unica tirada de esta parte que debemos de
 * dar la opcion de manual». The coach throws the REAL 1D16 and enters the
 * result in a 1-16 numeric control per prayer (the auto-roll die BUTTON —
 * roll AND record — is retired from this step; every other step's die button
 * stays). T30 (user L98): an optional «Tirar automático» button BEFORE
 * «Aceptar» fills the manual input with a real 1D16 (injected rng) — the
 * coach can still edit it; manual remains the main path. «Aceptar» commits
 * and LOCKS the result (irreversible — the input
 * disappears into the revealed blessing, including remount/hydration). The
 * rulebook repeat rule («repitiendo cualquier resultado que ya hayas
 * obtenido») is enforced at «Aceptar» time: a result already ACCEPTED by
 * another prayer of the same team is refused with «Resultado repetido…» and
 * nothing commits; equal values on UNACCEPTED inputs are just edits. Rolls
 * persist per team as accepted (the demo `activePrayers` producer). Without
 * prayers: NO step, NO state change (pinned).
 */
/** Steps 1-3 confirmed with «Plegarias a Nuffle» ×count in MY cart — the
 *  wizard must open at the reveal step (first pending). */
function prayersSnapshot(count = 2): ActaPreMatchSnapshot {
  return {
    ...step3Snapshot(),
    inducements: { home: [{ id: "prayers-to-nuffle", count }], away: [] },
    inducementsDone: { home: true, away: false },
  };
}

describe("ActaPreMatchWizard — T29 · «Plegarias a Nuffle» manual entry + accept-lock (L95)", () => {
  /** One prayer's card — «Plegaria {n} de {total} · {equipo}». */
  const card = (n: number, total = 2) =>
    within(step(4, "Plegarias a Nuffle")).getByRole("group", {
      name: `Plegaria ${n} de ${total} · ${HOME}`,
    });
  const inputOf = (el: HTMLElement) =>
    within(el).getByRole("spinbutton") as HTMLInputElement;
  const acceptOf = (el: HTMLElement) =>
    within(el).getByRole("button", { name: "Aceptar" });
  const enter = (el: HTMLElement, value: string) =>
    fireEvent.change(inputOf(el), { target: { value } });

  it("WITHOUT prayers bought there is NO reveal step — the four pinned rulebook steps stay byte-identical", () => {
    // WHY (characterization + boundary pin): «no step shown unless count > 0».
    renderWizard({ snapshot: step3Snapshot() });
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    expect(
      within(rail)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "✓ 1 · Los Hinchas",
      "✓ 2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
    ]);
    expect(
      screen.queryByRole("group", { name: "Paso 4 · Plegarias a Nuffle" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Tirar 1D16" })).toBeNull();
  });

  it("WITH «Plegarias a Nuffle» ×N the wizard inserts «Plegarias a Nuffle» right after Incentivos and opens at it", () => {
    renderWizard({ snapshot: prayersSnapshot(2) });
    expect(step(4, "Plegarias a Nuffle")).toBeTruthy();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    expect(
      within(rail)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "✓ 1 · Los Hinchas",
      "✓ 2 · El Clima",
      "✓ 3 · Incentivos",
      "4 · Plegarias a Nuffle",
      "5 · Equipo pateador",
    ]);
  });

  it("per prayer a 1-16 numeric input replaces the auto-roll die button; «Aceptar» reveals the blessing and commits the result", () => {
    const { onCommit, dice } = renderWizard({ snapshot: prayersSnapshot(2) });
    // WHY (L95, kept byte-identical): the auto-roll die BUTTON (roll AND
    // record) is still absent from this step — T30's «Tirar automático» only
    // FILLS the manual input (manual stays the main path).
    expect(screen.queryByRole("button", { name: "Tirar 1D16" })).toBeNull();
    const first = card(1);
    expect(inputOf(first).getAttribute("min")).toBe("1");
    expect(inputOf(first).getAttribute("max")).toBe("16");
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 10,
    });
    expect(first.textContent).toContain("Pase perfecto");
    // WHY (T30 pin update): the effect copy moved from the UI's local
    // paraphrase into the model as the VERBATIM rulebook text (L98: full
    // detail visible for every blessing).
    expect(first.textContent).toContain(
      "Cualquier jugador de tu equipo que logre realizar un Pase completo ganará 2 PE en lugar de 1.",
    );
    const second = card(2);
    enter(second, "13");
    fireEvent.click(acceptOf(second));
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 13,
    });
    expect(second.textContent).toContain("¡Con faltas y a lo loco!");
    // WHY (T30 pin update): same — verbatim rulebook effect (was «Causar una
    // Lesión con una Falta otorga +2 SPP.»).
    expect(second.textContent).toContain(
      "Cualquier jugador de tu equipo que provoque una Lesión como resultado de una acción de Falta gana 2 PE.",
    );
    // Manual entry touches NO RNG (the dice belong to the OTHER steps — and
    // to T30's explicit «Tirar automático» button, not clicked here).
    expect(dice.d3).not.toHaveBeenCalled();
    expect(dice.d6).not.toHaveBeenCalled();
    expect(dice.d16).not.toHaveBeenCalled();
  });

  it("out-of-range or non-numeric results are REJECTED with the pinned inline error and nothing commits", () => {
    const { onCommit } = renderWizard({ snapshot: prayersSnapshot(1) });
    const first = card(1, 1);
    const pinned = "Introduce un número entero del 1 al 16.";
    // Empty (a non-numeric entry sanitizes the number input to empty).
    fireEvent.click(acceptOf(first));
    expect(within(first).getByText(pinned)).toBeTruthy();
    enter(first, "abc");
    fireEvent.click(acceptOf(first));
    expect(within(first).getByText(pinned)).toBeTruthy();
    for (const bad of ["0", "17", "3.5"]) {
      enter(first, bad);
      fireEvent.click(acceptOf(first));
      expect(within(first).getByText(pinned)).toBeTruthy();
    }
    expect(onCommit).not.toHaveBeenCalled();
    // The pinned error clears as soon as a valid 1-16 integer is accepted.
    enter(first, "16");
    fireEvent.click(acceptOf(first));
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 16,
    });
  });

  it("«Aceptar» LOCKS the prayer for good: the input disappears into the revealed blessing and no rerender brings it back", () => {
    const { rerender } = renderWizard({ snapshot: prayersSnapshot(2) });
    const first = card(1);
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    // Locked where it was accepted — nothing left to edit.
    expect(within(first).queryByRole("spinbutton")).toBeNull();
    expect(within(first).queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(within(first).getByRole("status").textContent).toBe("Registrado");
    expect(first.textContent).toContain("Pase perfecto");
    // ONLY the other prayer is still editable.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    // The parent round-trip (the snapshot gains the accepted roll) never
    // reopens the locked slot either.
    rerender({
      snapshot: { ...prayersSnapshot(2), prayerRolls: { home: [10], away: [] } },
    });
    const after = card(1);
    expect(within(after).queryByRole("spinbutton")).toBeNull();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(after.textContent).toContain("Pase perfecto");
  });

  it("«Aceptar» with a result already ACCEPTED by this team is REJECTED («Resultado repetido…») and nothing commits", () => {
    const { onCommit } = renderWizard({ snapshot: prayersSnapshot(2) });
    const first = card(1);
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    const second = card(2);
    enter(second, "10");
    fireEvent.click(acceptOf(second));
    // Pinned warning; the repeat commits NOTHING and the input stays open.
    expect(
      within(second).getByText(
        "Resultado repetido: vuelve a tirar el 1D16 en mesa.",
      ),
    ).toBeTruthy();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(within(second).getByRole("spinbutton")).toBeTruthy();
    // Editing to a fresh result accepts normally (the draft is just an edit).
    enter(second, "13");
    fireEvent.click(acceptOf(second));
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenLastCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 13,
    });
  });

  it("TRIANGULATE · the duplicate rule is per TEAM: the rival's accepted result never blocks mine", () => {
    const { onCommit } = renderWizard({
      snapshot: { ...prayersSnapshot(1), prayerRolls: { home: [], away: [13] } },
    });
    const first = card(1, 1);
    enter(first, "13");
    fireEvent.click(acceptOf(first));
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 13,
    });
  });

  it("equal values on UNACCEPTED inputs are just edits — the duplicate rule bites only against ACCEPTED rolls", () => {
    const { onCommit } = renderWizard({ snapshot: prayersSnapshot(2) });
    const first = card(1);
    const second = card(2);
    enter(first, "5");
    enter(second, "5");
    // Two open drafts holding the same value: no warning, nothing locked.
    expect(step(4, "Plegarias a Nuffle").textContent).not.toContain(
      "Resultado repetido",
    );
    fireEvent.click(acceptOf(second)); // 5 accepted on the SECOND prayer.
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 5,
    });
    // Now the first input's 5 repeats an ACCEPTED roll → rejected.
    fireEvent.click(acceptOf(first));
    expect(
      within(first).getByText(
        "Resultado repetido: vuelve a tirar el 1D16 en mesa.",
      ),
    ).toBeTruthy();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("a NON-SPP result is never invented as engine behavior: the reveal shows its FULL rulebook detail + the honest «Efecto en mesa (este motor no lo aplica)» note", () => {
    // WHY (T30 rewrite): this pin held «Bendición no modelada…» for roll 7 —
    // user L98 ordered ALL 16 rows modeled with full detail, so roll 7 now
    // reveals «Tacos engrasados» + its verbatim effect; the honest note
    // changed to «Efecto en mesa (este motor no lo aplica)».
    const { onCommit } = renderWizard({ snapshot: prayersSnapshot(1) });
    const first = card(1, 1);
    enter(first, "7");
    fireEvent.click(acceptOf(first));
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 7,
    });
    expect(first.textContent).toContain("Tacos engrasados");
    expect(first.textContent).toContain(
      "el atributo MV de ese jugador se reduce en 1 (hasta un mínimo de 1).",
    );
    expect(first.textContent).toContain(
      "Efecto en mesa (este motor no lo aplica)",
    );
    expect(first.textContent).not.toContain("Bendición no modelada");
    expect(first.textContent).not.toContain("+ SPP");
  });

  it("T30 · the OCR-completed rows 1-2 render their full effect text in the reveal", () => {
    renderWizard({ snapshot: prayersSnapshot(2) });
    const first = card(1);
    enter(first, "1");
    fireEvent.click(acceptOf(first));
    expect(first.textContent).toContain("Trampilla traicionera");
    expect(first.textContent).toContain(
      "éste rebota desde la casilla de la trampilla.",
    );
    const second = card(2);
    enter(second, "2");
    fireEvent.click(acceptOf(second));
    expect(second.textContent).toContain("Amigo del árbitro");
    expect(second.textContent).toContain("«Ahora que lo dices...»");
  });

  it("T30 · the «+ SPP» chip marks the SPP blessings (10/11/12/13) — the rest never carry it", () => {
    renderWizard({ snapshot: prayersSnapshot(3) });
    const first = card(1, 3);
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    expect(within(first).getByText("+ SPP")).toBeTruthy();
    const second = card(2, 3);
    enter(second, "13");
    fireEvent.click(acceptOf(second));
    expect(within(second).getByText("+ SPP")).toBeTruthy();
    const third = card(3, 3);
    enter(third, "5");
    fireEvent.click(acceptOf(third));
    expect(within(third).queryByText("+ SPP")).toBeNull();
    expect(
      within(third).getByText("Efecto en mesa (este motor no lo aplica)"),
    ).toBeTruthy();
  });

  it("T31 · «Tirar automático» AUTO-ACCEPTS the roll (L101: no sense in repeating after an auto roll)", () => {
    const { onCommit, dice } = renderWizard({ snapshot: prayersSnapshot(1) });
    const first = card(1, 1);
    const auto = within(first).getByRole("button", {
      name: "Tirar automático",
    });
    // WHY (T31, user L101 verbatim): «si tira de manera automática la tirada
    // es autoaceptada. No tiene sentido que deje repetir la tirada» — one
    // die roll commits and locks directly; no input, no «Aceptar» step.
    dice.d16.mockReturnValue(7);
    fireEvent.click(auto);
    expect(dice.d16).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 7,
    });
    expect(within(first).queryByRole("spinbutton")).toBeNull();
    expect(
      within(first).queryByRole("button", { name: "Aceptar" }),
    ).toBeNull();
    expect(
      within(first).queryByRole("button", { name: "Tirar automático" }),
    ).toBeNull();
  });

  it("T31 · an auto roll that repeats an accepted result INFORMS the coach instead of silently re-taking (L101/L102)", () => {
    const { onCommit, dice } = renderWizard({ snapshot: prayersSnapshot(2) });
    const first = card(1);
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    const second = card(2);
    const auto = () =>
      fireEvent.click(
        within(second).getByRole("button", { name: "Tirar automático" }),
      );
    // WHY (T31, user L102): a repeat is INFORMED, never silently re-taken —
    // «creo que lo mejor es informar que tiene que tirar de nuevo porque esa
    // ya la tiene». Same pinned copy as the manual path.
    dice.d16.mockReturnValue(10);
    auto();
    expect(
      within(second).getByText(
        "Resultado repetido: vuelve a tirar el 1D16 en mesa.",
      ),
    ).toBeTruthy();
    expect(onCommit).toHaveBeenCalledTimes(1);
    // Throwing again (auto or manual) to a fresh result accepts.
    dice.d16.mockReturnValue(14);
    auto();
    expect(onCommit).toHaveBeenLastCalledWith({
      step: "prayersRoll",
      side: "home",
      roll: 14,
    });
    expect(
      within(second).queryByText("Resultado repetido"),
    ).toBeNull();
    expect(
      within(second).queryByRole("button", { name: "Aceptar" }),
    ).toBeNull();
  });

  it("the sequence cannot leave the reveal step until every bought prayer has its own accepted result", () => {
    renderWizard({ snapshot: prayersSnapshot(2) });
    const next = () =>
      screen.getByRole("button", {
        name: "Avanzar al Equipo pateador",
      }) as HTMLButtonElement;
    expect(next().disabled).toBe(true);
    const first = card(1);
    enter(first, "10");
    fireEvent.click(acceptOf(first));
    expect(next().disabled).toBe(true);
    const second = card(2);
    enter(second, "11");
    fireEvent.click(acceptOf(second));
    expect(next().disabled).toBe(false);
  });

  it("remount/hydration keeps accepted rolls LOCKED: persisted rolls render their blessing with no input and no «Aceptar»", () => {
    renderWizard({
      snapshot: { ...prayersSnapshot(2), prayerRolls: { home: [10], away: [] } },
    });
    // One roll of two is still out → the reveal step opens here.
    const first = card(1);
    expect(first.textContent).toContain("Pase perfecto");
    expect(within(first).queryByRole("spinbutton")).toBeNull();
    expect(within(first).queryByRole("button", { name: "Aceptar" })).toBeNull();
    const second = card(2);
    expect(within(second).getByRole("spinbutton")).toBeTruthy();
    expect(within(second).getByRole("button", { name: "Aceptar" })).toBeTruthy();
  });

  it("rolls already persisted (reload) read DONE: the wizard skips the reveal step and the rail marks it ✓", () => {
    renderWizard({
      snapshot: {
        ...prayersSnapshot(2),
        prayerRolls: { home: [10, 13], away: [] },
      },
    });
    // firstPending moves past the reveal step — straight to Paso 5.
    expect(step(5, "Equipo pateador")).toBeTruthy();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    expect(
      within(rail)
        .getAllByRole("listitem")
        .map((item) => item.textContent)[3],
    ).toBe("✓ 4 · Plegarias a Nuffle");
  });
});

describe("ActaPreMatchSection — T28 · the granted blessings on the pre-match displays", () => {
  it("«Lo que ha sucedido» (report) lists the granted blessings per side — names verbatim (T30: every face resolves; junk rolls keep the honest fallback)", () => {
    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        finance={FINANCE}
        snapshot={{
          ...emptySnapshot(),
          prayerRolls: { home: [10, 7], away: [13] },
        }}
        onCommit={() => undefined}
      />,
    );
    const report = screen.getByRole("region", { name: "Lo que ha sucedido" });
    // WHY (T30 pin update): roll 7 was «🎲7 sin modelar» under the T25
    // partial table; user L98 modeled ALL 16 rows, so it now reads its
    // verbatim name.
    expect(report.textContent).toContain(
      "Plegarias — Águilas de Khemri: Pase perfecto, Tacos engrasados",
    );
    expect(report.textContent).toContain(
      "Plegarias — Colmillos del Caos: ¡Con faltas y a lo loco!",
    );
  });

  it("the grouped summary carries a «Plegarias» phase row with the granted names — and NO row when nobody rolled (byte-identical pin)", () => {
    const blessed = render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        finance={FINANCE}
        snapshot={{
          ...completeSnapshot(),
          prayerRolls: { home: [10], away: [13] },
        }}
        onCommit={() => undefined}
      />,
    );
    const summary = screen.getByRole("region", { name: "Lo que ha sucedido" });
    expect(summary.textContent).toContain("Plegarias");
    expect(summary.textContent).toContain("Pase perfecto");
    expect(summary.textContent).toContain("¡Con faltas y a lo loco!");
    blessed.unmount();

    render(
      <ActaPreMatchSection
        homeName={HOME}
        awayName={AWAY}
        homeBase={4}
        awayBase={3}
        viewerSide="home"
        finance={FINANCE}
        snapshot={completeSnapshot()}
        onCommit={() => undefined}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Lo que ha sucedido" }).textContent,
    ).not.toContain("Plegarias");
  });
});
