import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { LiveActionDock } from "./liveActionDock";
import type { LiveCommand, MatchPlayer } from "./api";

type MockControl = (cmd: LiveCommand) => Promise<void>;

// Deterministic block dice (T17 chain — lib/rules/blocks `blockDie` rolls D6
// faces): a per-test queue over the shared `@/lib/random` seam (same pattern as
// actaDemoHarness.test.tsx). Default 5 = «El defensor tropieza» face.
const dice = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock("@/lib/random", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/random")>();
  return {
    ...actual,
    rollD6: () => dice.queue.shift() ?? 5,
  };
});

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

  it("C2/E: + Evento opens the choice sheet first; the Falta option drives the guided flow (aggressor → rival victim) and fires the foul command", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    // Slice E: the choice step comes first (four recordable events).
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Falta" }));
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

/* ------------------------------------------------------------------------- *
 * Slice E (T4 capture surface): "+ Evento" opens a CHOICE step with the four
 * recordable acta events — Falta · Intercepción · Lanzar compañero · Aterrizar
 * sano. Each option routes through the EXISTING machinery (guided Falta flow /
 * `buildScoredCommand` two-touch) and fires through `sendCommand` like every
 * other action. Labels come from the shared `liveEventLabels` taxonomy. The
 * LM-12 windows (MVA-4) still decide what renders: only the ACTIVE coach on a
 * live turn ever sees the sheet (never a button whose command would 409); V1's
 * legacy chip bar keeps its byte-identical direct Falta flow (no choice step,
 * no vocabulary leak).
 * ------------------------------------------------------------------------- */

describe("Acta + Evento choice sheet (MVA-4 capture surface, Slice E)", () => {
  it("+ Evento opens the six-choice sheet on the acta variant (T17: + Bloqueo; S2: + Cambiar clima)", () => {
    renderActaDock();
    fireEvent.click(actaAction("+ Evento"));
    const modal = within(screen.getByTestId("live-action-modal"));
    const options = modal.getAllByTestId("dock-event-option");
    // INTENTIONAL change (T17 · S10.1): the sheet gains the block chain entry
    // («Bloqueo») — the guided combat capture is a recordable acta event.
    expect(options.map((o) => o.textContent)).toEqual([
      "Bloqueo",
      "Falta",
      "Intercepción",
      "Lanzar compañero",
      "Aterrizar sano",
      "Cambiar clima",
    ]);
  });

  it("Intercepción fires the interception command with its modeled input (own intercepting player)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Intercepción" }));
    // Two-touch like TD/Pase: picking the player fires instantly.
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#2/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "interception",
      side: "home",
      playerRosterId: "p2",
    } as LiveCommand);
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
  });

  it("Lanzar compañero fires the throw-team-mate command (the thrower)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Lanzar compañero" }));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "throwTeamMate",
      side: "home",
      playerRosterId: "p1",
    } as LiveCommand);
  });

  it("Aterrizar sano fires the landed-safe command (the passenger who landed)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Aterrizar sano" }));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "landedSafe",
      side: "home",
      playerRosterId: "p1",
    } as LiveCommand);
    // The MVA-6 float surfaces on the + Evento button (the sheet's entry point).
    const float = document.querySelector(".acta-motion-float-feedback") as HTMLElement | null;
    expect(float?.textContent).toContain("Evento Registrado");
    expect(float?.closest("button")).toBe(actaAction("+ Evento"));
  });

  it("windows filter the choice exactly like the server's LM-12 gates (non-active / wrong-turn / spectator)", () => {
    // NON-active coach: the + Evento entry point itself is out of window, so no
    // choice option can render (every one of them would 409 — MVA-4).
    const nonActive = renderActaDock({ activeSide: "away" });
    expect(within(actaDock()).queryByRole("button", { name: "+ Evento" })).toBeNull();
    expect(screen.queryAllByTestId("dock-event-option")).toEqual([]);
    nonActive.unmount();
    // WRONG TURN (match not live): the dock does not render at all.
    const notLive = renderActaDock({ status: "finished" });
    expect(screen.queryByTestId("acta-capture-dock")).toBeNull();
    expect(screen.queryAllByTestId("dock-event-option")).toEqual([]);
    notLive.unmount();
    // Spectator/admin (no side): nothing renders.
    const spectator = renderActaDock({ viewerSide: null });
    expect(screen.queryByTestId("acta-capture-dock")).toBeNull();
    expect(screen.queryAllByTestId("dock-event-option")).toEqual([]);
    spectator.unmount();
  });

  it("V1 legacy path unchanged: the Falta chip opens the guided flow directly and the new vocabulary never leaks", () => {
    renderDock();
    fireEvent.click(dockAction(/Falta/));
    const modal = screen.getByTestId("live-action-modal");
    // Byte-identical V1 flow: straight to the aggressor step — NO choice step.
    expect(modal.textContent).toContain("Agresor");
    expect(within(modal).queryAllByTestId("dock-event-option")).toEqual([]);
    for (const label of ["Intercepción", "Lanzar compañero", "Aterrizar sano", "Cambiar clima", "+ Evento"]) {
      expect(within(dock()).queryByRole("button", { name: label })).toBeNull();
      expect(within(modal).queryByRole("button", { name: label })).toBeNull();
    }
  });
});

