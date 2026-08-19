import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HirePlayerDialog } from "./HirePlayerDialog";
import type { PlayerEntry, Race } from "../types";
import { getRaceById } from "../data/races";

const humanRace = getRaceById("human") as Race;

function linemanRoster(count: number): PlayerEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    positionalKey: "lineman",
  }));
}

function renderDialog(options: {
  roster?: PlayerEntry[];
  balance?: number;
  onHire?: (positionalKey: string) => Promise<Record<string, unknown>>;
  onClose?: () => void;
} = {}) {
  const onHire = options.onHire ?? vi.fn(async () => ({}));
  const onClose = options.onClose ?? vi.fn();
  render(
    <HirePlayerDialog
      race={humanRace}
      roster={options.roster ?? linemanRoster(11)}
      balance={options.balance ?? 450_000}
      onHire={onHire}
      onClose={onClose}
    />,
  );
  return { onHire, onClose };
}

describe("HirePlayerDialog (RAU-11)", () => {
  it("lists positionals with cost and count/max, plus the live balance", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Contratar jugadores" })).toBeTruthy();
    expect(screen.getByText("Tesorería disponible: 450 000")).toBeTruthy();

    // Human Blitzer row: name, cost, count/max.
    expect(screen.getByText("Human Blitzer")).toBeTruthy();
    expect(screen.getByText(/85 000/)).toBeTruthy();
    expect(screen.getAllByText("0/2", { exact: true }).length).toBeGreaterThanOrEqual(1);
    // Lineman count/max reflects the roster.
    expect(screen.getByText("11/16", { exact: true })).toBeTruthy();
    // Buttons are hire actions.
    expect(screen.getByRole("button", { name: "Contratar Human Lineman" })).toBeTruthy();
  });

  it("hides a positional already at its max", () => {
    renderDialog({ roster: [...linemanRoster(11), ...Array.from({ length: 2 }, (_, i) => ({
      id: `b${i + 1}`, name: `B${i + 1}`, positionalKey: "blitzer",
    }))] });
    expect(screen.queryByRole("button", { name: "Contratar Human Blitzer" })).toBeNull();
  });

  it("disables a hire over the spendable balance and labels it 'Sin tesorería suficiente'", () => {
    // 1 000 000 − 11 linemen (550k) − ... balance 100k < ogre 140k.
    renderDialog({ balance: 100_000 });
    const ogre = screen.getByRole("button", { name: "Contratar Ogre" });
    expect(ogre.hasAttribute("disabled")).toBe(true);
    expect(ogre.textContent).toContain("Sin tesorería suficiente");
  });

  it("disables every hire when the roster is at the 16-player cap", () => {
    renderDialog({ roster: linemanRoster(16), balance: 1_000_000 });
    expect(screen.getByText("Plantilla completa (máximo 16)")).toBeTruthy();
    // A blitzer would fit the budget but the roster is full.
    const blitzer = screen.getByRole("button", { name: "Contratar Human Blitzer" });
    expect(blitzer.hasAttribute("disabled")).toBe(true);
  });

  it("calls onHire with the positional key and closes on success", async () => {
    const { onHire, onClose } = renderDialog();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Contratar Human Blitzer" }));
    });
    expect(onHire).toHaveBeenCalledWith("blitzer");
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces the server error and keeps the dialog open on failure", async () => {
    const { onClose } = renderDialog({
      onHire: vi.fn(async () => ({ error: "Not enough treasury to hire this player" })),
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Contratar Human Blitzer" }));
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Not enough treasury to hire this player",
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
