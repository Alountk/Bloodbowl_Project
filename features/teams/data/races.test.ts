import { describe, expect, it } from "vitest";
import { RACES, getRaceById } from "./races";

describe("race dataset", () => {
  it("contains the 26 BB2020 races", () => {
    expect(RACES).toHaveLength(26);
  });

  it("uses unique race ids", () => {
    const ids = RACES.map((race) => race.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every race within the BB2020 positional limits", () => {
    for (const race of RACES) {
      expect(race.positionals.length, `${race.name} has positionals`).toBeGreaterThan(0);
      for (const positional of race.positionals) {
        expect(positional.max, `${race.name} ${positional.name} max`).toBeGreaterThan(0);
        expect(positional.max, `${race.name} ${positional.name} max`).toBeLessThanOrEqual(16);
        expect(positional.cost, `${race.name} ${positional.name} cost`).toBeGreaterThan(0);
        expect(positional.skills).toBeInstanceOf(Array);
      }
    }
  });

  it("stores known BB2020 values for the Human Lineman", () => {
    const human = getRaceById("human")!;
    const lineman = human.positionals.find((positional) => positional.key === "lineman")!;
    expect(lineman.cost).toBe(50_000);
    expect(lineman.ma).toBe(6);
    expect(lineman.st).toBe(3);
    expect(lineman.ag).toBe("3+");
    expect(lineman.pa).toBe("4+");
    expect(lineman.av).toBe("8+");
  });

  it("resolves a race by id", () => {
    const orc = getRaceById("orc");
    expect(orc?.name).toBe("Orc");
  });

  it("returns undefined for an unknown race id", () => {
    expect(getRaceById("nuffle")).toBeUndefined();
  });

  it("data integrity: every race has rerollCost > 0", () => {
    for (const race of RACES) {
      expect(race.rerollCost, `${race.name} rerollCost`).toBeGreaterThan(0);
    }
  });

  it("data integrity: every positional has a role string", () => {
    for (const race of RACES) {
      for (const positional of race.positionals) {
        expect(
          positional.role,
          `${race.name} → ${positional.name} must have a role`,
        ).toBeTruthy();
      }
    }
  });

  it("data integrity: positional keys are unique within each race", () => {
    for (const race of RACES) {
      const keys = race.positionals.map((p) => p.key);
      expect(
        new Set(keys).size,
        `${race.name} has duplicate positional keys`,
      ).toBe(keys.length);
    }
  });

  it("data integrity: AG/PA/AV match expected format", () => {
    const statPattern = /^\d+\+$|^—$/;
    for (const race of RACES) {
      for (const p of race.positionals) {
        expect(p.ag, `${race.name} ${p.name} ag`).toMatch(statPattern);
        expect(p.pa, `${race.name} ${p.name} pa`).toMatch(statPattern);
        expect(p.av, `${race.name} ${p.name} av`).toMatch(statPattern);
      }
    }
  });

  it("data integrity: MA and ST are numeric", () => {
    for (const race of RACES) {
      for (const p of race.positionals) {
        expect(typeof p.ma, `${race.name} ${p.name} ma`).toBe("number");
        expect(typeof p.st, `${race.name} ${p.name} st`).toBe("number");
      }
    }
  });
});
