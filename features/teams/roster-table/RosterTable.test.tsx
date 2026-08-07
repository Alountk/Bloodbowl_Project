import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayerEntry, Race } from "../types";
import { RosterTable } from "./RosterTable";

const mockRace: Race = {
  id: "human",
  name: "Human",
  rerollCost: 50_000,
  positionals: [
    { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, accessPrimary: ["G"], accessSecondary: ["A"], ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
    { key: "minman", name: "Minman", role: "Lineman", cost: 60_000, max: 4, min: 2, accessPrimary: ["G", "A"], accessSecondary: ["P"], ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
    { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 4, accessPrimary: ["G", "F"], accessSecondary: ["A"], ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["block"] },
    { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, accessPrimary: ["G", "P"], accessSecondary: ["F"], ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["dodge"] },
    { key: "catcher", name: "Catcher", role: "Catcher", cost: 75_000, max: 2, accessPrimary: ["G", "A"], accessSecondary: ["S"], ma: 8, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["catch"] },
    { key: "big-guy", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, accessPrimary: ["F"], accessSecondary: ["G", "A", "M"], ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: [] },
  ],
};

const mockPlayers: PlayerEntry[] = [
  { id: "p1", name: "Grak", positionalKey: "lineman" },
  { id: "p2", name: "Smash", positionalKey: "blitzer" },
];

const ES_READONLY_HEADERS = ["POSICIÓN", "COSTE", "MV", "FU", "AG", "PS", "AR", "HABILIDADES Y RASGOS", "PRIMARIAS", "SECUNDARIAS"];
const ES_EDITABLE_HEADERS = ["CANT.", ...ES_READONLY_HEADERS];

describe("RosterTable", () => {
  describe("role translation", () => {
    it("maps each rulebook role to its Spanish label", () => {
      // translateRole is exercised through the rendered subtitle.
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.getByText("(Human, Línea)")).toBeTruthy();
      expect(screen.getByText("(Human, Blitzer)")).toBeTruthy();
    });

    it("falls back to Otro for unknown roles", () => {
      const unknownRoleRace: Race = {
        ...mockRace,
        positionals: [
          { key: "runner", name: "Runner", role: "Runner", cost: 50_000, max: 4, accessPrimary: ["G"], accessSecondary: ["A"], ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
        ],
      };
      render(
        <RosterTable
          players={[{ id: "p5", name: "R", positionalKey: "runner" }]}
          race={unknownRoleRace}
          readOnly
        />,
      );
      expect(screen.getByText("(Human, Otro)")).toBeTruthy();
    });
  });

  describe("column headers", () => {
    it("renders exactly 10 read-only headers in rulebook order without CANT. or a blank cell", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(10);
      expect(headers.map((h) => h.textContent)).toEqual(ES_READONLY_HEADERS);
      expect(screen.queryByText("CANT.")).toBeNull();
      expect(headers.every((h) => h.textContent)).toBeTruthy();
    });

    it("appends CANT. and a blank header cell in editable mode (12 columns)", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const headers = screen.getAllByRole("columnheader");
      expect(headers).toHaveLength(12);
      expect(headers.slice(0, 11).map((h) => h.textContent)).toEqual(ES_EDITABLE_HEADERS);
      expect(headers[11].textContent).toBe("");
    });
  });

  describe("banner", () => {
    it("renders the banner text only when bannerText is provided and the roster is non-empty (editable)", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} bannerText="Reikland Reavers" />);
      expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    });

    it("does not render a banner when bannerText is absent", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      expect(screen.queryByText(/Reikland Reavers/i)).toBeNull();
    });

    it("does not render a banner for an empty roster even when bannerText is provided", () => {
      render(<RosterTable players={[]} race={mockRace} bannerText="Reikland Reavers" />);
      expect(screen.queryByText(/Reikland Reavers/i)).toBeNull();
    });

    it("suppresses the banner in read-only mode even when bannerText is provided", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly bannerText="Reikland Reavers" />);
      expect(screen.queryByText("Reikland Reavers")).toBeNull();
    });
  });

  describe("quantity cell", () => {
    it("shows min-max using an explicit min in editable mode", () => {
      render(<RosterTable players={[{ id: "p3", name: "Min", positionalKey: "minman" }]} race={mockRace} />);
      expect(screen.getByText("2-4")).toBeTruthy();
    });

    it("defaults min to 0 when absent in editable mode", () => {
      render(<RosterTable players={[{ id: "p4", name: "Plain", positionalKey: "lineman" }]} race={mockRace} />);
      expect(screen.getByText("0-16")).toBeTruthy();
    });

    it("does not render a quantity cell in read-only mode", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryByText("1-16")).toBeNull();
      expect(screen.queryByText("0-4")).toBeNull();
    });
  });

  describe("position cell", () => {
    it("renders player.name plus the (Raza, RolEs) subtitle in readOnly mode", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      const row = screen.getByText("Grak").closest("tr");
      expect(row).not.toBeNull();
      expect(screen.getByText("(Human, Línea)")).toBeTruthy();
    });
  });

  describe("skills column", () => {
    it("renders the Spanish translation when present and never adds a category suffix", () => {
      render(<RosterTable players={[{ id: "p6", name: "T", positionalKey: "thrower" }]} race={mockRace} readOnly />);
      // "dodge" -> Spanish "Esquivar", no "(agility)" suffix.
      expect(screen.getByText("Esquivar")).toBeTruthy();
      expect(screen.queryByText(/\(agility\)/i)).toBeNull();
      expect(screen.queryByText(/\(general\)/i)).toBeNull();
    });

    it("falls back to the English name when no Spanish translation exists", () => {
      render(<RosterTable players={[{ id: "p7", name: "B", positionalKey: "blitzer" }]} race={mockRace} readOnly />);
      // "block" has no es translation -> English "Block".
      expect(screen.getByText("Block")).toBeTruthy();
    });

    it("renders Ninguna for a positional with no starting skills", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.getAllByText("Ninguna").length).toBeGreaterThan(0);
    });

    it("renders an untranslated skill with its English name and no parentheses suffix", () => {
      render(<RosterTable players={[{ id: "p8", name: "C", positionalKey: "catcher" }]} race={mockRace} readOnly />);
      // "catch" has no es translation -> English "Catch", raw.
      expect(screen.getByText("Catch")).toBeTruthy();
      expect(screen.queryByText(/\((general|agility|passing|strength|mutation|devious|trait)\)/)).toBeNull();
    });
  });

  describe("access columns", () => {
    it("renders PRIMARIAS letters joined by spaces", () => {
      render(<RosterTable players={[{ id: "p9", name: "S", positionalKey: "blitzer" }]} race={mockRace} readOnly />);
      expect(screen.getByText("G F")).toBeTruthy();
    });

    it("renders SECUNDARIAS letters joined by spaces", () => {
      render(<RosterTable players={[{ id: "p10", name: "B2", positionalKey: "lineman" }]} race={mockRace} readOnly />);
      expect(screen.getByText("A")).toBeTruthy();
    });

    it("renders an em dash for an empty access array", () => {
      const emptyAccessRace: Race = {
        ...mockRace,
        positionals: [
          { key: "none", name: "None", role: "Lineman", cost: 40_000, max: 16, accessPrimary: [], accessSecondary: [], ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
        ],
      };
      render(
        <RosterTable
          players={[{ id: "p11", name: "N", positionalKey: "none" }]}
          race={emptyAccessRace}
          readOnly
        />,
      );
      expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cost cell", () => {
    it("renders the positional cost with the rulebook space format", () => {
      render(<RosterTable players={[{ id: "p12", name: "C", positionalKey: "lineman" }]} race={mockRace} readOnly />);
      // "50 000" appears twice in readOnly: the row cell and the totals cost.
      expect(screen.getAllByText("50 000").length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("readOnly mode", () => {
    it("renders player names as static text, not inputs", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.getByText("Grak")).toBeTruthy();
      expect(screen.getByText("Smash")).toBeTruthy();
    });

    it("does not render remove buttons", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryAllByRole("button", { name: /remove/i })).toHaveLength(0);
    });
  });

  describe("edit mode (default)", () => {
    it("renders player names as editable inputs with the preserved aria-label", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(2);
      expect((inputs[0] as HTMLInputElement).value).toBe("Grak");
      expect(screen.getByLabelText("Player name for Grak")).toBeTruthy();
    });

    it("renders a remove button for each player and calls onRemove", () => {
      const onRemove = vi.fn();
      render(<RosterTable players={mockPlayers} race={mockRace} onRemove={onRemove} />);
      const deleteButtons = screen.getAllByRole("button", { name: /remove/i });
      expect(deleteButtons).toHaveLength(2);
      fireEvent.click(deleteButtons[0]);
      expect(onRemove).toHaveBeenCalledWith("p1");
    });

    it("calls onRename when a player name input is edited", () => {
      const onRename = vi.fn();
      render(<RosterTable players={mockPlayers} race={mockRace} onRename={onRename} />);
      fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "Crusher" } });
      expect(onRename).toHaveBeenCalledWith("p1", "Crusher");
    });
  });

  describe("totals row", () => {
    it("shows a navy ES totals row with player count and total cost in rulebook format, spanning 10 columns (readOnly)", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.getByText("2 jugadores · Coste total")).toBeTruthy();
      // 1 lineman (50 000) + 1 blitzer (90 000) = 140 000
      expect(screen.getByText("140 000")).toBeTruthy();
      const totalRow = screen.getByText("2 jugadores · Coste total").closest("tr") as HTMLTableRowElement;
      const cells = Array.from(totalRow.cells) as HTMLTableCellElement[];
      const sum = cells.reduce((acc, c) => acc + (c.colSpan || 1), 0);
      expect(sum).toBe(10);
    });

    it("keeps formatGold budget text in editable totals and spans 12 columns", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} remainingBudget={690_000} />);
      expect(screen.getByText("2 players")).toBeTruthy();
      expect(screen.getByText("690k left")).toBeTruthy();
      const totalRow = screen.getAllByRole("row").at(-1) as HTMLTableRowElement;
      const cells = Array.from(totalRow.cells) as HTMLTableCellElement[];
      const sum = cells.reduce((acc, c) => acc + (c.colSpan || 1), 0);
      expect(sum).toBe(12);
    });
  });

  describe("rulebook footer", () => {
    it("renders reroll opportunity and apothecary text when the apothecary prop is provided", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly apothecary={false} bannerText="B" />);
      expect(screen.getByText(/0-8 Segundas oportunidades: 50 000 M\.O\. cada una/i)).toBeTruthy();
      expect(screen.getByText("Apotecario: NO")).toBeTruthy();
    });

    it("shows Apotecario: SÍ when apothecary is true", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly apothecary={true} />);
      expect(screen.getByText("Apotecario: SÍ")).toBeTruthy();
    });

    it("does not render the footer when the apothecary prop is absent", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryByText(/Segundas oportunidades/i)).toBeNull();
      expect(screen.queryByText(/Apotecario/i)).toBeNull();
    });

    it("spans the footer columns correctly (4+6 readOnly, 5+6+1 editable)", () => {
      const readOnlyView = render(<RosterTable players={mockPlayers} race={mockRace} readOnly apothecary />);
      let footerRow = screen.getByText(/Segundas oportunidades/i).closest("tr") as HTMLTableRowElement;
      let sum = Array.from(footerRow.cells).reduce((acc, c) => acc + (c.colSpan || 1), 0);
      expect(sum).toBe(10);
      readOnlyView.unmount();

      const editableView = render(<RosterTable players={mockPlayers} race={mockRace} apothecary={false} />);
      footerRow = screen.getByText(/Segundas oportunidades/i).closest("tr") as HTMLTableRowElement;
      sum = Array.from(footerRow.cells).reduce((acc, c) => acc + (c.colSpan || 1), 0);
      expect(sum).toBe(12);
      editableView.unmount();
    });
  });

  describe("empty state", () => {
    it("renders an empty state message when players list is empty", () => {
      render(<RosterTable players={[]} race={mockRace} />);
      expect(screen.getByText(/no players in roster yet/i)).toBeTruthy();
    });
  });
});
