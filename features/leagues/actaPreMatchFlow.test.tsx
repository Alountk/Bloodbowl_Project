import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  ActaPreMatchFlow,
  type ActaPreMatchSnapshot,
  type PreMatchCommit,
} from "./actaPreMatchFlow";

/**
 * Fase 1 · Pre-partido (S5): the rulebook pre-match sequence captured in the
 * acta sequence — 1 Los Hinchas (1D3 + dedicated fans), 2 El Clima (1D6+1D6 →
 * 2D6 table), 3 Incentivos (the coaches SELECT them), 4 Equipo Pateador
 * (opposed 1D6, winner decides) + the league-only substitutes note. Every roll
 * step defaults to MANUAL entry with an Auto option (S5 decision verbatim:
 * «Todo manual con opcion a automatico en cada step»). No jest-dom matchers:
 * .textContent / regex / role queries only.
 */

const emptySnapshot = (): ActaPreMatchSnapshot => ({
  fans: null,
  weather: null,
  inducements: { home: [], away: [] },
  inducementsDone: false,
  kicking: null,
});

function setup(
  snapshot: ActaPreMatchSnapshot = emptySnapshot(),
  dice = { d3: vi.fn(() => 2), d6: vi.fn(() => 4) },
) {
  const onCommit = vi.fn<(commit: PreMatchCommit) => void>();
  render(
    <ActaPreMatchFlow
      homeName="Águilas de Khemri"
      awayName="Colmillos del Caos"
      homeBase={4}
      awayBase={3}
      snapshot={snapshot}
      onCommit={onCommit}
      dice={dice}
    />,
  );
  return { onCommit, dice };
}

const region = () => screen.getByRole("region", { name: "Fase 1 · Pre-partido" });
const step = (name: string) => within(region()).getByRole("group", { name });
const spin = (name: string) => screen.getByRole("spinbutton", { name });

