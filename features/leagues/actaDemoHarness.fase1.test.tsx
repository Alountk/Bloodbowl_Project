import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";

/**
 * Antes del partido (S5 + S2c) in the demo harness: the rulebook pre-match
 * capture opened at the acta's beginning, scoped PER SIDE by the «Ver como:»
 * perspective, with the «Lo que ha sucedido» report of confirmed facts.
 * Commits derive the acta (header lines) through the existing event shapes
 * (`fan_factor` / `weather`) and the persisted inducement cart — direction A.
 * No jest-dom matchers (.textContent / regex / role queries only).
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ante = () => screen.getByRole("region", { name: "Antes del partido" });
const perspective = (team: string) =>
  within(screen.getByRole("group", { name: "Ver como:" })).getByRole("button", {
    name: team,
  });

describe("ActaDemoHarness — Antes del partido (S5 + S2c)", () => {
  it("opens the acta with the pre-match section: four rulebook steps in order", () => {
    render(<ActaDemoHarness />);
    const headings = within(ante()).getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "1 · Los Hinchas",
      "2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
      "Lo que ha sucedido",
    ]);
  });

  it("confirming MY fan roll derives my header Afición line and leaves the rival's alone", () => {
    render(<ActaDemoHarness />);
    // The demo fixture already captured both kickoff rolls («Hecho»).
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲3 = 7/);
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲2 = 5/);
    fireEvent.change(
      within(ante()).getByRole("spinbutton", {
        name: "D3 afición (Águilas de Khemri)",
      }),
      { target: { value: "2" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi tirada de hinchas" }),
    );
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    expect(document.body.textContent).not.toMatch(/Afición: 4 \+ 🎲3 = 7/);
    // The rival's confirmed line stays untouched (per-side capture).
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲2 = 5/);
  });

  it("switching «Ver como:» swaps the capture to the other coach's own side", () => {
    render(<ActaDemoHarness />);
    expect(
      within(ante()).queryByRole("group", {
        name: "Incentivos Colmillos del Caos",
      }),
    ).toBeNull();
    fireEvent.click(perspective("Colmillos del Caos"));
    expect(
      within(ante()).getByRole("group", {
        name: "Incentivos Colmillos del Caos",
      }),
    ).toBeTruthy();
    expect(
      within(ante()).queryByRole("group", {
        name: "Incentivos Águilas de Khemri",
      }),
    ).toBeNull();
    expect(
      within(ante()).getByRole("spinbutton", {
        name: "D3 afición (Colmillos del Caos)",
      }),
    ).toBeTruthy();
  });

  it("confirming my inducement change updates the header Inducements line", () => {
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Sobornos ×1 — 100\.000 M\.O\./);
    const homeIncentives = within(ante()).getByRole("group", {
      name: "Incentivos Águilas de Khemri",
    });
    fireEvent.click(
      within(homeIncentives).getByRole("button", { name: "Quitar Sobornos" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mis incentivos" }),
    );
    expect(document.body.textContent).not.toMatch(/Sobornos ×1/);
    expect(document.body.textContent).toMatch(/Barriles de Bloodweiser ×2/);
  });

  it("keeps the per-side capture across a reload (v4 persistence)", () => {
    const first = render(<ActaDemoHarness />);
    fireEvent.change(
      within(ante()).getByRole("spinbutton", {
        name: "D3 afición (Águilas de Khemri)",
      }),
      { target: { value: "2" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi tirada de hinchas" }),
    );
    first.unmount();
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    // My fan roll + the fixture weather are done; incentives/kicking stay open.
    expect(within(ante()).getAllByText("Hecho")).toHaveLength(2);
  });
});
