import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PlayerEntry, Race } from "../types";
import { RosterTable } from "./RosterTable";

const mockRace: Race = {
  id: "human",
  name: "Human",
  rerollCost: 50_000,
  positionals: [
    { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
    { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["block"] },
  ],
};

const mockPlayers: PlayerEntry[] = [
  { id: "p1", name: "Grak", positionalKey: "lineman" },
  { id: "p2", name: "Smash", positionalKey: "blitzer" },
];

describe("RosterTable", () => {
  describe("column headers", () => {
    it("renders MA, ST, AG, PA, AV headers in canonical order", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      const statHeaders = headers.filter((h) => ["MA", "ST", "AG", "PA", "AV"].includes(h ?? ""));
      expect(statHeaders).toEqual(["MA", "ST", "AG", "PA", "AV"]);
    });

    it("does not have duplicate 'A' column headers", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      const aHeaders = headers.filter((h) => h === "A");
      expect(aHeaders).toHaveLength(0);
    });
  });

  describe("edit mode (default)", () => {
    it("renders player names as editable inputs", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const inputs = screen.getAllByRole("textbox");
      expect(inputs).toHaveLength(2);
      expect((inputs[0] as HTMLInputElement).value).toBe("Grak");
      expect((inputs[1] as HTMLInputElement).value).toBe("Smash");
    });

    it("renders a delete button for each player", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      const deleteButtons = screen.getAllByRole("button", { name: /remove/i });
      expect(deleteButtons).toHaveLength(2);
    });

    it("calls onRename when user edits a player name", () => {
      const onRename = vi.fn();
      render(<RosterTable players={mockPlayers} race={mockRace} onRename={onRename} />);
      const inputs = screen.getAllByRole("textbox");
      fireEvent.change(inputs[0], { target: { value: "Crusher" } });
      expect(onRename).toHaveBeenCalledWith("p1", "Crusher");
    });

    it("calls onRemove when user clicks the delete button", () => {
      const onRemove = vi.fn();
      render(<RosterTable players={mockPlayers} race={mockRace} onRemove={onRemove} />);
      const deleteButtons = screen.getAllByRole("button", { name: /remove/i });
      fireEvent.click(deleteButtons[0]);
      expect(onRemove).toHaveBeenCalledWith("p1");
    });

    it("renders positional role in each row", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} />);
      expect(screen.getByText("Lineman")).toBeTruthy();
      expect(screen.getByText("Blitzer")).toBeTruthy();
    });
  });

  describe("readOnly mode", () => {
    it("renders player names as static text, not inputs", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryAllByRole("textbox")).toHaveLength(0);
      expect(screen.getByText("Grak")).toBeTruthy();
      expect(screen.getByText("Smash")).toBeTruthy();
    });

    it("does not render delete buttons", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} readOnly />);
      expect(screen.queryAllByRole("button", { name: /remove/i })).toHaveLength(0);
    });
  });

  describe("totals footer", () => {
    it("shows player count and total cost", () => {
      render(<RosterTable players={mockPlayers} race={mockRace} showTotals />);
      // 1 lineman (50k) + 1 blitzer (90k) = 140k
      expect(screen.getByText(/2 players/i)).toBeTruthy();
      expect(screen.getByText(/140k/i)).toBeTruthy();
    });
  });

  describe("empty state", () => {
    it("renders an empty state message when players list is empty", () => {
      render(<RosterTable players={[]} race={mockRace} />);
      expect(screen.getByText(/no players/i)).toBeTruthy();
    });
  });
});