describe("ActaPreMatchFlow — Fase 1 · Pre-partido (S5)", () => {
  it("shows the four rulebook steps in order plus the substitutes note", () => {
    setup();
    const headings = within(region()).getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "1 · Los Hinchas",
      "2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
    ]);
    expect(
      within(region()).getByText("Sustitutos: solo en liga — no aplica en esta demo"),
    ).toBeTruthy();
  });

  it("manual fan entry totals base + 1D3 per side and commits both sides", () => {
    const { onCommit } = setup();
    fireEvent.change(spin("D3 afición Águilas de Khemri"), {
      target: { value: "2" },
    });
    fireEvent.change(spin("D3 afición Colmillos del Caos"), {
      target: { value: "1" },
    });
    expect(within(region()).getByText(/4 \+ 2 = 6/)).toBeTruthy();
    expect(within(region()).getByText(/3 \+ 1 = 4/)).toBeTruthy();
    fireEvent.click(within(step("Paso 1 · Los Hinchas")).getByRole("button", { name: "Confirmar hinchas" }));
    expect(onCommit).toHaveBeenCalledWith({
      step: "fans",
      fans: {
        home: { base: 4, dice: 2, total: 6 },
        away: { base: 3, dice: 1, total: 4 },
      },
    });
  });

  it("Auto fan mode rolls the injected dice and totals them", () => {
    const dice = { d3: vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(2), d6: vi.fn(() => 4) };
    const { onCommit } = setup(emptySnapshot(), dice);
    const group = step("Paso 1 · Los Hinchas");
    fireEvent.click(within(group).getByRole("button", { name: "Auto" }));
    fireEvent.click(within(group).getByRole("button", { name: "Tirar afición Águilas de Khemri" }));
    fireEvent.click(within(group).getByRole("button", { name: "Tirar afición Colmillos del Caos" }));
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar hinchas" }));
    expect(dice.d3).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenCalledWith({
      step: "fans",
      fans: {
        home: { base: 4, dice: 3, total: 7 },
        away: { base: 3, dice: 2, total: 5 },
      },
    });
  });

  it("manual weather: two 1D6 rolls resolve the 2D6 table label and commit", () => {
    const { onCommit } = setup();
    const group = step("Paso 2 · El Clima");
    fireEvent.change(spin("D6 clima Águilas de Khemri"), { target: { value: "1" } });
    fireEvent.change(spin("D6 clima Colmillos del Caos"), { target: { value: "1" } });
    expect(within(region()).getByText(/2D6 = 2 · Calor asfixiante/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar clima" }));
    expect(onCommit).toHaveBeenCalledWith({
      step: "weather",
      weather: { roll: 2, value: "heat" },
    });
  });

  it("Auto weather rolls the injected dice", () => {
    const dice = { d3: vi.fn(() => 2), d6: vi.fn().mockReturnValueOnce(2).mockReturnValueOnce(2) };
    const { onCommit } = setup(emptySnapshot(), dice);
    const group = step("Paso 2 · El Clima");
    fireEvent.click(within(group).getByRole("button", { name: "Auto" }));
    fireEvent.click(within(group).getByRole("button", { name: "Tirar clima Águilas de Khemri" }));
    fireEvent.click(within(group).getByRole("button", { name: "Tirar clima Colmillos del Caos" }));
    expect(within(region()).getByText(/2D6 = 4 · Perfecto/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar clima" }));
    expect(onCommit).toHaveBeenCalledWith({
      step: "weather",
      weather: { roll: 4, value: "perfect" },
    });
  });

  it("inducement picker shows the rulebook price/cap, honors the cap and commits the cart", () => {
    const { onCommit } = setup();
    const group = within(step("Paso 3 · Incentivos")).getByRole("group", {
      name: "Incentivos Águilas de Khemri",
    });
    expect(within(group).getByText(/Sobornos — 100\.000 M\.O\. \(máx\. 3\)/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Añadir Sobornos" }));
    fireEvent.click(within(group).getByRole("button", { name: "Añadir Sobornos" }));
    expect(within(group).getByText(/Sobornos ×2/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Añadir Sobornos" }));
    fireEvent.click(within(group).getByRole("button", { name: "Añadir Sobornos" }));
    expect(within(group).getByText(/Sobornos ×3/)).toBeTruthy();
    expect(
      within(group).getByRole("button", { name: "Añadir Sobornos" }).getAttribute("disabled"),
    ).not.toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Quitar Sobornos" }));
    fireEvent.click(within(group).getByRole("button", { name: "Añadir Barriles de Bloodweiser" }));
    fireEvent.click(
      within(step("Paso 3 · Incentivos")).getByRole("button", {
        name: "Confirmar incentivos",
      }),
    );
    expect(onCommit).toHaveBeenCalledWith({
      step: "inducements",
      inducements: {
        home: [
          { id: "bribes", count: 2 },
          { id: "bloodweiser-kegs", count: 1 },
        ],
        away: [],
      },
    });
  });

  it("keeps the petty-cash reference line in the incentives step", () => {
    setup();
    expect(
      within(step("Paso 3 · Incentivos")).getByText(
        "Caja menor: diferencia de VAE + gasto rival en incentivos (máx. +50.000 M.O. de tesorería)",
      ),
    ).toBeTruthy();
  });

  it("kicking team: ties force a re-roll and the winner decides who kicks", () => {
    const dice = { d3: vi.fn(() => 2), d6: vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(3).mockReturnValueOnce(5).mockReturnValueOnce(2) };
    const { onCommit } = setup(emptySnapshot(), dice);
    const group = step("Paso 4 · Equipo pateador");
    fireEvent.change(spin("D6 pateador Águilas de Khemri"), { target: { value: "3" } });
    fireEvent.change(spin("D6 pateador Colmillos del Caos"), { target: { value: "3" } });
    expect(within(region()).getByText(/Empate: repetir tirada/)).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Repetir tirada" }));
    fireEvent.change(spin("D6 pateador Águilas de Khemri"), { target: { value: "5" } });
    fireEvent.change(spin("D6 pateador Colmillos del Caos"), { target: { value: "2" } });
    expect(within(region()).getByText("Gana Águilas de Khemri")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Patea Colmillos del Caos" }));
    fireEvent.click(within(group).getByRole("button", { name: "Confirmar pateador" }));
    expect(onCommit).toHaveBeenCalledWith({ step: "kicking", kicking: "away" });
  });

  it("committed steps show «Hecho»", () => {
    const done: ActaPreMatchSnapshot = {
      fans: {
        home: { base: 4, dice: 2, total: 6 },
        away: { base: 3, dice: 1, total: 4 },
      },
      weather: { roll: 7, value: "perfect" },
      inducements: { home: [], away: [] },
      inducementsDone: true,
      kicking: "home",
    };
    setup(done);
    expect(within(region()).getAllByText("Hecho")).toHaveLength(4);
  });

  it("pending steps show «Pendiente»", () => {
    setup(emptySnapshot());
    expect(within(region()).getAllByText("Pendiente")).toHaveLength(4);
  });
});
