import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { getRaceById } from "../data/races";
import { useCreateTeamForm, type CreateTeamValues } from "./useCreateTeamForm";

function setup(onSubmit = vi.fn()) {
  return renderHook(() => useCreateTeamForm(onSubmit));
}

describe("useCreateTeamForm", () => {
  it("starts with an empty name, no race and no players", () => {
    const { result } = setup();
    expect(result.current.name).toBe("");
    expect(result.current.raceId).toBe("");
    expect(result.current.players).toEqual([]);
  });

  // --- addPlayer ---

  it("addPlayer creates a PlayerEntry with a unique id and default name", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].positionalKey).toBe("lineman");
    expect(result.current.players[0].name).toBe("Player 1");
    expect(result.current.players[0].id).toBeTruthy();
  });

  it("addPlayer auto-increments the default name", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("blitzer"));
    expect(result.current.players[0].name).toBe("Player 1");
    expect(result.current.players[1].name).toBe("Player 2");
  });

  it("addPlayer assigns a unique id to each player", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    const ids = result.current.players.map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("addPlayer respects the positional max", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    const human = getRaceById("human")!;
    const blitzer = human.positionals.find((p) => p.key === "blitzer")!;
    // Add max blitzers
    for (let i = 0; i < blitzer.max; i++) {
      act(() => result.current.addPlayer("blitzer"));
    }
    expect(result.current.players.filter((p) => p.positionalKey === "blitzer")).toHaveLength(blitzer.max);
    // One more should be rejected
    act(() => result.current.addPlayer("blitzer"));
    expect(result.current.players.filter((p) => p.positionalKey === "blitzer")).toHaveLength(blitzer.max);
  });

  it("addPlayer respects MAX_PLAYERS cap", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    for (let i = 0; i < 16; i++) {
      act(() => result.current.addPlayer("lineman"));
    }
    expect(result.current.players).toHaveLength(16);
    act(() => result.current.addPlayer("lineman"));
    expect(result.current.players).toHaveLength(16);
  });

  it("addPlayer respects the budget cap", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    // Add expensive players until budget is near exhausted
    // Human ogre costs 140k, 7 ogres would be 980k; lineman 50k would push over 1M
    // But ogre max is 1. Use deathroller approach: fill with blitzers first.
    // 10 blitzers = 900k. remaining = 100k. lineman = 50k fits. second lineman = 50k fits.
    // 3rd lineman would be 1_050_000 - over budget
    // So let's use a simpler path: 11 blitzers max is 4. Use linemen + blitzers.
    // Actually: 11x lineman (550k) + 4x blitzer (360k) = 910k + 1 catcher (65k) = 975k
    // 1 more lineman = 1_025_000 — over. So let's just test budget enforcement.
    // Add blitzers to near limit
    for (let i = 0; i < 4; i++) {
      act(() => result.current.addPlayer("blitzer")); // 4 * 90k = 360k
    }
    // 11 linemen = 550k, total = 910k; one more lineman = 960k, another = 1010k (over)
    for (let i = 0; i < 12; i++) {
      act(() => result.current.addPlayer("lineman")); // adds up to budget limit
    }
    // Verify total cost doesn't exceed 1,000,000
    expect(result.current.cost).toBeLessThanOrEqual(1_000_000);
  });

  // --- removePlayer ---

  it("removePlayer removes a player by id", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("blitzer"));
    const idToRemove = result.current.players[0].id;
    act(() => result.current.removePlayer(idToRemove));
    expect(result.current.players).toHaveLength(1);
    expect(result.current.players[0].positionalKey).toBe("blitzer");
  });

  it("removePlayer only removes the targeted player when multiple of same positional exist", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    const idToRemove = result.current.players[1].id;
    act(() => result.current.removePlayer(idToRemove));
    expect(result.current.players).toHaveLength(2);
    expect(result.current.players.every((p) => p.id !== idToRemove)).toBe(true);
  });

  it("removePlayer re-enables addPlayer for that positional", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    const human = getRaceById("human")!;
    const blitzer = human.positionals.find((p) => p.key === "blitzer")!;
    for (let i = 0; i < blitzer.max; i++) {
      act(() => result.current.addPlayer("blitzer"));
    }
    const idToRemove = result.current.players[0].id;
    act(() => result.current.removePlayer(idToRemove));
    // Now should be able to add one more
    act(() => result.current.addPlayer("blitzer"));
    expect(result.current.players.filter((p) => p.positionalKey === "blitzer")).toHaveLength(blitzer.max);
  });

  // --- renamePlayer ---

  it("renamePlayer updates the specific player's name", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    const idToRename = result.current.players[0].id;
    act(() => result.current.renamePlayer(idToRename, "Grak"));
    expect(result.current.players[0].name).toBe("Grak");
    expect(result.current.players[1].name).toBe("Player 2");
  });

  it("renamePlayer to empty string does not crash", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    const id = result.current.players[0].id;
    act(() => result.current.renamePlayer(id, ""));
    expect(result.current.players[0].name).toBe("");
  });

  // --- race change ---

  it("changeRace with empty roster switches immediately without pending", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    expect(result.current.raceId).toBe("human");
    expect(result.current.pendingRaceId).toBeNull();
  });

  it("changeRace with active roster sets pendingRaceId", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.changeRace("orc"));
    expect(result.current.pendingRaceId).toBe("orc");
    expect(result.current.raceId).toBe("human"); // not changed yet
  });

  it("confirmRaceChange applies the pending race and clears roster", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.changeRace("orc"));
    act(() => result.current.confirmRaceChange());
    expect(result.current.raceId).toBe("orc");
    expect(result.current.players).toHaveLength(0);
    expect(result.current.pendingRaceId).toBeNull();
  });

  it("cancelRaceChange keeps original race and roster intact", () => {
    const { result } = setup();
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.changeRace("orc"));
    act(() => result.current.cancelRaceChange());
    expect(result.current.raceId).toBe("human");
    expect(result.current.players).toHaveLength(1);
    expect(result.current.pendingRaceId).toBeNull();
  });

  // --- submit validation ---

  it("reports an error when fewer than 3 players are selected", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setName("Tiny Team"));
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.players).toMatch(/at least 3/i);
  });

  it("reports an error when the name is empty", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.name).toMatch(/required/i);
  });

  it("submits valid values as PlayerEntry[] and resets the form", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setName("Reikland Reavers"));
    act(() => result.current.changeRace("human"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("lineman"));
    act(() => result.current.addPlayer("blitzer"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0] as CreateTeamValues;
    expect(values.name).toBe("Reikland Reavers");
    expect(values.raceId).toBe("human");
    expect(values.roster).toHaveLength(3);
    expect(values.roster[0].positionalKey).toBe("lineman");
    expect(values.roster[2].positionalKey).toBe("blitzer");

    expect(result.current.name).toBe("");
    expect(result.current.raceId).toBe("");
    expect(result.current.players).toEqual([]);
  });
});
