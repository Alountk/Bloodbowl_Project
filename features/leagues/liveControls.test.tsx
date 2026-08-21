import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventControls } from "./liveControls";
import type { LiveCommand } from "./api";

/**
 * Event recording controls (LM-20, D26) with the RAU-39 two-phase casualty
 * flow: the ACTIVE coach PROPOSES (causer + victim + cause + roll16, band
 * derived server-side — NO band select, the 1D6 appears only when the derived
 * band is permanent); the NON-active coach records a SELF-INFLICTED dodge/crowd
 * casualty directly (roll16, band derived) and CONFIRMS the attacker's proposal
 * in the turn zone (MatchView). Component tests drive the FAB/menu/form and
 * assert the commands fired — the server matrix stays the authority.
 */

const aliveRoster = [
  { rosterPlayerId: "p1", name: "Blitzer A", positionalKey: "blitzer", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
  { rosterPlayerId: "p2", name: "Thrower A", positionalKey: "thrower", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
  { rosterPlayerId: "p3", name: "Dead B", positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: false, missNextMatch: false, valueBonus: 0 },
];

const opponentRoster = [
  { rosterPlayerId: "o1", name: "Blitzer Rival", positionalKey: "blitzer", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
  { rosterPlayerId: "o2", name: "Thrower Rival", positionalKey: "thrower", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
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
      rosterRaceId="human"
      opponentRaceId="human"
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

describe("EventControls — mini-form player + roll selects (LM-20, RAU-39)", () => {
  it("RAU-12: excludes a missNextMatch player from every selectable pool", () => {
    // p2 is unavailable for this match (lasting-band casualty of the previous
    // one) — they must disappear from scorer/causer and the opponent victim
    // pools even though they are alive.
    const suspendedRoster = [
      ...aliveRoster,
      { rosterPlayerId: "p9", name: "Suspended B", positionalKey: "blitzer", pe: 0, skills: [], injuries: [{ kind: "apaleado" }], alive: true, missNextMatch: true, valueBonus: 0 },
    ];
    const suspendedOpponent = [
      ...opponentRoster,
      { rosterPlayerId: "o9", name: "Suspended Rival", positionalKey: "blitzer", pe: 0, skills: [], injuries: [{ kind: "grave" }], alive: true, missNextMatch: true, valueBonus: 0 },
    ];
    renderControls({ roster: suspendedRoster, opponentRoster: suspendedOpponent });
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // TD player select (own pool).
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const tdSelect = screen.getByLabelText(/Jugador/i) as HTMLSelectElement;
    const tdLabels = Array.from(tdSelect.options).map((o) => o.textContent ?? "");
    expect(tdLabels.some((l) => l.includes("Suspended B"))).toBe(false);
    expect(tdLabels.some((l) => l.includes("Blitzer A"))).toBe(true);

    // Casualty victim + causer selects (active coach).
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const victim = screen.getByLabelText(/^Víctima$/i) as HTMLSelectElement;
    const victimLabels = Array.from(victim.options).map((o) => o.textContent ?? "");
    expect(victimLabels.some((l) => l.includes("Suspended Rival"))).toBe(false);
    expect(victimLabels.some((l) => l.includes("Blitzer Rival"))).toBe(true);
    const causer = screen.getByLabelText(/Autor de la lesión/i) as HTMLSelectElement;
    const causerLabels = Array.from(causer.options).map((o) => o.textContent ?? "");
    expect(causerLabels.some((l) => l.includes("Suspended B"))).toBe(false);

    // Foul victim select (opponent pool).
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    const foulVictim = screen.getByLabelText(/Víctima de la falta/i) as HTMLSelectElement;
    const foulLabels = Array.from(foulVictim.options).map((o) => o.textContent ?? "");
    expect(foulLabels.some((l) => l.includes("Suspended Rival"))).toBe(false);
    expect(foulLabels.some((l) => l.includes("Thrower Rival"))).toBe(true);
  });

  it("RAU-12: excludes a missNextMatch player from the NON-active self-inflicted victim pool", () => {
    const suspendedRoster = [
      ...aliveRoster,
      { rosterPlayerId: "p9", name: "Suspended B", positionalKey: "blitzer", pe: 0, skills: [], injuries: [{ kind: "apaleado" }], alive: true, missNextMatch: true, valueBonus: 0 },
    ];
    renderControls({ activeSide: "away", roster: suspendedRoster });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const victim = screen.getByLabelText(/^Víctima$/i) as HTMLSelectElement;
    const labels = Array.from(victim.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => l.includes("Suspended B"))).toBe(false);
    expect(labels.some((l) => l.includes("Blitzer A"))).toBe(true);
  });

  it("shows only ALIVE players from the viewer's roster in the player select", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const select = screen.getByLabelText(/Jugador/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent ?? "");
    expect(options.some((o) => o.includes("Blitzer A"))).toBe(true);
    expect(options.some((o) => o.includes("Thrower A"))).toBe(true);
    expect(options.some((o) => o.includes("Dead B"))).toBe(false); // not alive
  });

  it("RAU-48: casualty author/victim options show the position + dorsal next to the name", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // Causer (own roster, active coach): dorsal = served-array index + 1.
    const author = screen.getByLabelText(/Autor/i) as HTMLSelectElement;
    const authorLabels = Array.from(author.options).map((o) => o.textContent);
    expect(authorLabels).toContain("Blitzer A (Human Blitzer · #1)");
    expect(authorLabels).toContain("Thrower A (Human Thrower · #2)");
    // Victim (rival roster, active coach).
    const victim = screen.getByLabelText(/Víctima/i) as HTMLSelectElement;
    const victimLabels = Array.from(victim.options).map((o) => o.textContent);
    expect(victimLabels).toContain("Blitzer Rival (Human Blitzer · #1)");
    expect(victimLabels).toContain("Thrower Rival (Human Thrower · #2)");
  });

  it("RAU-48: the foul victim select shows the position + dorsal next to the rival names", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    const foulVictim = screen.getByLabelText(/Víctima de la falta/i) as HTMLSelectElement;
    const foulLabels = Array.from(foulVictim.options).map((o) => o.textContent);
    expect(foulLabels).toContain("Blitzer Rival (Human Blitzer · #1)");
    expect(foulLabels).toContain("Thrower Rival (Human Thrower · #2)");
  });

  it("shows the 1D16 roll + derived band instead of a band select, and the 1D6 ONLY when the derived band is permanent", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // NO band select — the band is derived from the roll, never chosen.
    expect(screen.queryByLabelText(/Tipo de lesión/i)).toBeNull();
    const roll16 = screen.getByLabelText(/Tirada 1D16/i) as HTMLSelectElement;
    expect(Array.from(roll16.options).map((o) => o.value).filter(Boolean)).toEqual(
      Array.from({ length: 16 }, (_, i) => String(i + 1)),
    );
    // RAU-42: the option LABELS carry the derived band beside the number (the
    // value stays the raw roll, so the numeric-value assertions above still hold).
    const labels = Array.from(roll16.options).map((o) => o.textContent ?? "");
    expect(labels).toContain("9 → Apaleado");
    expect(labels).toContain("12 → Herida grave");
    expect(labels).toContain("14 → Permanente (tira 1D6)");
    expect(labels).toContain("16 → Muerto");
    // A non-permanent roll (1-8 → bruise) shows the derived band, no 1D6.
    fireEvent.change(roll16, { target: { value: "8" } });
    expect(screen.getByText(/Banda: Magullado/)).toBeTruthy();
    expect(screen.queryByLabelText(/Tirada 1D6/i)).toBeNull();
    // A permanent roll (13-14) surfaces the REQUIRED 1D6 attribute select.
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "14" } });
    expect(screen.getByText(/Banda: Permanente/)).toBeTruthy();
    const roll6 = screen.getByLabelText(/Tirada 1D6/i) as HTMLSelectElement;
    expect(Array.from(roll6.options).map((o) => o.value).filter(Boolean)).toEqual(
      Array.from({ length: 6 }, (_, i) => String(i + 1)),
    );
    // RAU-42: the 1D6 option labels carry the reduced attribute (1 and 2 → −AR).
    const roll6Labels = Array.from(roll6.options).map((o) => o.textContent ?? "");
    expect(roll6Labels).toContain("1 → −AR");
    expect(roll6Labels).toContain("3 → −MV");
    expect(roll6Labels).toContain("5 → −AG");
    expect(roll6Labels).toContain("6 → −ST");
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

  it("closes the menu/form after a submit", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    fireEvent.change(screen.getByLabelText(/Jugador/i), { target: { value: "p2" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
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
    const options = Array.from(victim.options).map((o) => o.textContent ?? "");
    expect(options.some((o) => o.includes("Blitzer Rival"))).toBe(true);
    expect(options.some((o) => o.includes("Thrower Rival"))).toBe(true);
    expect(options.some((o) => o.includes("Blitzer A"))).toBe(false);
    expect(screen.getByLabelText(/^Jugador$/i)).toBeTruthy();
  });

  it("registers the foul only after BOTH aggressor and victim are chosen, firing victimRosterId", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    fireEvent.change(screen.getByLabelText(/^Jugador$/i), { target: { value: "p2" } });
    expect((screen.getByRole("button", { name: /Registrar/i }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Víctima de la falta/i), { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: "foul", side: "home", playerRosterId: "p2", victimRosterId: "o1" } as LiveCommand,
    );
  });
});

describe("EventControls — ACTIVE coach casualty PROPOSAL (RAU-39)", () => {
  it("offers ONLY causer-required causes (blitz/foul/block) — never dodge/crowd", () => {
    renderControls(); // viewer home, active home → ACTIVE
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const cause = screen.getByLabelText(/Causa de la lesión/i) as HTMLSelectElement;
    const causes = Array.from(cause.options).map((o) => o.value.trim()).filter(Boolean);
    expect(causes).toEqual(["blitz", "foul", "block"]);
  });

  it("submits proposeCasualty with an OPPONENT victim, an OWN causer, the cause and roll16 (NO band)", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // The victim select ("Víctima") lists the RIVAL alive players.
    const victim = screen.getByLabelText(/^Víctima$/i) as HTMLSelectElement;
    expect(Array.from(victim.options).map((o) => o.textContent ?? "").some((o) => o.includes("Blitzer Rival"))).toBe(true);
    fireEvent.change(victim, { target: { value: "o1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    // The causer select lists the ACTIVE coach's OWN alive players.
    const causer = screen.getByLabelText(/Autor de la lesión/i) as HTMLSelectElement;
    expect(Array.from(causer.options).map((o) => o.textContent ?? "").some((o) => o.includes("Blitzer A"))).toBe(true);
    fireEvent.change(causer, { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /Proponer/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "proposeCasualty",
      victimRosterId: "o1",
      causerRosterId: "p2",
      cause: "blitz",
      roll16: 9,
    } as LiveCommand);
  });

  it("shows the REQUIRED 1D6 when the derived band is permanent and includes it in the proposal", async () => {
    const { onSubmit } = renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Víctima$/i), { target: { value: "o1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "block" } });
    fireEvent.change(screen.getByLabelText(/Autor de la lesión/i), { target: { value: "p1" } });
    // roll16 14 → derived band permanent → the 1D6 select appears and Registrar
    // stays disabled until it is picked.
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "14" } });
    const submit = screen.getByRole("button", { name: /Proponer/i }) as HTMLButtonElement;
    expect(screen.getByLabelText(/Tirada 1D6/i)).toBeTruthy();
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Tirada 1D6/i), { target: { value: "5" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      type: "proposeCasualty",
      victimRosterId: "o1",
      causerRosterId: "p1",
      cause: "block",
      roll16: 14,
      roll6: 5,
    } as LiveCommand);
  });

  it("keeps Registrar disabled until the causer is chosen (causer-required, RAU-39)", () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Víctima$/i), { target: { value: "o2" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "blitz" } });
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "9" } });
    const submit = screen.getByRole("button", { name: /Proponer/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Autor de la lesión/i), { target: { value: "p2" } });
    expect(submit.disabled).toBe(false);
  });
});

