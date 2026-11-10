import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { LiveActionDock } from "./liveActionDock";
import type { LiveCommand, MatchPlayer } from "./api";

type MockControl = (cmd: LiveCommand) => Promise<void>;

function rosterPlayer(seed: Partial<Omit<MatchPlayer, "rosterPlayerId">> & { id: string }): MatchPlayer {
  return {
    rosterPlayerId: seed.id,
    name: seed.name ?? "Unnamed",
    positionalKey: seed.positionalKey ?? "lineman",
    pe: seed.pe ?? 0,
    skills: seed.skills ?? [],
    injuries: seed.injuries ?? [],
    alive: seed.alive ?? true,
    missNextMatch: seed.missNextMatch ?? false,
    valueBonus: seed.valueBonus ?? 0,
    journeyman: seed.journeyman,
  };
}

// Viewer's OWN (home) roster: p1 "Aric Blitzer" #1, p2 "Bram Thrower" #2, p3 dead,
// p4 suspended. Only p1/p2 are dock-eligible (RAU-12/13).
const homeRoster = [
  rosterPlayer({ id: "p1", name: "Aric", positionalKey: "blitzer" }),
  rosterPlayer({ id: "p2", name: "Bram", positionalKey: "thrower" }),
  rosterPlayer({ id: "p3", name: "Ced", positionalKey: "lineman", alive: false }),
  rosterPlayer({ id: "p4", name: "Dun", positionalKey: "lineman", missNextMatch: true }),
];

const awayOpponent = [
  rosterPlayer({ id: "o1", name: "Vrok", positionalKey: "blitzer" }),
  rosterPlayer({ id: "o2", name: "Gorr", positionalKey: "lineman" }),
];

function renderDock(props: Partial<Parameters<typeof LiveActionDock>[0]> = {}) {
  const onSubmit = vi.fn<MockControl>(async () => {});
  const utils = render(
    <LiveActionDock
      viewerSide="home"
      activeSide="home"
      status="live"
      roster={homeRoster}
      opponentRoster={awayOpponent}
      rosterRaceId="human"
      opponentRaceId="human"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, ...utils };
}

const dock = () => screen.getByTestId("live-action-dock");
const dockAction = (label: RegExp) => within(dock()).getByRole("button", { name: label });
const dockPool = (id: "own" | "rival") => within(dock()).getByTestId(`dock-pool-${id}`);

describe("LiveActionDock — states (Design A)", () => {
  it("renders the ACTIVE dock with TD / Pase / Baja causada / Falta chips", () => {
    renderDock();
    expect(dock()).toBeTruthy();
    expect(dockAction(/Touchdown/)).toBeTruthy();
    expect(dockAction(/Pase completo/)).toBeTruthy();
    expect(dockAction(/Baja causada/)).toBeTruthy();
    expect(dockAction(/Falta/)).toBeTruthy();
  });

  it("renders the NON-active dock with only Baja propia + Baja ambos derribados", () => {
    renderDock({ activeSide: "away" }); // home is NOT active
    expect(dockAction(/Baja propia/)).toBeTruthy();
    expect(dockAction(/Baja — ambos derribados/)).toBeTruthy();
    expect(within(dock()).queryByRole("button", { name: /Touchdown/ })).toBeNull();
    expect(within(dock()).queryByRole("button", { name: /Falta/ })).toBeNull();
  });

  it("shows NO dock for a spectator (viewerSide null) or when not live", () => {
    renderDock({ viewerSide: null });
    expect(screen.queryByTestId("live-action-dock")).toBeNull();
  });

  it("shows NO dock when the match is not live (finished)", () => {
    renderDock({ status: "finished" });
    expect(screen.queryByTestId("live-action-dock")).toBeNull();
  });
});

