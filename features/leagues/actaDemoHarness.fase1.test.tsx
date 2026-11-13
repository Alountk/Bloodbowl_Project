import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActaDemoHarness } from "./actaDemoHarness";

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
    fireEvent.change(
      within(wizard()).getByRole("spinbutton", {
        name: "Manual 1D3 afición",
      }),
      { target: { value: "2" } },
    );
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
    fireEvent.change(
      within(wizard()).getByRole("spinbutton", {
        name: "Manual 1D3 afición",
      }),
      { target: { value: "2" } },
    );
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
