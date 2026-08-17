import { afterEach, describe, expect, it, vi } from "vitest";
import { RACES } from "./races";
import { PLAYER_NAME_BANKS, getPlayerNameBank, randomPlayerName } from "./playerNames";

describe("PLAYER_NAME_BANKS", () => {
  it("provides exactly one bank per race id and none for unknown ids", () => {
    const raceIds = new Set(RACES.map((race) => race.id));
    const bankIds = new Set(Object.keys(PLAYER_NAME_BANKS));
    expect(bankIds).toEqual(raceIds);
  });

  it("provides a non-empty bank for every race", () => {
    for (const race of RACES) {
      expect(PLAYER_NAME_BANKS[race.id], `${race.id} bank exists`).toBeTruthy();
      expect(
        PLAYER_NAME_BANKS[race.id].length,
        `${race.id} bank is non-empty`,
      ).toBeGreaterThan(0);
    }
  });

  it("provides at least 12 names per race (covers the 16-player max roster)", () => {
    for (const race of RACES) {
      expect(
        PLAYER_NAME_BANKS[race.id].length,
        `${race.id} has >=12 names`,
      ).toBeGreaterThanOrEqual(12);
    }
  });

  it("has no duplicate names within a bank", () => {
    for (const race of RACES) {
      const bank = PLAYER_NAME_BANKS[race.id];
      expect(new Set(bank).size, `${race.id} names are unique`).toBe(bank.length);
    }
  });

  it("contains only non-empty trimmed strings", () => {
    for (const race of RACES) {
      for (const name of PLAYER_NAME_BANKS[race.id]) {
        expect(typeof name, `${race.id} name is a string`).toBe("string");
        expect(name.trim(), `${race.id}: "${name}" is already trimmed`).toBe(name);
        expect(name.length, `${race.id}: "${name}" is non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("getPlayerNameBank", () => {
  it("returns the bank for a known race id", () => {
    expect(getPlayerNameBank("orc")).toBe(PLAYER_NAME_BANKS.orc);
  });

  it("returns undefined for an unknown race id", () => {
    expect(getPlayerNameBank("nuffle")).toBeUndefined();
  });
});

describe("randomPlayerName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a bank name not present in usedNames", () => {
    const bank = PLAYER_NAME_BANKS.orc;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const name = randomPlayerName("orc", new Set([bank[0]]));
    expect(bank).toContain(name);
    expect(name).not.toBe(bank[0]);
  });

  it("avoids every name already used as usedNames grows", () => {
    const bank = PLAYER_NAME_BANKS.orc;
    const used = new Set([bank[0], bank[1]]);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const name = randomPlayerName("orc", used);
    expect(bank).toContain(name);
    expect(used.has(name)).toBe(false);
  });

  it("falls back to a numbered prefix once the bank is exhausted", () => {
    const bank = PLAYER_NAME_BANKS.orc;
    const name = randomPlayerName("orc", new Set(bank), "Jugador");
    expect(name).toBe(`Jugador ${bank.length + 1}`);
  });

  it("falls back to the default prefix for an unknown race id", () => {
    expect(randomPlayerName("nuffle")).toBe("Player 1");
    expect(randomPlayerName("nuffle", new Set(), "Jugador")).toBe("Jugador 1");
  });

  it("treats a missing usedNames set as no used names", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomPlayerName("orc")).toBe(PLAYER_NAME_BANKS.orc[0]);
  });
});
