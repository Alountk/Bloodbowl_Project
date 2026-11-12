import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";

describe("ActaDemoHarness — interactive demo sandbox (Phase 2)", () => {
  it("renders the scenario chips and demo actions", () => {
    render(<ActaDemoHarness />);
    for (const name of ["1T · turno 3", "2T · turno 5", "Finalizado"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    for (const name of [
      "Registrar evento",
      "TD local",
      "TD visitante",
      "Fin de turno",
      "Finalizar partido",
      "Abrir cierre",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("registers touchdowns: the score line advances only on the acting side", () => {
    render(<ActaDemoHarness />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(
      "Águilas de Khemri 2 - 1 Colmillos del Caos",
    );

    fireEvent.click(screen.getByRole("button", { name: "TD local" }));
    expect(heading.textContent).toBe(
      "Águilas de Khemri 3 - 1 Colmillos del Caos",
    );

    fireEvent.click(screen.getByRole("button", { name: "TD visitante" }));
    expect(heading.textContent).toBe(
      "Águilas de Khemri 3 - 2 Colmillos del Caos",
    );
  });

  it("ends the turn: the active-turn badge advances", () => {
    render(<ActaDemoHarness />);
    expect(screen.getByText(/TURNO 5 EN JUEGO/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Fin de turno" }));
    expect(screen.queryByText(/TURNO 5 EN JUEGO/)).toBeNull();
    expect(screen.getByText(/TURNO 6 EN JUEGO/)).toBeTruthy();
  });

  it("scenario chips jump to the named match state", () => {
    render(<ActaDemoHarness />);

    fireEvent.click(screen.getByRole("button", { name: "1T · turno 3" }));
    expect(screen.getByText(/TURNO 3 EN JUEGO/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Finalizado" }));
    expect(screen.queryByText(/EN JUEGO/)).toBeNull();
  });
});