/* ------------------------------------------------------------------------- *
 * S2 (T2 capture): "Cambiar clima" in the + Evento choice sheet — pick the
 * new weather kind (labeled via the shared `weatherLabel` taxonomy), then
 * optionally record the 2D6 that produced it (the rulebook weather roll is
 * 2D6 — 2-12; mirror of the guided roll steppers; "Sin tirada" fires without
 * one). The command rides the SAME
 * onSubmit path as every other capture; the server stays authoritative.
 * ------------------------------------------------------------------------- */

describe("Acta + Evento → Cambiar clima (S2 weather capture)", () => {
  it("walks kind → optional d6 and fires the weather command with the recorded roll", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Cambiar clima" }));
    // The known weather kinds, labeled via weatherLabel (matchSummary taxonomy).
    const kinds = within(actaDock()).getAllByTestId("dock-weather-option");
    expect(kinds.map((k) => k.textContent)).toEqual([
      "Calor asfixiante",
      "Muy soleado",
      "Perfecto",
      "Lluvioso",
      "Ventisca",
    ]);
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Lluvioso" }));
    // The optional 2D6 stage mirrors the guided roll steppers (rulebook: 2-12).
    const rollStage = within(actaDock()).getByTestId("dock-weather-roll");
    fireEvent.click(within(rollStage).getByRole("button", { name: "5" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "weather",
      value: "rain",
      roll: 5,
    } as LiveCommand);
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
    // The MVA-6 float surfaces on the + Evento entry button.
    const float = document.querySelector(".acta-motion-float-feedback") as HTMLElement | null;
    expect(float?.textContent).toContain("Evento Registrado");
  });

  it("offers the rulebook 2D6 outcomes (2-12), never the 1D6 band", async () => {
    renderActaDock({ onSubmit: vi.fn<MockControl>(async () => {}) });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Cambiar clima" }));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Lluvioso" }));
    const rollStage = within(actaDock()).getByTestId("dock-weather-roll");
    const chips = within(rollStage).getAllByTestId("dock-weather-roll-option");
    expect(chips.map((c) => c.textContent)).toEqual([
      "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    ]);
  });

  it("'Sin tirada' fires the weather command without a roll (the d6 stays optional)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Cambiar clima" }));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Ventisca" }));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Sin tirada" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const cmd = onSubmit.mock.calls[0][0] as Extract<LiveCommand, { type: "weather" }>;
    expect(cmd.type).toBe("weather");
    expect(cmd.value).toBe("blizzard");
    expect("roll" in cmd).toBe(false);
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * T17 (S4 step 2b — S10.1/S10.2/S10.4.1): the guided BLOCK ACTION recorded as
 * the real combat chain — block dice by ST (lib/rules/blocks, imported never
 * transcribed) -> pick a face -> standalone knockdown entry -> armour 2D6 vs
 * the victim's AV -> when broken, the VICTIM's owner side gets a
 * pending-injury callout to record the 1D16 (+1D6 on Permanente). The injury
 * capture carries NO causer (S10.4.1 «el jugador que recibe marca la herida»):
 * the badge must name the victim's coach and the causal context already rides
 * the knockdown row. Entry point: «+ Evento» -> «Bloqueo» (acta variant).
 * ------------------------------------------------------------------------- */

