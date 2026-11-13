import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActaDemoHarness } from "./actaDemoHarness";

// Deterministic dice for die-button rolls (S7.2: the die button is the only
// roll entry — the quiet manual override is gone).
vi.mock("@/lib/random", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/random")>();
  return { ...actual, rollD3: () => 2, rollD6: () => 5 };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ante = () => screen.getByRole("region", { name: "Antes del partido" });
const perspective = (team: string) =>
  within(screen.getByRole("group", { name: "Ver como:" })).getByRole("button", {
    name: team,
  });
const wizard = () => screen.getByRole("dialog", { name: "Antes del partido" });
const openWizard = () =>
  fireEvent.click(
    within(ante()).getByRole("button", { name: /secuencia pre-partido/ }),
  );

/** Fresh pre-match (Restablecer wipes the capture): the wizard reopens at
 * Paso 1 for my side. */
const freshSequence = () => {
  fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  openWizard();
};

/** The four wizard steps as ONE coach (dice mocked: 1D3→2, 1D6→5). */
const walkSequence = () => {
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar a Incentivos" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Avanzar al Equipo pateador" }),
  );
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
  fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
};

describe("ActaDemoHarness — Antes del partido (S6 · modal wizard)", () => {
  it("the acta section reports what happened; the four steps live in the modal wizard", () => {
    render(<ActaDemoHarness />);
    const headings = within(ante()).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Lo que ha sucedido",
    ]);
    openWizard();
    expect(wizard()).toBeTruthy();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    const items = within(rail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/Los Hinchas/),
      expect.stringMatching(/El Clima/),
      expect.stringMatching(/Incentivos/),
      expect.stringMatching(/Equipo pateador/),
    ]);
  });

  it("recording MY fan roll in the wizard derives my header Afición line and leaves the rival's alone", () => {
    render(<ActaDemoHarness />);
    // The demo fixture already captured both sides' rolls.
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲3 = 7/);
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲2 = 5/);
    openWizard();
    // The fixture captured my steps 1-2 → the wizard resumes at Paso 3.
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    expect(document.body.textContent).not.toMatch(/Afición: 4 \+ 🎲3 = 7/);
    // The rival's confirmed line stays untouched (per-side capture).
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲2 = 5/);
  });

  it("switching «Ver como:» swaps the wizard capture to the other coach's own side", () => {
    render(<ActaDemoHarness />);
    openWizard();
    expect(
      within(wizard()).getByRole("group", {
        name: "Incentivos Águilas de Khemri",
      }),
    ).toBeTruthy();
    expect(
      within(wizard()).queryByRole("group", {
        name: "Incentivos Colmillos del Caos",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(perspective("Colmillos del Caos"));
    openWizard();
    expect(
      within(wizard()).getByRole("group", {
        name: "Incentivos Colmillos del Caos",
      }),
    ).toBeTruthy();
    expect(
      within(wizard()).queryByRole("group", {
        name: "Incentivos Águilas de Khemri",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(within(wizard()).getByText(/Tu tirada · Colmillos del Caos/)).toBeTruthy();
    expect(within(wizard()).queryByText(/Tu tirada · Águilas de Khemri/)).toBeNull();
  });

  it("recording my inducement change updates the header Inducements line", () => {
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Sobornos ×1 — 100\.000 M\.O\./);
    expect(document.body.textContent).toMatch(/Barriles de Bloodweiser ×2/);
    openWizard();
    const homeIncentives = within(wizard()).getByRole("group", {
      name: "Incentivos Águilas de Khemri",
    });
    fireEvent.click(
      within(homeIncentives).getByRole("button", { name: "Quitar Sobornos" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Avanzar al Equipo pateador" }),
    );
    expect(document.body.textContent).not.toMatch(/Sobornos ×1/);
    expect(document.body.textContent).toMatch(/Barriles de Bloodweiser ×2/);
  });

  it("keeps the per-side capture across a reload (v4 persistence)", () => {
    const first = render(<ActaDemoHarness />);
    openWizard();
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    first.unmount();
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    const report = within(ante()).getByRole("region", {
      name: "Lo que ha sucedido",
    });
    expect(report.textContent).toContain("4 + 🎲2 = 6");
  });
});

describe("ActaDemoHarness — S7.3–S7.5 · cierre del flujo pre-partido", () => {
  it("S7.3/S7.4: after Finalizar my sequence is closed — the waiting screen shows the rival and NO edit trigger", () => {
    render(<ActaDemoHarness />);
    freshSequence();
    walkSequence();
    const wait = within(ante());
    expect(wait.getByText(/Esperando al contrincante/)).toBeTruthy();
    expect(wait.getByText(/Colmillos del Caos/)).toBeTruthy();
    expect(
      wait.getByText(/Su secuencia pre-partido todavía no está completa/),
    ).toBeTruthy();
    // S7.3: a finished sequence cannot be edited — the trigger is gone.
    expect(
      wait.queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
  });

  it("S7.5: once BOTH coaches finish, one grouped display shows the four phases for both teams and NO edit trigger", () => {
    render(<ActaDemoHarness />);
    freshSequence();
    walkSequence(); // home done → the waiting screen is up.
    fireEvent.click(perspective("Colmillos del Caos"));
    openWizard();
    walkSequence(); // away done → the grouped final display.
    expect(screen.queryByText(/Esperando al contrincante/)).toBeNull();
    const summary = within(ante()).getByRole("region", {
      name: "Lo que ha sucedido",
    });
    for (const phase of ["Afición", "Clima", "Incentivos", "Sorteo"]) {
      expect(summary.textContent).toMatch(new RegExp(phase));
    }
    // Both teams side by side, with their actual rolls.
    expect(summary.textContent).toContain("Águilas de Khemri");
    expect(summary.textContent).toContain("Colmillos del Caos");
    expect(summary.textContent).toContain("4 + 🎲2 = 6");
    expect(summary.textContent).toContain("3 + 🎲2 = 5");
    expect(summary.textContent).toContain("2D6 = 10");
    // The opposed kick dice tie under the mocked dice (5 vs 5).
    expect(summary.textContent).toMatch(/empate/);
    // S7.3: still no way back into the wizard.
    expect(
      within(ante()).queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
  });

  it("an incomplete side keeps the current report + «Completar/Editar» trigger", () => {
    render(<ActaDemoHarness />);
    // The fixture narrative is mid-capture (!mine) → «Editar» label.
    expect(
      within(ante()).getByRole("button", {
        name: "Editar secuencia pre-partido",
      }),
    ).toBeTruthy();
    expect(
      within(ante()).getByRole("region", { name: "Lo que ha sucedido" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    // A fresh match (!mine) → «Completar» label.
    expect(
      within(ante()).getByRole("button", {
        name: "Completar secuencia pre-partido",
      }),
    ).toBeTruthy();
  });
});
