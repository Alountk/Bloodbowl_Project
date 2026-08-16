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

const opponentRoster = [
  { rosterPlayerId: "o1", name: "Blitzer Rival", positionalKey: "blitzer", pe: 0, skills: [], injuries: [], alive: true, valueBonus: 0 },
  { rosterPlayerId: "o2", name: "Thrower Rival", positionalKey: "thrower", pe: 0, skills: [], injuries: [], alive: true, valueBonus: 0 },
];

function renderControls(props: Partial<Parameters<typeof EventControls>[0]> = {}) {
  const onSubmit = vi.fn(async () => {});
  const utils = render(
    <EventControls
      viewerSide="home"
      activeSide="home"
      status="live"
      roster={aliveRoster}
      opponentRoster={opponentRoster}
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

  it("fires a foul command with the chosen player AND the victim (LM-20 victim required)", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText(/Víctima de la falta/i), { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "foul", side: "home", playerRosterId: "p2", victimRosterId: "o1" } as LiveCommand);
  });

  it("fires a casualty command (NON-active coach) with the victim + band + cause (and no causer for dodge/crowd)", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Tipo de lesión/i), { target: { value: "grave" } });
    // crowd → no causer required, no causer select.
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "crowd" } });
    expect(screen.queryByLabelText(/Autor de la lesión/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: "casualty", side: "home", victimRosterId: "p1", band: "grave", cause: "crowd" } as LiveCommand,
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

describe("EventControls — Falta form captures the VICTIM (LM-20, D7)", () => {
  it("shows a distinct 'Víctima de la falta' select from the OPPONENT roster", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    const victim = screen.getByLabelText(/Víctima de la falta/i) as HTMLSelectElement;
    const options = Array.from(victim.options).map((o) => o.textContent);
    expect(options).toContain("Blitzer Rival");
    expect(options).toContain("Thrower Rival");
    // The opponent roster must NOT bleed into the aggressor ("Jugador") select.
    expect(options).not.toContain("Blitzer A");
    // The victim select is distinct from the aggressor select.
    expect(screen.getByLabelText(/^Jugador$/i)).toBeTruthy();
  });

  it("registers the foul only after BOTH aggressor and victim are chosen, firing victimRosterId", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p2" } });
    // Victim not yet picked → Registrar disabled.
    expect((screen.getByRole("button", { name: /Registrar/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Víctima de la falta/i), { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: "foul", side: "home", playerRosterId: "p2", victimRosterId: "o1" } as LiveCommand,
    );
  });
});

describe("EventControls — Baja/Herida form captures CAUSE and CAUSER (LM-20, MVT-5, D7)", () => {
  it("shows a 'Causa de la lesión' select with the six causes and no causer by default", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const cause = screen.getByLabelText(/Causa de la lesión/i) as HTMLSelectElement;
    const causes = Array.from(cause.options).map((o) => o.value.trim()).filter(Boolean);
    expect(causes).toEqual(["blitz", "foul", "dodge", "crowd", "penetration", "block"]);
    // The causer select only appears once a cause requiring a causer is chosen.
    expect(screen.queryByLabelText(/Autor de la lesión/i)).toBeNull();
  });

  it("shows the 'Autor de la lesión' select from the OPPONENT roster for the NON-active coach, submitting cause/causer on blitz", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Tipo de lesión/i), { target: { value: "grave" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    const causer = screen.getByLabelText(/Autor de la lesión/i) as HTMLSelectElement;
    const options = Array.from(causer.options).map((o) => o.textContent);
    expect(options).toContain("Blitzer Rival");
    fireEvent.change(causer, { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      band: "grave",
      cause: "blitz",
      causerRosterId: "o1",
    } as LiveCommand);
  });

  it("hides the causer select for dodge/crowd and submits WITHOUT causerRosterId (NON-active coach)", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "dodge" } });
    // Strict client rule: no causer select for dodge.
    expect(screen.queryByLabelText(/Autor de la lesión/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    // Deep-equality match below already proves NO causerRosterId for dodge (strict LM-12).
    expect(onSubmit).toHaveBeenCalledWith(
      { type: "casualty", side: "home", victimRosterId: "p1", band: "bruise", cause: "dodge" } as LiveCommand,
    );
  });

  it("disables Registrar until a causer is chosen when the cause requires one (LM-12 strict)", async () => {
    renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "block" } });
    // Causer select is visible but empty → Registrar disabled until picked.
    expect(screen.getByLabelText(/Autor de la lesión/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Registrar/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Autor de la lesión/i), { target: { value: "o2" } });
    expect((screen.getByRole("button", { name: /Registrar/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("EventControls — role-aware casualty pools (RAU-34)", () => {
  it("ACTIVE coach: offers the OPPONENT roster as victims and the OWN roster as causers", async () => {
    renderControls(); // viewer home, active home → ACTIVE
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // The victim select ("Jugador") lists the RIVAL alive players, not the viewer's own.
    const victim = screen.getByLabelText(/^Jugador$/i) as HTMLSelectElement;
    const victimOptions = Array.from(victim.options).map((o) => o.textContent);
    expect(victimOptions).toContain("Blitzer Rival");
    expect(victimOptions).toContain("Thrower Rival");
    expect(victimOptions).not.toContain("Blitzer A");
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    // The causer select ("Autor de la lesión") lists the ACTIVE coach's OWN alive players.
    const causer = screen.getByLabelText(/Autor de la lesión/i) as HTMLSelectElement;
    const causerOptions = Array.from(causer.options).map((o) => o.textContent);
    expect(causerOptions).toContain("Blitzer A");
    expect(causerOptions).toContain("Thrower A");
    expect(causerOptions).not.toContain("Blitzer Rival");
  });

  it("ACTIVE coach: submits side = the VICTIM's (OPPONENT) side with an opponent victim and an own causer", async () => {
    const { onSubmit } = renderControls(); // viewer home, active home → ACTIVE
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "o1" } });
    fireEvent.change(screen.getByLabelText(/Tipo de lesión/i), { target: { value: "grave" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    fireEvent.change(screen.getByLabelText(/Autor de la lesión/i), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      band: "grave",
      cause: "blitz",
      causerRosterId: "p2",
    } as LiveCommand);
  });

  it("ACTIVE coach: crowd casualty keeps the OPPONENT victim and the OPPONENT side, with no causer", async () => {
    const { onSubmit } = renderControls(); // viewer home, active home → ACTIVE
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "o2" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "crowd" } });
    expect(screen.queryByLabelText(/Autor de la lesión/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o2",
      band: "bruise",
      cause: "crowd",
    } as LiveCommand);
  });

  it("NON-active coach: keeps OWN-roster victims, OPPONENT causers, and their OWN side", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // Victim select stays the OWN roster; the rival roster does NOT bleed in.
    const victim = screen.getByLabelText(/^Jugador$/i) as HTMLSelectElement;
    const victimOptions = Array.from(victim.options).map((o) => o.textContent);
    expect(victimOptions).toContain("Blitzer A");
    expect(victimOptions).toContain("Thrower A");
    expect(victimOptions).not.toContain("Blitzer Rival");
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Tipo de lesión/i), { target: { value: "grave" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    const causer = screen.getByLabelText(/Autor de la lesión/i) as HTMLSelectElement;
    const causerOptions = Array.from(causer.options).map((o) => o.textContent);
    expect(causerOptions).toContain("Blitzer Rival");
    expect(causerOptions).not.toContain("Blitzer A");
    fireEvent.change(causer, { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      band: "grave",
      cause: "blitz",
      causerRosterId: "o1",
    } as LiveCommand);
  });
});
