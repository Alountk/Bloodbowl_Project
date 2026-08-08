import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayerEntry, Race } from "../types";
import { PlayerAvailabilityTable } from "./PlayerAvailabilityTable";

const mockRace: Race = {
  id: "human",
  name: "Human",
  rerollCost: 50_000,
  positionals: [
    { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 4, accessPrimary: ["G"], accessSecondary: ["A"], ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
    { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, accessPrimary: ["G", "F"], accessSecondary: ["A"], ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["block"] },
    { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, accessPrimary: ["G", "P"], accessSecondary: ["F"], ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["dodge"] },
  ],
};

function add(players: PlayerEntry[], count: number, key = "lineman"): PlayerEntry[] {
  return [
    ...players,
    ...Array.from({ length: count }, (_, i) => ({
      id: `p${players.length + i}`,
      name: `Player ${players.length + i + 1}`,
      positionalKey: key,
    })),
  ];
}

describe("PlayerAvailabilityTable", () => {
  it("renders all positional rows with rulebook headers and a subtext in POSICIÓN", () => {
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={[]}
        totalCost={0}
        onAdd={vi.fn()}
        maxPlayers={16}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["POSICIÓN", "COSTE", "MV", "FU", "AG", "PS", "AR", "HABILIDADES Y RASGOS", "DISP."]);
    expect(screen.getByText("Lineman · (Human, Línea)")).toBeTruthy();
    expect(screen.getByText("Blitzer · (Human, Blitzer)")).toBeTruthy();
    expect(screen.getByText("Thrower · (Human, Lanzador)")).toBeTruthy();
  });

  it("renders rulebook-formatted costs and the DISP. counter with an Add button", () => {
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={add([], 2, "lineman")}
        totalCost={100_000}
        onAdd={vi.fn()}
        maxPlayers={16}
      />,
    );
    expect(screen.getByText("50 000")).toBeTruthy();
    expect(screen.getByText("2/4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Lineman" })).toBeTruthy();
  });

  it("renders Spanish skills with Ninguna fallback for empty skills", () => {
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={[]}
        totalCost={0}
        onAdd={vi.fn()}
        maxPlayers={16}
      />,
    );
    // "dodge" -> Spanish "Esquivar"; "block" has no es translation -> English "Block".
    expect(screen.getByText("Esquivar")).toBeTruthy();
    expect(screen.getByText("Block")).toBeTruthy();
    // Lineman has no skills -> "Ninguna".
    expect(screen.getAllByText("Ninguna").length).toBeGreaterThan(0);
  });

  it("hides a row entirely once its positional reaches its max", () => {
    const onAdd = vi.fn();
    // Thrower max 2; add 2 throwers -> row disappears.
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={add([], 2, "thrower")}
        totalCost={150_000}
        onAdd={onAdd}
        maxPlayers={16}
      />,
    );
    expect(screen.queryByText("Thrower · (Human, Lanzador)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Thrower" })).toBeNull();
  });

  it("disables the Add button when the purchase would exceed the budget but keeps the row visible", () => {
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={[]}
        totalCost={1_000_000}
        onAdd={vi.fn()}
        maxPlayers={16}
      />,
    );
    const addBlitzer = screen.getByRole("button", { name: "Add Blitzer" }) as HTMLButtonElement;
    expect(addBlitzer.disabled).toBe(true);
    // Row stays visible (only max-capped rows disappear).
    expect(screen.getByText("Blitzer · (Human, Blitzer)")).toBeTruthy();
  });

  it("disables the Add button at the MAX_PLAYERS cap", () => {
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={add([], 16, "lineman")}
        totalCost={700_000}
        onAdd={vi.fn()}
        maxPlayers={16}
      />,
    );
    const addBlitzer = screen.getByRole("button", { name: "Add Blitzer" }) as HTMLButtonElement;
    expect(addBlitzer.disabled).toBe(true);
  });

  it("calls onAdd with the positional key when Add is clicked", () => {
    const onAdd = vi.fn();
    render(
      <PlayerAvailabilityTable
        race={mockRace}
        players={[]}
        totalCost={0}
        onAdd={onAdd}
        maxPlayers={16}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Blitzer" }));
    expect(onAdd).toHaveBeenCalledWith("blitzer");
  });

  describe("horizontal scroll on mobile", () => {
    it("nests an overflow-x-auto wrapper and min-width panel below the outer scroll container", () => {
      render(
        <PlayerAvailabilityTable
          race={mockRace}
          players={[]}
          totalCost={0}
          onAdd={vi.fn()}
          maxPlayers={16}
        />,
      );
      // Table -> panel -> overflow-x-auto wrapper -> outer max-h container.
      const panel = screen.getByRole("table").parentElement;
      expect(panel?.className).toContain("min-w-[640px]");
      expect(panel?.className).toContain("md:min-w-0");
      const wrapper = panel?.parentElement;
      expect(wrapper?.className).toContain("overflow-x-auto");
      const outer = wrapper?.parentElement;
      expect(outer?.className).toContain("max-h-[55vh]");
      expect(outer?.className).toContain("overflow-auto");
    });
  });
});
