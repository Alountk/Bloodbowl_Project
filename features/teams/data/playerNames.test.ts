import { afterEach, describe, expect, it, vi } from "vitest";
import { RACES } from "./races";
import {
  PLAYER_NAME_BANKS,
  PLAYER_SURNAME_BANKS,
  getPlayerNameBank,
  getPlayerSurnameBank,
  randomPlayerName,
} from "./playerNames";

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

  it("provides at least 30 first names per race", () => {
    for (const race of RACES) {
      expect(
        PLAYER_NAME_BANKS[race.id].length,
        `${race.id} has >=30 first names`,
      ).toBeGreaterThanOrEqual(30);
    }
  });

  it("has no duplicate first names within a bank", () => {
    for (const race of RACES) {
      const bank = PLAYER_NAME_BANKS[race.id];
      expect(new Set(bank).size, `${race.id} first names are unique`).toBe(bank.length);
    }
  });

  it("contains only non-empty trimmed strings", () => {
    for (const race of RACES) {
      for (const name of PLAYER_NAME_BANKS[race.id]) {
        expect(typeof name, `${race.id} first name is a string`).toBe("string");
        expect(name.trim(), `${race.id}: "${name}" is already trimmed`).toBe(name);
        expect(name.length, `${race.id}: "${name}" is non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("PLAYER_SURNAME_BANKS", () => {
  it("provides exactly one bank per race id and none for unknown ids", () => {
    const raceIds = new Set(RACES.map((race) => race.id));
    const bankIds = new Set(Object.keys(PLAYER_SURNAME_BANKS));
    expect(bankIds).toEqual(raceIds);
  });

  it("provides at least 12 surnames per race", () => {
    for (const race of RACES) {
      expect(
        PLAYER_SURNAME_BANKS[race.id].length,
        `${race.id} has >=12 surnames`,
      ).toBeGreaterThanOrEqual(12);
    }
  });

  it("has no duplicate surnames within a bank", () => {
    for (const race of RACES) {
      const bank = PLAYER_SURNAME_BANKS[race.id];
      expect(new Set(bank).size, `${race.id} surnames are unique`).toBe(bank.length);
    }
  });

  it("contains only non-empty trimmed strings", () => {
    for (const race of RACES) {
      for (const surname of PLAYER_SURNAME_BANKS[race.id]) {
        expect(typeof surname, `${race.id} surname is a string`).toBe("string");
        expect(surname.trim(), `${race.id}: "${surname}" is already trimmed`).toBe(surname);
        expect(surname.length, `${race.id}: "${surname}" is non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("getPlayerNameBank / getPlayerSurnameBank", () => {
  it("returns the bank for a known race id", () => {
    expect(getPlayerNameBank("orc")).toBe(PLAYER_NAME_BANKS.orc);
    expect(getPlayerSurnameBank("orc")).toBe(PLAYER_SURNAME_BANKS.orc);
  });

  it("returns undefined for an unknown race id", () => {
    expect(getPlayerNameBank("nuffle")).toBeUndefined();
    expect(getPlayerSurnameBank("nuffle")).toBeUndefined();
  });
});

describe("randomPlayerName", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("composes a 'First Surname' name not present in usedNames", () => {
    const firsts = PLAYER_NAME_BANKS.orc;
    const surnames = PLAYER_SURNAME_BANKS.orc;
    const used = new Set([`${firsts[0]} ${surnames[0]}`]);
    const name = randomPlayerName("orc", used);
    const [first, ...rest] = name.split(" ");
    expect(firsts).toContain(first);
    expect(surnames).toContain(rest.join(" "));
    expect(name).not.toBe(`${firsts[0]} ${surnames[0]}`);
    expect(used.has(name)).toBe(false);
  });

  it("never repeats a full name across calls for one roster", () => {
    const used = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 16; i += 1) {
      const name = randomPlayerName("human", used);
      expect(used.has(name)).toBe(false);
      names.add(name);
      used.add(name);
    }
    expect(names.size).toBe(16);
  });

  it("avoids combining a used first name even when that full name is absent", () => {
    const firsts = PLAYER_NAME_BANKS.orc;
    vi.spyOn(Math, "random").mockReturnValue(0);
    const name = randomPlayerName("orc", new Set([firsts[0]]));
    expect(name.startsWith(`${firsts[0]} `)).toBe(false);
  });

  it("falls back to a bare first name when every surname combination is used", () => {
    const firsts = PLAYER_NAME_BANKS.orc;
    const surnames = PLAYER_SURNAME_BANKS.orc;
    const used = new Set<string>();
    for (const first of firsts) {
      for (const surname of surnames) used.add(`${first} ${surname}`);
    }
    // The whole surname space is exhausted -> every available first name.
    const name = randomPlayerName("orc", used);
    expect(firsts).toContain(name);
  });

  it("falls back to a bare first name when the surname bank is absent", () => {
    const firsts = PLAYER_NAME_BANKS.orc;
    const backup = PLAYER_SURNAME_BANKS.orc;
    delete PLAYER_SURNAME_BANKS.orc;
    try {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const name = randomPlayerName("orc");
      expect(firsts).toContain(name);
    } finally {
      PLAYER_SURNAME_BANKS.orc = backup;
    }
  });

  it("falls back to a numbered prefix once everything is exhausted", () => {
    const firsts = PLAYER_NAME_BANKS.orc;
    const surnames = PLAYER_SURNAME_BANKS.orc;
    const used = new Set<string>();
    for (const first of firsts) {
      used.add(first);
      for (const surname of surnames) used.add(`${first} ${surname}`);
    }
    const name = randomPlayerName("orc", used, "Jugador");
    expect(name).toBe(`Jugador ${used.size + 1}`);
  });

  it("falls back to the default prefix for an unknown race id", () => {
    expect(randomPlayerName("nuffle")).toBe("Player 1");
    expect(randomPlayerName("nuffle", new Set(), "Jugador")).toBe("Jugador 1");
  });

  it("treats a missing usedNames set as no used names", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const firsts = PLAYER_NAME_BANKS.orc;
    const surnames = PLAYER_SURNAME_BANKS.orc;
    const name = randomPlayerName("orc");
    const [first, ...rest] = name.split(" ");
    expect(firsts).toContain(first);
    expect(surnames).toContain(rest.join(" "));
  });
});
