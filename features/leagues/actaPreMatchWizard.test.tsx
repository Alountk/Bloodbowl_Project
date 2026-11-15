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
  const dice = { d3: vi.fn(() => 2), d6: vi.fn(() => 5) };
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
