import { describe, expect, it } from "vitest";
import { RACES, getRaceById } from "./races";

describe("race dataset", () => {
  it("contains the 8 core BB2020 races", () => {
    expect(RACES).toHaveLength(8);
    const names = RACES.map((race) => race.name).sort();
    expect(names).toEqual([
      "Chaos Chosen",
      "Dark Elf",
      "Dwarf",
      "Elven Union",
      "Human",
      "Orc",
      "Shambling Undead",
      "Skaven",
    ]);
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
});