describe("LiveActionDock — two-touch TD / Pase (action → player)", () => {
  it("records a Touchdown in two touches (the whole sheet closes)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Touchdown/));
    const sheet = screen.getByTestId("live-action-modal");
    // Only alive, non-suspended home players are offered.
    expect(within(sheet).queryByRole("button", { name: /#3/ })).toBeNull();
    expect(within(sheet).queryByRole("button", { name: /#4/ })).toBeNull();
    fireEvent.click(within(dockPool("own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "td",
      side: "home",
      playerRosterId: "p1",
    } as LiveCommand);
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
  });

  it("records a Pase completo in two touches", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Pase completo/));
    fireEvent.click(within(dockPool("own")).getByRole("button", { name: /#2/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "completion",
      side: "home",
      playerRosterId: "p2",
    } as LiveCommand);
  });
});

describe("LiveActionDock — ACTIVE guided casualty (stepper recap, Design A)", () => {
  it("walk the full Baja causada stepper: cause → own causer → rival victim → 1D16 fires automatically", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Baja causada/));
    // step 1 cause
    const causes = within(dock()).getByTestId("dock-cause-pool");
    fireEvent.click(within(causes).getByRole("button", { name: /Bloqueo/ }));
    // step 2 own causer (p2)
    fireEvent.click(within(dockPool("own")).getByRole("button", { name: /#2/i }));
    // step 3 rival victim (#1 Vrok)
    fireEvent.click(within(dockPool("rival")).getByRole("button", { name: /#1/i }));
    // step 4 1D16 → the command fires with no Registrar button
    const stepper = within(dock()).getByTestId("dock-roll-stage");
    fireEvent.click(within(stepper).getByTestId("roll-option-5"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The ACTIVE (home) coach inflicts it on the AWAY victim side: causer =
    // home p2, victim = away o1 (the event's `side` is the VICTIM's).
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      causerRosterId: "p2",
      cause: "block",
      roll16: 5,
    } as LiveCommand);
  });
});

describe("LiveActionDock — NON-active both-down + self-inflicted (DEC-1)", () => {
  it("offers rival fallen BLOCKER as the both-down victim (rival over the causer)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit, activeSide: "away" });
    fireEvent.click(dockAction(/Baja — ambos derribados/));
    const ownPool = within(dock()).getByTestId("dock-pool-own");
    expect(ownPool).toBeTruthy();
    // causer = own defender (#1) then victim = RIVAL blocker (#2 Gorr) DEC-1.
    fireEvent.click(within(ownPool).getByRole("button", { name: /#1/i }));
    const rivalPool = within(dock()).getByTestId("dock-pool-rival");
    fireEvent.click(within(rivalPool).getByRole("button", { name: /#2/i }));
    const stepper = within(dock()).getByTestId("dock-roll-stage");
    fireEvent.click(within(stepper).getByTestId("roll-option-13"));
    // permanent band (13-14) → the required 1D6 group shows only for it, and the
    // flow fires on the completing 1D6 pick (no Registrar button).
    const roll6 = screen.getByTestId("roll-stepper-6");
    fireEvent.click(within(roll6).getByTestId("roll-option-4"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o2",
      causerRosterId: "p1",
      cause: "block",
      roll16: 13,
      roll6: 4,
      bothDown: true,
    } as LiveCommand);
  });

  it("records a SELF-INFLICTED casualty on the tapped own player (dodge/crowd, no causer)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit, activeSide: "away" });
    fireEvent.click(dockAction(/Baja propia/));
    // own fallen player is the VICTIM of their own dodge.
    fireEvent.click(within(dockPool("own")).getByRole("button", { name: /#1/i }));
    // self-cause options exclude the causer-required ones.
    const causes = within(dock()).getByTestId("dock-cause-pool");
    fireEvent.click(within(causes).getByRole("button", { name: /Esquivando — se cayó/ }));
    const stepper = within(dock()).getByTestId("dock-roll-stage");
    fireEvent.click(within(stepper).getByTestId("roll-option-7"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      cause: "dodge",
      roll16: 7,
    } as LiveCommand);
  });
});

describe("LiveActionDock — Falta (aggressor → rival) and ack stays in cards", () => {
  it("records a Falta by the tapped own player against a rival victim", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Falta/));
    fireEvent.click(within(dockPool("own")).getByRole("button", { name: /#1/i }));
    fireEvent.click(within(dockPool("rival")).getByRole("button", { name: /#2/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "foul",
      side: "home",
      playerRosterId: "p1",
      victimRosterId: "o2",
    } as LiveCommand);
  });

  it("never renders ack ✓/✗ controls (ack stays on the feed cards)", () => {
    renderDock();
    expect(within(dock()).queryByRole("button", { name: /✓ Correcto/ })).toBeNull();
    expect(within(dock()).queryByRole("button", { name: /✗ Revisar/ })).toBeNull();
  });
});

describe("LiveActionDock — bottom 'Dar el turno' + reason modal (MVT-7/LM-28)", () => {
  it("offers ONLY the ACTIVE coach a 'Dar el turno' chip in the dock bar", () => {
    renderDock(); // home active
    expect(dockAction(/Dar el turno/i)).toBeTruthy();
  });

  it("shows NO 'Dar el turno' chip for the NON-active coach (keeps the casualty records)", () => {
    renderDock({ activeSide: "away" });
    expect(within(dock()).queryByRole("button", { name: /Dar el turno/i })).toBeNull();
    // the non-active dock keeps its legal casualty records
    expect(dockAction(/Baja propia/)).toBeTruthy();
  });

  it("opens the reason modal with NO preselection, and 'Tirada fallida' fires turnover immediately", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Dar el turno/i));
    const modal = within(screen.getByTestId("live-action-modal"));
    // three reason chips, all unpressed until one is clicked
    for (const name of [/Voluntario/, /Tirada fallida/, /Baja/]) {
      expect(modal.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("false");
    }
    // clicking a reason fires endTurn immediately (no Confirmar)
    fireEvent.click(modal.getByRole("button", { name: /Tirada fallida/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ type: "endTurn", side: "home", reason: "turnover" });
  });

  it("fires a voluntary endTurn from the 'Voluntario' chip", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Dar el turno/i));
    fireEvent.click(
      within(screen.getByTestId("live-action-modal")).getByRole("button", { name: /Voluntario/ }),
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ type: "endTurn", side: "home", reason: "voluntary" });
  });

  it("fires an injury endTurn from the 'Baja' chip", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Dar el turno/i));
    fireEvent.click(
      within(screen.getByTestId("live-action-modal")).getByRole("button", { name: "Baja" }),
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ type: "endTurn", side: "home", reason: "injury" });
  });

  it("dismissing/closing the modal cancels WITHOUT firing a command", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderDock({ onSubmit });
    fireEvent.click(dockAction(/Dar el turno/i));
    const modal = within(screen.getByTestId("live-action-modal"));
    fireEvent.click(modal.getByRole("button", { name: /Cerrar/ }));
    await waitFor(() => expect(screen.queryByTestId("live-action-modal")).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
    // the dock chip is still available for another pass
    expect(dockAction(/Dar el turno/i)).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * T9 Slice C (MVA-5 · `openspec/changes/match-live-acta`): the Acta en Vivo
 * QUICK-CAPTURE dock (artboard 08 "FIXED BOTTOM QUICK-CAPTURE ACTION DOCK").
 * The `variant="acta"` bar is a restyle over the SAME command machinery — the
 * guided sheets (`live-action-modal` + pools + `RollStepper`) and the
 * `liveActionEntry` builders fire exactly as the legacy dock does.
 * Rules pinned here:
 *  - C1: the five artboard actions render (icon + uppercase label): + TD,
 *    + Pase, + Baja, + Evento, Fin Turno (high-contrast red), 5-col grid.
 *  - C2: every action drives the EXISTING command through the existing sheet
 *    (td / completion / foul / casualty / endTurn — nothing new).
 *  - INTEGRITY (Slice B verification L12): "+ Baja" opens the ROLL-INCLUSIVE
 *    guided casualty entry — no casualty command may ever fire without its
 *    roll16 (+1D6 on the permanent band), so `deriveTeamStats` never
 *    double-counts one victim. Never a roll-less casualty command.
 *  - V1 unchanged: the legacy variant keeps its chip bar and never renders
 *    the artboard vocabulary (and vice versa).
 * ------------------------------------------------------------------------- */

const renderActaDock = (props: Partial<Parameters<typeof LiveActionDock>[0]> = {}) =>
  renderDock({ ...props, variant: "acta" });
const actaDock = () => screen.getByTestId("acta-capture-dock");
const actaAction = (name: string) => within(actaDock()).getByRole("button", { name });
const actaPool = (id: "own" | "rival") => within(actaDock()).getByTestId(`dock-pool-${id}`);

describe("Acta quick-capture dock (MVA-5 · T9 Slice C)", () => {
  it("C1: renders the five artboard actions (button role + labels verbatim) in the 5-col grid", () => {
    renderActaDock();
    const bar = actaDock();
    expect(bar).toBeTruthy();
    for (const label of ["+ TD", "+ Pase", "+ Baja", "+ Evento", "Fin Turno"]) {
      expect(within(bar).getByRole("button", { name: label })).toBeTruthy();
    }
    expect(within(bar).getByTestId("acta-capture-grid").className).toContain("grid-cols-5");
  });

  it("C2: + TD and + Pase fire the scored commands through the existing two-touch sheet", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    // + TD → pick the own scorer → fires instantly (existing machinery).
    fireEvent.click(actaAction("+ TD"));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "td",
      side: "home",
      playerRosterId: "p1",
    } as LiveCommand);
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
    // + Pase → pick the own thrower → completion command.
    fireEvent.click(actaAction("+ Pase"));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#2/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "completion",
      side: "home",
      playerRosterId: "p2",
    } as LiveCommand);
  });

  it("C2: + Evento drives the guided Falta flow (aggressor → rival victim) and fires the foul command", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    const modalEl = screen.getByTestId("live-action-modal");
    expect(modalEl.textContent).toContain("Agresor");
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    fireEvent.click(within(actaPool("rival")).getByRole("button", { name: /#2/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "foul",
      side: "home",
      playerRosterId: "p1",
      victimRosterId: "o2",
    } as LiveCommand);
  });

  it("INTEGRITY: + Baja opens the roll-inclusive guided entry — never a roll-less casualty command", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Baja"));
    // The EXISTING guided casualty entry: cause → own causer → rival victim.
    const causes = within(actaDock()).getByTestId("dock-cause-pool");
    fireEvent.click(within(causes).getByRole("button", { name: /Bloqueo/ }));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#2/i }));
    fireEvent.click(within(actaPool("rival")).getByRole("button", { name: /#1/i }));
    // The 1D16 stage is REQUIRED: nothing may fire before the injury roll.
    const stepper = within(actaDock()).getByTestId("dock-roll-stage");
    expect(stepper).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    // Permanent band (13-14) additionally requires the 1D6 — still silent.
    fireEvent.click(within(stepper).getByTestId("roll-option-13"));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId("roll-stepper-6")).getByTestId("roll-option-4"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The fired command is ROLL-INCLUSIVE (roll16 + roll6 travel to the server).
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      causerRosterId: "p2",
      cause: "block",
      roll16: 13,
      roll6: 4,
    } as LiveCommand);
    const fired = onSubmit.mock.calls[0][0] as Extract<LiveCommand, { type: "casualty" }>;
    expect(typeof fired.roll16).toBe("number");
  });

  it("Fin Turno opens the existing reason sheet and fires the pass-turn command", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("Fin Turno"));
    const modal = within(screen.getByTestId("live-action-modal"));
    fireEvent.click(modal.getByRole("button", { name: /Voluntario/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "endTurn",
      side: "home",
      reason: "voluntary",
    } as LiveCommand);
  });

  it("V1 unchanged: the legacy bar keeps its chips and neither variant leaks the other's vocabulary", () => {
    // Legacy (default variant) — the V1 vocabulary stays byte-identical.
    renderDock();
    expect(dockAction(/Dar el turno/i)).toBeTruthy();
    expect(dockAction(/Touchdown/)).toBeTruthy();
    expect(dockAction(/Pase completo/)).toBeTruthy();
    expect(dockAction(/Baja causada/)).toBeTruthy();
    expect(dockAction(/Falta/)).toBeTruthy();
    for (const label of ["+ TD", "+ Pase", "+ Baja", "+ Evento", "Fin Turno"]) {
      expect(within(dock()).queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("V1 unchanged: the acta variant never renders the legacy chip vocabulary", () => {
    renderActaDock();
    for (const label of ["Dar el turno", "Touchdown", "Pase completo", "Baja causada", "Falta"]) {
      expect(within(actaDock()).queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("TRIANGULATE: the non-active coach keeps only LM-12-legal casualty records (roll-inclusive)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit, activeSide: "away" });
    // No 409 button ever renders for the non-active coach (MVA-4 principle).
    expect(within(actaDock()).queryByRole("button", { name: "+ TD" })).toBeNull();
    expect(within(actaDock()).queryByRole("button", { name: "Fin Turno" })).toBeNull();
    expect(within(actaDock()).getByTestId("acta-capture-grid").className).toContain("grid-cols-2");
    // "Baja propia" walks the SAME guided entry and carries its roll16.
    fireEvent.click(actaAction("Baja propia"));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    const causes = within(actaDock()).getByTestId("dock-cause-pool");
    fireEvent.click(within(causes).getByRole("button", { name: /Esquivando — se cayó/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    const stepper = within(actaDock()).getByTestId("dock-roll-stage");
    fireEvent.click(within(stepper).getByTestId("roll-option-7"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      cause: "dodge",
      roll16: 7,
    } as LiveCommand);
  });
});
