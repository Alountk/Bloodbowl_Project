import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { PlayerImproveModal, type ModalPlayer } from "./PlayerImproveModal";
import type { ImproveBody } from "@/lib/progression";

/** A fresh human Lineman: accessPrimary ["G"], accessSecondary ["A","F"]. */
function lineman(overrides: Partial<ModalPlayer> = {}): ModalPlayer {
  return {
    rosterPlayerId: "p1",
    number: 1,
    name: "Marty",
    icon: "🚶",
    positionalName: "Lineman",
    role: "Lineman",
    raceName: "Human",
    baseAttributes: { ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+" },
    attributeIncreases: {},
    value: 50_000,
    pe: 10,
    improvements: 0,
    skills: [],
    alive: true,
    injuries: [],
    accessPrimary: ["G"],
    accessSecondary: ["A", "F"],
    ...overrides,
  };
}

function renderModal(
  player: ModalPlayer,
  handlers: {
    onRename?: (name: string) => Promise<Record<string, unknown>>;
    onImprove?: (body: ImproveBody) => Promise<Record<string, unknown>>;
    onClose?: () => void;
  } = {},
) {
  const onRename = handlers.onRename ?? vi.fn(async () => ({ name: "x" }));
  const onImprove = handlers.onImprove ?? vi.fn(async () => ({ peRemaining: 7 }));
  const onClose = handlers.onClose ?? vi.fn();
  render(
    <PlayerImproveModal
      player={player}
      raceId="human"
      otherNames={["Jane"]}
      onRename={onRename}
      onImprove={onImprove}
      onClose={onClose}
    />,
  );
  return { onRename, onImprove, onClose };
}

describe("PlayerImproveModal", () => {
  it("renders the header with the player, value and ★PE available", () => {
    renderModal(lineman());
    expect(screen.getByRole("dialog", { name: /Marty/ })).toBeTruthy();
    expect(screen.getByText("50 000")).toBeTruthy();
    expect(screen.getByTestId("modal-pe-label").textContent).toContain("★10");
    expect(screen.getByTestId("modal-number").textContent).toBe("1");
  });

  it("filters select options by the real next-improvement cost (pe 10: no 14-PE characteristic)", () => {
    renderModal(lineman({ pe: 10, improvements: 0 }));
    const select = screen.getByTestId("upgrade-select");
    // 1ª costs: random 3, primary 6, secondary 10 — attribute 14 NOT affordable.
    const labels = within(select).getAllByRole("option").map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("Fend"))).toBe(true); // primary G skill
    expect(screen.queryByRole("option", { name: /Característica/ })).toBeNull();
    // +1 attribute options hidden below 14 PE.
    for (const attr of ["ma", "st", "ag", "pa", "av"]) {
      const attrSelect = screen.getByTestId(`attr-select-${attr}`);
      expect(within(attrSelect).queryByRole("option", { name: /\+1/ })).toBeNull();
    }
  });

  it("shows the characteristic option and +1 picks once pe covers the attribute cost", () => {
    renderModal(lineman({ pe: 20, improvements: 0 }));
    expect(screen.getByRole("option", { name: /Característica/ })).toBeTruthy();
    const maSelect = screen.getByTestId("attr-select-ma");
    expect(within(maSelect).getByRole("option", { name: /\+1/ })).toBeTruthy();
  });

  it("hides the whole upgrade area and keeps the name editable when pe is below the minimum cost", () => {
    renderModal(lineman({ pe: 2, improvements: 0 }));
    expect(screen.queryByTestId("upgrade-select")).toBeNull();
    expect(screen.getByTestId("modal-no-pe")).toBeTruthy();
    // Nº and Nombre remain editable.
    const nameInput = screen.getByRole("textbox", { name: "Nombre" });
    expect(nameInput.hasAttribute("disabled")).toBe(false);
    fireEvent.change(nameInput, { target: { value: "Aldric" } });
    expect(nameInput.getAttribute("value")).toBe("Aldric");
  });

  it("calls onRename with the trimmed name and closes when nothing else is selected", async () => {
    const { onRename, onClose } = renderModal(lineman(), {
      onRename: vi.fn(async () => ({ name: "Aldric" })),
      onClose: vi.fn(),
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre" }), {
      target: { value: "  Aldric  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("modal-accept"));
    });
    expect(onRename).toHaveBeenCalledWith("Aldric");
    expect(onClose).toHaveBeenCalled();
  });

  it("sends a primary improve for a selected primary skill and closes on success", async () => {
    const onImprove = vi.fn(async () => ({ skill: "fend", peRemaining: 4 }));
    const onClose = vi.fn();
    renderModal(lineman(), { onImprove, onClose });
    fireEvent.change(screen.getByTestId("upgrade-select"), { target: { value: "primary:fend" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("modal-accept"));
    });
    expect(onImprove).toHaveBeenCalledWith({ type: "primary", skillId: "fend" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sends an attribute improve for a chosen +1 characteristic", async () => {
    const onImprove = vi.fn(async () => ({ attribute: "ma", peRemaining: 6 }));
    const onClose = vi.fn();
    renderModal(lineman({ pe: 20 }), { onImprove, onClose });
    // choose Característica and pick MA +1.
    fireEvent.change(screen.getByTestId("upgrade-select"), { target: { value: "attribute" } });
    fireEvent.change(screen.getByTestId("attr-select-ma"), { target: { value: "plus" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("modal-accept"));
    });
    expect(onImprove).toHaveBeenCalledWith({ type: "attribute", attribute: "ma" });
    expect(onClose).toHaveBeenCalled();
  });

  it("runs the two-step random roll: random-roll → candidate pick → random-pick", async () => {
    const onImprove = vi
      .fn(async (body: ImproveBody) => {
        if (body.type === "random-roll") return { kind: "random", candidates: ["Agallas"], cost: 3, pe: 10 };
        return { skill: "Agallas", peRemaining: 7 };
      });
    const onClose = vi.fn();
    renderModal(lineman(), { onImprove, onClose });
    fireEvent.change(screen.getByTestId("upgrade-select"), { target: { value: "random" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("modal-accept"));
    });
    expect(onImprove).toHaveBeenCalledWith({ type: "random-roll", category: "G" });
    // candidate pick surfaces as a button.
    const pick = await screen.findByRole("button", { name: "Agallas" });
    await act(async () => {
      fireEvent.click(pick);
    });
    expect(onImprove).toHaveBeenCalledWith({ type: "random-pick", selectedSkill: "Agallas" });
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces the server error verbatim and keeps the modal open", async () => {
    const onImprove = vi.fn(async () => ({ error: "Not enough PE" }));
    const onClose = vi.fn();
    renderModal(lineman(), { onImprove, onClose });
    fireEvent.change(screen.getByTestId("upgrade-select"), { target: { value: "primary:fend" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("modal-accept"));
    });
    expect(screen.getByRole("alert").textContent).toContain("Not enough PE");
    expect(onClose).not.toHaveBeenCalled();
  });
});