const asVictimView = (
  rerender: (ui: ReactElement) => void,
  onSubmit: MockControl,
) =>
  rerender(
    <LiveActionDock
      viewerSide="away"
      activeSide="home"
      status="live"
      roster={awayOpponent}
      opponentRoster={homeRoster}
      rosterRaceId="human"
      opponentRaceId="human"
      onSubmit={onSubmit}
      variant="acta"
    />,
  );

/** Walks «+ Evento» -> «Bloqueo» -> causer #1 -> victim #1 up to the block
 *  dice stage (nothing rolled yet). */
const walkToBlockRoll = () => {
  fireEvent.click(actaAction("+ Evento"));
  fireEvent.click(within(actaDock()).getByRole("button", { name: "Bloqueo" }));
  fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
  fireEvent.click(within(actaPool("rival")).getByRole("button", { name: /#1/i }));
};

/** Throws the queued block dice and advances to the face stage. */
const throwDice = (d6faces: number[]) => {
  dice.queue = d6faces;
  fireEvent.click(
    within(screen.getByTestId("dock-block-roll")).getByRole("button", {
      name: "Tirar dados de bloqueo",
    }),
  );
};

const faceChip = (label: string) =>
  within(screen.getByTestId("dock-block-face")).getByRole("button", { name: label });

const armourChip = (value: string) =>
  within(screen.getByTestId("dock-armour-roll")).getByRole("button", { name: value });

describe("Acta + Evento → Bloqueo (T17 combat chain)", () => {
  it("walks the real chain: block dice by ST -> face -> knockdown -> armour 2D6 vs AR (tackler-side knockdown fires)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    walkToBlockRoll();
    const rollStage = screen.getByTestId("dock-block-roll");
    // ST comparison drives the dice count (3 vs 3 -> 2 dice, standard BB).
    expect(rollStage.textContent).toContain("FUE 3 vs FUE 3 · 2 dados");
    throwDice([6, 1]); // faces: El defensor cae + El atacante cae
    // The rolled faces are the pickable chips of the next stage.
    const faceStage = screen.getByTestId("dock-block-face");
    expect(faceStage.textContent).toContain("El defensor cae");
    expect(faceStage.textContent).toContain("El atacante cae");
    fireEvent.click(faceChip("El defensor cae"));
    // Armour stage: 2D6 vs the victim's catalog AV (human blitzer = AR 9).
    const armourStage = screen.getByTestId("dock-armour-roll");
    expect(armourStage.textContent).toContain("Armadura de Vrok · AR 9+");
    fireEvent.click(armourChip("10"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // S10.4.1: the tackler's coach reports the placaje — `side` is the
    // recorder's and the chain travels whole (dice, face, armour vs AV).
    expect(onSubmit).toHaveBeenCalledWith({
      type: "knockdown",
      side: "home",
      causerRosterId: "p1",
      victimRosterId: "o1",
      blockDice: ["defenderDown", "attackerDown"],
      face: "defenderDown",
      armourRoll: 10,
      victimAv: 9,
      armourBroken: true,
    });
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
  });

  it("rolls ONE block die when the attacker's ST is below the defender's (block dice by ST)", () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({
      onSubmit,
      opponentRoster: [rosterPlayer({ id: "o9", name: "Ogryn", positionalKey: "ogre" })],
    });
    fireEvent.click(actaAction("+ Evento"));
    fireEvent.click(within(actaDock()).getByRole("button", { name: "Bloqueo" }));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    fireEvent.click(within(actaPool("rival")).getByRole("button", { name: /#1/i }));
    const rollStage = screen.getByTestId("dock-block-roll");
    // FUE 3 (blitzer) vs FUE 5 (ogre) -> 1 die.
    expect(rollStage.textContent).toContain("FUE 3 vs FUE 5 · 1 dado");
  });

  it("S10.2: armour holding ends the chain with the standalone knockdown entry (no pending injury)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    const { rerender } = renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([6, 1]);
    fireEvent.click(faceChip("El defensor cae"));
    fireEvent.click(armourChip("5")); // 5 vs AR 9 -> intacta
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "knockdown",
      side: "home",
      causerRosterId: "p1",
      victimRosterId: "o1",
      blockDice: ["defenderDown", "attackerDown"],
      face: "defenderDown",
      armourRoll: 5,
      victimAv: 9,
      armourBroken: false,
    });
    // No injury potential -> the victim side gets NO callout.
    asVictimView(rerender, onSubmit);
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
  });

  it("a Push face records NOTHING (no knockdown entry) and closes the sheet", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([3, 3]); // both faces Push
    expect(screen.getByTestId("dock-block-face").textContent).toContain("Empujón");
    fireEvent.click(faceChip("Empujón"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
  });

  it("«Ambos caen» / «El atacante cae» register the knockdown row ONLY (S10.3 backlog — no armour stage)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    const { rerender } = renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([2, 2]); // both faces Both Down
    fireEvent.click(faceChip("Ambos caen"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // Standalone derribo entry, NO armour fields (both-down injuries backlog).
    expect(onSubmit).toHaveBeenCalledWith({
      type: "knockdown",
      side: "home",
      causerRosterId: "p1",
      victimRosterId: "o1",
      blockDice: ["bothDown", "bothDown"],
      face: "bothDown",
    });
    expect(screen.queryByTestId("dock-armour-roll")).toBeNull();
    // TRIANGULATE: the attacker-down face follows the same row-only path.
    walkToBlockRoll();
    throwDice([1, 1]);
    fireEvent.click(faceChip("El atacante cae"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ face: "attackerDown" });
    expect("armourRoll" in (onSubmit.mock.calls[1][0] as object)).toBe(false);
    // Neither row opens a victim-side injury callout.
    asVictimView(rerender, onSubmit);
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
  });

  it("S10.4.1: after a broken armour the VICTIM's side gets the pending-injury callout and records the 1D16 (no causer)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    const { rerender } = renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([6, 1]);
    fireEvent.click(faceChip("El defensor cae"));
    fireEvent.click(armourChip("10")); // 10 > AR 9 -> rota
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The TACKLER side never sees the victim's callout.
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();

    // The victim's owner (perspective flip) gets the pending-injury callout.
    asVictimView(rerender, onSubmit);
    const callout = screen.getByTestId("dock-pending-injury");
    expect(callout.textContent).toContain("TIRADA DE LESIÓN PENDIENTE");
    expect(callout.textContent).toContain("Vrok (#1)");
    expect(callout.textContent).toContain("tras romperse la armadura");

    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-8"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      cause: "block",
      roll16: 8,
    });
    // Roll-inclusive and CAUSER-LESS (the badge must name the recorder).
    expect("causerRosterId" in (onSubmit.mock.calls[1][0] as object)).toBe(false);
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
  });

  it("the Permanente band waits for the 1D6 before firing the injury capture", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    const { rerender } = renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([6, 1]);
    fireEvent.click(faceChip("El defensor cae"));
    fireEvent.click(armourChip("12"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    asVictimView(rerender, onSubmit);
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-13")); // Permanente
    expect(onSubmit).toHaveBeenCalledTimes(1); // still silent
    fireEvent.click(
      within(screen.getByTestId("roll-stepper-6")).getByTestId("roll-option-4"),
    );
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      cause: "block",
      roll16: 13,
      roll6: 4,
    });
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
  });

  it("«Sin herida» dismisses the pending callout without any command (S10.4.1 «solo si llega a producirse»)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    const { rerender } = renderActaDock({ onSubmit });
    walkToBlockRoll();
    throwDice([6, 1]);
    fireEvent.click(faceChip("El defensor cae"));
    fireEvent.click(armourChip("11"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    asVictimView(rerender, onSubmit);
    expect(screen.getByTestId("dock-pending-injury")).toBeTruthy();
    fireEvent.click(screen.getByTestId("dock-injury-dismiss"));
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1); // only the knockdown
  });
});