describe("EventControls — NON-active coach SELF-INFLICTED casualty (RAU-39)", () => {
  it("offers ONLY self-inflicted causes (dodge/crowd) and NO causer select", () => {
    renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const cause = screen.getByLabelText(/Causa de la lesión/i) as HTMLSelectElement;
    const causes = Array.from(cause.options).map((o) => o.value.trim()).filter(Boolean);
    expect(causes).toEqual(["dodge", "crowd"]);
    expect(screen.queryByLabelText(/Autor de la lesión/i)).toBeNull();
  });

  it("submits a direct casualty with the OWN victim, roll16 and NO band for a dodge", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" }); // viewer home, active away → NON-active
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    // Victim select stays the OWN roster.
    const victim = screen.getByLabelText(/^Víctima$/i) as HTMLSelectElement;
    expect(Array.from(victim.options).map((o) => o.textContent ?? "").some((o) => o.includes("Blitzer A"))).toBe(true);
    fireEvent.change(victim, { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "dodge" } });
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    // Deep-equality proves NO band and NO causer on the wire (band derived server-side).
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      cause: "dodge",
      roll16: 9,
    } as LiveCommand);
  });

  it("requires and sends the 1D6 when the derived band is permanent (crowd, roll16 13)", async () => {
    const { onSubmit } = renderControls({ activeSide: "away" });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    fireEvent.change(screen.getByLabelText(/^Víctima$/i), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText(/Causa de la lesión/i), { target: { value: "crowd" } });
    fireEvent.change(screen.getByLabelText(/Tirada 1D16/i), { target: { value: "13" } });
    const submit = screen.getByRole("button", { name: /Registrar/i }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Tirada 1D6/i), { target: { value: "6" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      cause: "crowd",
      roll16: 13,
      roll6: 6,
    } as LiveCommand);
  });
});

