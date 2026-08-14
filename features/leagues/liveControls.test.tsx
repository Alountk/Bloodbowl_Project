import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventControls } from "./liveControls";
import type { LiveCommand } from "./api";

/**
 * Event recording controls (LM-20, D26): a floating "+" that opens a role-aware
 * event-type menu and a mini-form. Component tests drive the FAB/menu/form and
 * assert the commands fired — the server matrix stays the authority (a bypass
 * POST returns 409, proven by the route tests).
 */

const aliveRoster = [
  { rosterPlayerId: "p1", name: "Blitzer A", positionalKey: "blitzer", pe: 0, skills: [], injuries: [], alive: true, valueBonus: 0 },
  { rosterPlayerId: "p2", name: "Thrower A", positionalKey: "thrower", pe: 0, skills: [], injuries: [], alive: true, valueBonus: 0 },
  { rosterPlayerId: "p3", name: "Dead B", positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: false, valueBonus: 0 },
];

function renderControls(props: Partial<Parameters<typeof EventControls>[0]> = {}) {
  const onSubmit = vi.fn(async () => {});
  const utils = render(
    <EventControls
      viewerSide="home"
      activeSide="home"
      status="live"
      roster={aliveRoster}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, ...utils };
}

describe("EventControls — FAB visibility (LM-20 viewer-side)", () => {
  it("renders a floating + button for a coach with a side while the match is live", () => {
    renderControls();
    expect(screen.getByRole("button", { name: "+" })).toBeTruthy();
  });

  it("renders NO + button for a spectator/admin without a side", () => {
    renderControls({ viewerSide: null });
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
  });

  it("renders NO + button when the match is not live (finished)", () => {
    renderControls({ status: "finished" });
    expect(screen.queryByRole("button", { name: "+" })).toBeNull();
  });
});

describe("EventControls — role-aware menu (D26, LM-20)", () => {
  it("offers the ACTIVE coach TD / Pase completo / Baja / Herida / Falta", () => {
    renderControls(); // viewerSide home, activeSide home → active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByRole("button", { name: /Touchdown/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Pase completo/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Herida/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Falta/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Baja/i })).toBeTruthy();
  });

  it("offers the NON-active coach ONLY the casualty action (Herida)", () => {
    renderControls({ activeSide: "away" }); // viewerSide home, activeSide away → non-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    expect(screen.getByRole("button", { name: /Herida/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Touchdown/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Falta/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pase completo/i })).toBeNull();
  });
});

describe("EventControls — mini-form player + band selects (LM-20)", () => {
  it("shows only ALIVE players from the viewer's roster in the player select", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const select = screen.getByLabelText(/Jugador/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toContain("Blitzer A");
    expect(options).toContain("Thrower A");
    expect(options).not.toContain("Dead B"); // not alive
  });

  it("shows the 5-band select ONLY for the casualty action", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    // TD: no band select.
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    expect(screen.queryByLabelText(/Tipo de lesión/i)).toBeNull();
    // Back to the menu → casualty: band select appears with the 5 bands.
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const bandSelect = screen.getByLabelText(/Tipo de lesión/i) as HTMLSelectElement;
    expect(bandSelect.options).toHaveLength(5);
  });
});

describe("EventControls — submission (LM-20)", () => {
  it("fires a td command with the chosen scorer", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "td", side: "home", playerRosterId: "p2" } as LiveCommand);
  });

  it("fires a completion command with the chosen thrower", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Pase completo/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "completion", side: "home", playerRosterId: "p1" } as LiveCommand);
  });

  it("fires a foul command with the chosen player", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "foul", side: "home", playerRosterId: "p2" } as LiveCommand);
  });

  it("fires a casualty command with the victim + band", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Tipo de lesión/i), { target: { value: "grave" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: "casualty", side: "home", victimRosterId: "p1", band: "grave" } as LiveCommand,
    );
  });

  it("closes the menu/form after a submit", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Menu + form close: no + still visible (FAB stays), no menu items.
    expect(screen.queryByRole("button", { name: /Touchdown/i })).toBeNull();
    expect(screen.queryByLabelText(/Jugador/i)).toBeNull();
  });
});
