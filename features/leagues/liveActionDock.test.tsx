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
    const sheet = screen.getByTestId("live-action-sheet");
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
    expect(screen.queryByTestId("live-action-sheet")).toBeNull();
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
  it("walk the full Baja causada stepper: cause → own causer → rival victim → 1D16 → Registrar", async () => {
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
    // step 4 1D16 (and a 1D6 when the roll is permanent)
    const stepper = within(dock()).getByTestId("dock-roll-stage");
    fireEvent.click(within(stepper).getByTestId("roll-option-5"));
    const submit = within(dock()).getByTestId("live-action-submit");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
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
    // permanent band (13-14) → the required 1D6 group shows only for it.
    const roll6 = screen.getByTestId("roll-stepper-6");
    fireEvent.click(within(roll6).getByTestId("roll-option-4"));
    fireEvent.click(within(dock()).getByTestId("live-action-submit"));
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
    fireEvent.click(within(dock()).getByTestId("live-action-submit"));
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
    fireEvent.click(within(dock()).getByTestId("live-action-submit"));
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
