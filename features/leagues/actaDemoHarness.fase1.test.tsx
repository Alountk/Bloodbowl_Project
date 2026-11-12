import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";

/**
 * Fase 1 · Pre-partido (S5) in the demo harness: the rulebook pre-match
 * capture panel mounted BEFORE the match timeline. Commits derive the acta
 * (header lines) through the existing event shapes (`fan_factor` / `weather`)
 * and the persisted inducement cart — direction A: capture → derived acta.
 * No jest-dom matchers (.textContent / regex / role queries only).
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fase1 = () =>
  screen.getByRole("region", { name: "Fase 1 · Pre-partido" });

describe("ActaDemoHarness — Fase 1 · Pre-partido capture (S5)", () => {
  it("renders the Fase 1 step panel with the rulebook steps", () => {
    render(<ActaDemoHarness />);
    const headings = within(fase1()).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "1 · Los Hinchas",
      "2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
    ]);
  });

  it("confirming the fan roll derives the acta header Afición lines", () => {
    render(<ActaDemoHarness />);
    // The demo fixture already captured the kickoff rolls («Hecho»); a new
    // manual capture re-derives the header (latest roll wins).
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲3 = 7/);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "D3 afición Águilas de Khemri" }),
      { target: { value: "2" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "D3 afición Colmillos del Caos" }),
      { target: { value: "1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar hinchas" }),
    );
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    expect(document.body.textContent).not.toMatch(/Afición: 4 \+ 🎲3 = 7/);
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲1 = 4/);
  });

  it("confirming an inducement change updates the header Inducements line", () => {
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Sobornos ×1 — 100\.000 M\.O\./);
    const homeIncentives = within(fase1()).getByRole("group", {
      name: "Incentivos Águilas de Khemri",
    });
    fireEvent.click(
      within(homeIncentives).getByRole("button", { name: "Quitar Sobornos" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar incentivos" }),
    );
    expect(document.body.textContent).not.toMatch(/Sobornos ×1/);
    expect(document.body.textContent).toMatch(/Barriles de Bloodweiser ×2/);
  });

  it("keeps the Fase 1 capture across a reload (v3 persistence)", () => {
    const first = render(<ActaDemoHarness />);
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "D3 afición Águilas de Khemri" }),
      { target: { value: "2" } },
    );
    fireEvent.change(
      screen.getByRole("spinbutton", { name: "D3 afición Colmillos del Caos" }),
      { target: { value: "1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar hinchas" }),
    );
    first.unmount();
    render(<ActaDemoHarness />);
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
    // Fans (re-confirmed) + weather (fixture) are done; incentives/kicking stay open.
    expect(within(fase1()).getAllByText("Hecho")).toHaveLength(2);
  });
});
