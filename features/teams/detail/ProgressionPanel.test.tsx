import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { ProgressionPanel } from "./ProgressionPanel";
import type { PlayerProgression } from "@/lib/progression";

/** A fully-advanced human Blitzer: accessPrimary ["G","F"], accessSecondary ["A"]. */
function blitzer(overrides: Partial<PlayerProgression> = {}): PlayerProgression {
  return {
    rosterPlayerId: "p1",
    name: "Marty",
    pe: 18,
    improvements: 1,
    skills: ["block"],
    valueBonus: 20_000,
    alive: true,
    accessPrimary: ["G", "F"],
    accessSecondary: ["A"],
    ...overrides,
  };
}

/** Locates a button inside a panel region by accessible name. */
function panelButton(name: string): HTMLElement {
  const el = screen.getByRole("button", { name });
  expect(el).toBeTruthy();
  return el;
}

describe("ProgressionPanel", () => {
  it("renders the player\'s PE, improvements count and value bonus", () => {
    render(<ProgressionPanel player={blitzer()} onImprove={vi.fn(async () => ({}))} />);
    expect(screen.getByText(/Marty/)).toBeTruthy();
    expect(screen.getByTestId("pe-p1").textContent).toBe("18");
    expect(screen.getByTestId("improvements-p1").textContent).toBe("1");
    expect(screen.getByTestId("value-p1").textContent).toBe("20 000");
  });

  it("marks an élite skill with a $ badge and an Élite tooltip, and a normal skill without", () => {
    const player = blitzer({ skills: ["block", "Agallas"] });
    render(<ProgressionPanel player={player} onImprove={vi.fn(async () => ({}))} />);
    // "Block" resolves from the catalog; "Agallas" passes through.
    const blockEl = screen.getByTestId("skill-block");
    expect(blockEl.textContent).toContain("Block");
    expect(within(blockEl).getByTestId("elite-badge")).toBeTruthy();
    expect(blockEl.getAttribute("title")).toBe("Élite"); // tooltip

    const normalEl = screen.getByTestId("skill-Agallas");
    expect(within(normalEl).queryByTestId("elite-badge")).toBeNull();
    expect(normalEl.getAttribute("title")).toBeNull();
  });

  it("offers only the categories the positional can access", () => {
    const onImprove = vi.fn(async () => ({}));
    render(<ProgressionPanel player={blitzer()} onImprove={onImprove} />);
    // open the Mejorar flow
    fireEvent.click(panelButton("Mejorar"));
    // access union = G, F, A (blitzer). P/M/T not offered.
    expect(screen.getAllByRole("button", { name: /^Tirada/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Tirada a .*P/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Tirada a .*T/ })).toBeNull();
  });

  it("runs a random-roll for a chosen category and sends a random-pick with the selected candidate", async () => {
    const onImprove = vi
      .fn(async (body: unknown) => {
        if (body && (body as { type: string }).type === "random-roll") {
          return { kind: "random", candidates: ["Provocar", "Patada"], cost: 3, pe: 18 };
        }
        return { skill: "Provocar", peRemaining: 15 };
      });
    render(<ProgressionPanel player={blitzer()} onImprove={onImprove} />);
    fireEvent.click(panelButton("Mejorar"));

    // roll for category G (Generales); candidates render asynchronously
    fireEvent.click(panelButton("Tirada a Generales"));
    const pickProvocar = await screen.findByRole("button", { name: /Provocar/ });
    expect(pickProvocar).toBeTruthy();
    fireEvent.click(pickProvocar);

    expect(onImprove).toHaveBeenCalledWith(
      expect.objectContaining({ type: "random-pick", selectedSkill: "Provocar" }),
    );
    // The response's peRemaining refreshes the panel.
    expect(await screen.findByText(/15/)).toBeTruthy();
  });

  it("offers primary picks within access and sends a primary improve", async () => {
    const onImprove = vi.fn(async () => ({}));
    render(<ProgressionPanel player={blitzer()} onImprove={onImprove} />);
    fireEvent.click(panelButton("Mejorar"));
    // primary general/strength options presented in a select; pick an unowned G skill.
    const primarySelect = screen.getByRole("combobox", { name: "Primaria" });
    expect(within(primarySelect).getAllByRole("option").length).toBeGreaterThan(1);
    fireEvent.change(primarySelect, { target: { value: "fend" } });
    await act(async () => fireEvent.click(panelButton("Comprar primaria")));
    expect(onImprove).toHaveBeenCalledWith(
      expect.objectContaining({ type: "primary", skillId: "fend" }),
    );
  });

  it("offers a secondary pick only from secondary access letters", async () => {
    const onImprove = vi.fn(async () => ({}));
    render(<ProgressionPanel player={blitzer()} onImprove={onImprove} />);
    fireEvent.click(panelButton("Mejorar"));
    const secondarySelect = screen.getByRole("combobox", { name: "Secundaria" });
    // blitzer accessSecondary ["A"] → agility letters only.
    fireEvent.change(secondarySelect, { target: { value: "dodge" } });
    await act(async () => fireEvent.click(panelButton("Comprar secundaria")));
    expect(onImprove).toHaveBeenCalledWith(
      expect.objectContaining({ type: "secondary", skillId: "dodge" }),
    );
  });

  it("offers an attribute pick and sends the attribute improve", async () => {
    const onImprove = vi.fn(async () => ({}));
    render(<ProgressionPanel player={blitzer()} onImprove={onImprove} />);
    fireEvent.click(panelButton("Mejorar"));
    const attrButtons = screen.getAllByRole("button", { name: /Atributo:/ });
    await act(async () => fireEvent.click(attrButtons[0]));
    expect(onImprove).toHaveBeenCalledWith(
      expect.objectContaining({ type: "attribute", attribute: expect.stringMatching(/^(ma|st|ag|pa|av)$/) }),
    );
  });

  it("surfaces a PE error returned by the improve call", async () => {
    const onImprove = vi.fn(async () => ({ error: "Not enough PE" }));
    render(<ProgressionPanel player={blitzer({ pe: 2 })} onImprove={onImprove} />);
    fireEvent.click(panelButton("Mejorar"));
    fireEvent.click(panelButton("Tirada a Generales"));
    expect(await screen.findByText(/Not enough PE/)).toBeTruthy();
  });
});
