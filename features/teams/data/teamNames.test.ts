import { describe, expect, it } from "vitest";
import { RACES } from "./races";
import { TEAM_NAME_BANKS, getTeamNameBank, randomTeamName } from "./teamNames";

describe("TEAM_NAME_BANKS", () => {
  it("provides exactly one bank per race id and none for unknown ids", () => {
    const raceIds = new Set(RACES.map((race) => race.id));
    const bankIds = new Set(Object.keys(TEAM_NAME_BANKS));
    expect(bankIds).toEqual(raceIds);
  });

  it("provides at least 12 team names per race", () => {
    for (const race of RACES) {
      expect(
        TEAM_NAME_BANKS[race.id].length,
        `${race.id} has >=12 team names`,
      ).toBeGreaterThanOrEqual(12);
    }
  });

  it("has no duplicate team names within a bank", () => {
    for (const race of RACES) {
      const bank = TEAM_NAME_BANKS[race.id];
      expect(new Set(bank).size, `${race.id} team names are unique`).toBe(bank.length);
    }
  });

  it("contains only non-empty trimmed strings", () => {
    for (const race of RACES) {
      for (const name of TEAM_NAME_BANKS[race.id]) {
        expect(typeof name, `${race.id} team name is a string`).toBe("string");
        expect(name.trim(), `${race.id}: "${name}" is already trimmed`).toBe(name);
        expect(name.length, `${race.id}: "${name}" is non-empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("getTeamNameBank", () => {
  it("returns the bank for a known race id", () => {
    expect(getTeamNameBank("orc")).toBe(TEAM_NAME_BANKS.orc);
  });

  it("returns undefined for an unknown race id", () => {
    expect(getTeamNameBank("nuffle")).toBeUndefined();
  });
});

describe("randomTeamName", () => {
  it("returns a bank name not present in usedNames", () => {
    const bank = TEAM_NAME_BANKS.orc;
    const name = randomTeamName("orc", new Set([bank[0]]));
    expect(bank).toContain(name);
    expect(name).not.toBe(bank[0]);
  });

  it("returns '' for an unknown race id", () => {
    expect(randomTeamName("nuffle")).toBe("");
  });

  it("returns '' once the bank is exhausted", () => {
    const bank = TEAM_NAME_BANKS.orc;
    expect(randomTeamName("orc", new Set(bank))).toBe("");
  });

  it("treats a missing usedNames set as no used names", () => {
    expect(TEAM_NAME_BANKS.orc).toContain(randomTeamName("orc"));
  });
});
