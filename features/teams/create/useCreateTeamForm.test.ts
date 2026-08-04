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
    expect(result.current.quantities).toEqual({});
  });

  it("resets quantities when the race changes", () => {
    const { result } = setup();
    act(() => result.current.setRaceId("human"));
    act(() => result.current.increment("blitzer"));
    expect(result.current.countPlayers()).toBe(1);

    act(() => result.current.setRaceId("orc"));
    expect(result.current.quantities).toEqual({});
    expect(result.current.countPlayers()).toBe(0);
  });

  it("increments a positional but respects its max", () => {
    const { result } = setup();
    act(() => result.current.setRaceId("human"));
    const human = getRaceById("human")!;
    const blitzer = human.positionals.find((positional) => positional.key === "blitzer")!;

    for (let index = 0; index < blitzer.max; index += 1) {
      act(() => result.current.increment("blitzer"));
    }
    expect(result.current.quantities.blitzer).toBe(blitzer.max);

    act(() => result.current.increment("blitzer"));
    expect(result.current.quantities.blitzer).toBe(blitzer.max);
  });

  it("decrements a positional down to zero", () => {
    const { result } = setup();
    act(() => result.current.setRaceId("human"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.decrement("lineman"));
    expect(result.current.quantities.lineman).toBeUndefined();
    expect(result.current.countPlayers()).toBe(0);
  });

  it("reports an over-budget error on submit", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setName("Norse Raiders"));
    act(() => result.current.setRaceId("dwarf"));
    const dwarf = getRaceById("dwarf")!;
    const deathroller = dwarf.positionals.find(
      (positional) => positional.key === "deathroller",
    )!;

    for (let index = 0; index < deathroller.max; index += 1) {
      act(() => result.current.increment("deathroller"));
    }
    for (let index = 0; index < 2; index += 1) {
      act(() => result.current.increment("troll-slayer"));
    }
    for (let index = 0; index < 10; index += 1) {
      act(() => result.current.increment("lineman"));
    }

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.budget).toMatch(/budget/i);
  });

  it("reports an error when fewer than 3 players are selected", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setName("Tiny Team"));
    act(() => result.current.setRaceId("human"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.increment("lineman"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.players).toMatch(/at least 3/i);
  });

  it("reports an error when the name is empty", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setRaceId("human"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.increment("lineman"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors.name).toMatch(/required/i);
  });

  it("submits valid values and resets the form", () => {
    const onSubmit = vi.fn();
    const { result } = setup(onSubmit);
    act(() => result.current.setName("Reikland Reavers"));
    act(() => result.current.setRaceId("human"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.increment("lineman"));
    act(() => result.current.increment("blitzer"));

    act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as never));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0] as CreateTeamValues;
    expect(values.name).toBe("Reikland Reavers");
    expect(values.raceId).toBe("human");
    expect(values.roster).toEqual([
      { positionalKey: "lineman", quantity: 2 },
      { positionalKey: "blitzer", quantity: 1 },
    ]);

    expect(result.current.name).toBe("");
    expect(result.current.raceId).toBe("");
    expect(result.current.quantities).toEqual({});
  });
});
