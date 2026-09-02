import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PlayerActionStrip } from "./playerActionStrip";
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

// The viewer's OWN (home) alive roster: p1 "Aric Blitzer" (#1) and p2 "Bram
// Thrower" (#2). p3 is dead and p4 is suspended (missNextMatch) — both must be
// excluded from the strip chips (RAU-12/RAU-13).
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

function renderControls(props: Partial<Parameters<typeof PlayerActionStrip>[0]> = {}) {
  const onSubmit = vi.fn<MockControl>(async () => {});
  const utils = render(
    <PlayerActionStrip
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

function chip(dorsal: number) {
  return screen.getByRole("button", { name: new RegExp(`#${dorsal}`) });
}

/** Enters a TD / Pase 2-touch on the given player chip and asserts it fires. */
function assertTwoTouch(kind: "td" | "completion", actionLabel: RegExp) {
  const onSubmit = vi.fn<MockControl>(async () => {});
  const cmd: LiveCommand = (kind === "td"
    ? { type: "td", side: "home", playerRosterId: "p1" }
    : { type: "completion", side: "home", playerRosterId: "p1" }) as LiveCommand;
  render(
    <PlayerActionStrip
      viewerSide="home"
      activeSide="home"
      status="live"
      roster={homeRoster}
      opponentRoster={awayOpponent}
      rosterRaceId="human"
      opponentRaceId="human"
      onSubmit={onSubmit}
    />,
  );
  fireEvent.click(chip(1));
  fireEvent.click(screen.getByRole("button", { name: actionLabel }));
  expect(onSubmit).toHaveBeenCalledWith(cmd);
}

describe("PlayerActionStrip — strip + role-aware bubble (Design B, slice b)", () => {
  it("renders ONLY the alive, non-suspended OWN players as chips (RAU-12/13)", () => {
    renderControls();
    expect(chip(1)).toBeTruthy();
    expect(chip(2)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /#3/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /#4/ })).toBeNull();
  });

  it("shows NO strip for a spectator (viewerSide null) — no side, no controls", () => {
    renderControls({ viewerSide: null });
    expect(screen.queryByTestId("player-action-strip")).toBeNull();
  });

  it("shows NO strip when the match is not live (finished)", () => {
    renderControls({ status: "finished" });
    expect(screen.queryByTestId("player-action-strip")).toBeNull();
  });

  it("opens a role-aware bubble when a chip is tapped (active: TD/Pase/Baja/Falta)", () => {
    renderControls();
    fireEvent.click(chip(2));
    const bubble = screen.getByTestId("player-action-bubble");
    expect(bubble).toBeTruthy();
    expect(within(bubble).getByRole("button", { name: /Touchdown/i })).toBeTruthy();
    expect(within(bubble).getByRole("button", { name: /Pase completo/i })).toBeTruthy();
    expect(within(bubble).getByRole("button", { name: /Baja causada/i })).toBeTruthy();
    expect(within(bubble).getByRole("button", { name: /Falta/i })).toBeTruthy();
  });

  it("registers a TD in two touches (the tapped player scores)", () => {
    assertTwoTouch("td", /Touchdown/i);
  });

  it("registers a Pase completo in two touches", () => {
    assertTwoTouch("completion", /Pase completo/i);
  });

  it("guides an ACTIVE coach casualty: cause → rival victim → 1D16 → Registrar (causer prefilled)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderControls({ onSubmit });
    // Tap the causer (p2 #2) and start the caused-casualty flow.
    fireEvent.click(chip(2));
    fireEvent.click(screen.getByRole("button", { name: /Baja causada/i }));
    fireEvent.click(screen.getByRole("button", { name: /Bloqueo/i }));
    fireEvent.click(screen.getByRole("button", { name: /#1 Vrok/i }));
    fireEvent.click(within(screen.getByTestId("roll-stepper-16")).getByTestId("roll-option-5"));
    const submit = screen.getByTestId("player-action-submit");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      causerRosterId: "p2",
      cause: "block",
      roll16: 5,
    } as LiveCommand);
  });

  it("registers a Falta by the tapped player against a rival victim", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderControls({ onSubmit });
    fireEvent.click(chip(1));
    fireEvent.click(screen.getByRole("button", { name: /Falta/i }));
    fireEvent.click(screen.getByRole("button", { name: /#2 Gorr/i }));
    fireEvent.click(screen.getByTestId("player-action-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "foul",
      side: "home",
      playerRosterId: "p1",
      victimRosterId: "o2",
    } as LiveCommand);
  });
});

describe("PlayerActionStrip — NON-active coach (turn rival)", () => {
  function renderNonActive(onSubmit: ReturnType<typeof vi.fn<MockControl>> = vi.fn<MockControl>(async () => {})) {
    const utils = render(
      <PlayerActionStrip
        viewerSide="home"
        activeSide="away" // home is NOT active → non-active role
        status="live"
        roster={homeRoster}
        opponentRoster={awayOpponent}
        rosterRaceId="human"
        opponentRaceId="human"
        onSubmit={onSubmit}
      />,
    );
    return { onSubmit, ...utils };
  }

  it("offers only Baja propia and Baja — ambos derribados in the non-active bubble", () => {
    renderNonActive();
    fireEvent.click(chip(1));
    const bubble = screen.getByTestId("player-action-bubble");
    expect(within(bubble).getByRole("button", { name: /Baja propia/i })).toBeTruthy();
    expect(within(bubble).getByRole("button", { name: /Baja — ambos derribados/i })).toBeTruthy();
    expect(within(bubble).queryByRole("button", { name: /Touchdown/i })).toBeNull();
    expect(within(bubble).queryByRole("button", { name: /Falta/i })).toBeNull();
  });

  it("records a SELF-INFLICTED casualty on the tapped own player (dodge/crowd, no causer)", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderNonActive(onSubmit);
    fireEvent.click(chip(2));
    fireEvent.click(screen.getByRole("button", { name: /Baja propia/i }));
    // dodge/crowd are the self-inflicted causes.
    fireEvent.click(screen.getByRole("button", { name: /Esquivando — se cayó/i }));
    fireEvent.click(within(screen.getByTestId("roll-stepper-16")).getByTestId("roll-option-7"));
    fireEvent.click(screen.getByTestId("player-action-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "home",
      victimRosterId: "p2",
      cause: "dodge",
      roll16: 7,
    } as LiveCommand);
  });

  it("records the BOTH-DOWN casualty: own defender causer (tapped), rival fallen blocker victim, bothDown true", async () => {
    const onSubmit = vi.fn<MockControl>(async () => {});
    renderNonActive(onSubmit);
    fireEvent.click(chip(1)); // own defender (causer, prefill)
    fireEvent.click(screen.getByRole("button", { name: /Baja — ambos derribados/i }));
    fireEvent.click(screen.getByRole("button", { name: /#1 Vrok/i })); // rival fallen blocker (victim)
    fireEvent.click(within(screen.getByTestId("roll-stepper-16")).getByTestId("roll-option-13"));
    // permanent band (13-14) → the required 1D6 group shows only for it.
    const roll6 = screen.getByTestId("roll-stepper-6");
    fireEvent.click(within(roll6).getByTestId("roll-option-4"));
    fireEvent.click(screen.getByTestId("player-action-submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      causerRosterId: "p1",
      cause: "block",
      roll16: 13,
      roll6: 4,
      bothDown: true,
    } as LiveCommand);
  });
});