describe("EventControls — RAU-13 Journeymen (Novatos) in the pools", () => {
  const journeyman = {
    rosterPlayerId: "journeyman-t1-1",
    name: "Novato 1",
    positionalKey: "lineman",
    pe: 0,
    skills: [],
    injuries: [],
    alive: true,
    missNextMatch: false,
    valueBonus: 0,
    journeyman: true,
  };

  it("offers a journeyman as scorer (own pool), labeled Novato, and submits its id", async () => {
    const { onSubmit } = renderControls({ roster: [...aliveRoster, journeyman] });
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const tdSelect = screen.getByLabelText(/Jugador/i) as HTMLSelectElement;
    const labels = Array.from(tdSelect.options).map((o) => o.textContent ?? "");
    // The journeyman passes the alive && !missNextMatch pool and is marked
    // Novato with its dorsal (served-array index + 1 → #4 here).
    expect(labels.some((l) => l.includes("Novato 1") && l.includes("Novato"))).toBe(true);
    expect(labels.some((l) => l.includes("(Novato · #4)"))).toBe(true);
    fireEvent.change(tdSelect, { target: { value: journeyman.rosterPlayerId } });
    fireEvent.click(screen.getByRole("button", { name: /Registrar/i }));
    expect(onSubmit).toHaveBeenCalledWith({ type: "td", side: "home", playerRosterId: "journeyman-t1-1" } as LiveCommand);
  });

  it("offers a rival journeyman as a foul victim and as the casualty victim (opponent pool)", async () => {
    renderControls({ opponentRoster: [...opponentRoster, journeyman] });
    fireEvent.click(screen.getByRole("button", { name: "+" }));

    // Foul victim (opponent pool).
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    const foulVictim = screen.getByLabelText(/Víctima de la falta/i) as HTMLSelectElement;
    const foulLabels = Array.from(foulVictim.options).map((o) => o.textContent ?? "");
    expect(foulLabels.some((l) => l.includes("Novato 1") && l.includes("Novato"))).toBe(true);
    expect(foulLabels.some((l) => l.includes("(Novato · #3)"))).toBe(true);

    // Casualty victim (rival pool for the ACTIVE coach's proposal).
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Herida/i }));
    const victim = screen.getByLabelText(/^Víctima$/i) as HTMLSelectElement;
    const victimLabels = Array.from(victim.options).map((o) => o.textContent ?? "");
    expect(victimLabels.some((l) => l.includes("Novato 1") && l.includes("Novato"))).toBe(true);
    expect(victimLabels.some((l) => l.includes("(Novato · #3)"))).toBe(true);
  });

  it("shows the dorsal next to the position for real players in every pool", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const labels = Array.from((screen.getByLabelText(/Jugador/i) as HTMLSelectElement).options).map(
      (o) => o.textContent ?? "",
    );
    // Alive roster order: Blitzer A (#1), Thrower A (#2) — dead B (#3) excluded.
    expect(labels.some((l) => l.includes("Blitzer A (Human Blitzer · #1)"))).toBe(true);
    expect(labels.some((l) => l.includes("Thrower A (Human Thrower · #2)"))).toBe(true);
    expect(labels.some((l) => l.includes("(Novato)"))).toBe(false);
  });

  it("keeps real roster players unlabeled (no Novato marker)", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: "+" }));
    fireEvent.click(screen.getByRole("button", { name: /Touchdown/i }));
    const labels = Array.from((screen.getByLabelText(/Jugador/i) as HTMLSelectElement).options).map(
      (o) => o.textContent ?? "",
    );
    expect(labels.some((l) => l.includes("Blitzer A"))).toBe(true);
    expect(labels.some((l) => l.includes("(Novato)"))).toBe(false);
  });
});
