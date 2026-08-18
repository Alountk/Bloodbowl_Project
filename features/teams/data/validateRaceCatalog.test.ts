import { describe, expect, it } from "vitest";
import type { Race } from "../types";
import type { SkillId } from "./skills";
import { RACES } from "./races";
import { validateRaceCatalog } from "./validateRaceCatalog";

function fakeRace(): Race {
  return {
    id: "fake",
    name: "Fake",
    rerollCost: 50_000,
    positionals: [
      {
        key: "lineman",
        name: "Lineman",
        role: "Lineman",
        cost: 50_000,
        max: 16,
        accessPrimary: ["G"],
        accessSecondary: ["A"],
        ma: 6,
        st: 3,
        ag: "3+",
        pa: "4+",
        av: "9+",
        skills: [],
      },
    ],
  };
}

describe("validateRaceCatalog", () => {
  it("reports zero violations for the shipped BB2025 catalog", () => {
    const violations = validateRaceCatalog(RACES);
    expect(violations).toEqual([]);
  });

  it("flags an unresolvable skill ref", () => {
    const race = fakeRace();
    race.positionals[0].skills = ["sure-hands", "not-a-real-skill"] as SkillId[];
    const violations = validateRaceCatalog([race]);
    const message = violations.join("\n");
    expect(message).toMatch(/unresolvable/);
    expect(message).toMatch(/not-a-real-skill/);
  });

  it("flags an out-of-range armour value", () => {
    const race = fakeRace();
    race.positionals[0].av = "5+";
    const violations = validateRaceCatalog([race]);
    expect(violations.join("\n")).toMatch(/av must be one of 6\+, 7\+, 8\+, 9\+, 10\+, 11\+/);
  });

  it("flags a duplicate positional key within a race", () => {
    const race = fakeRace();
    race.positionals.push({ ...race.positionals[0] });
    const violations = validateRaceCatalog([race]);
    expect(violations.join("\n")).toMatch(/duplicate positional key/);
  });

  it("flags an invalid access letter", () => {
    const race = fakeRace();
    race.positionals[0].accessPrimary = ["G", "X"];
    const violations = validateRaceCatalog([race]);
    expect(violations.join("\n")).toMatch(/accessPrimary contains invalid letter\(s\): X/);
  });

  it("flags a min greater than max", () => {
    const race = fakeRace();
    race.positionals[0].min = 17;
    const violations = validateRaceCatalog([race]);
    expect(violations.join("\n")).toMatch(/min must be an integer between 0 and max/);
  });

  it("flags a duplicate race id", () => {
    const race = fakeRace();
    const violations = validateRaceCatalog([race, fakeRace()]);
    expect(violations.join("\n")).toMatch(/duplicate race id: fake/);
  });

  it("flags a wrong race count", () => {
    const violations = validateRaceCatalog([fakeRace()]);
    expect(violations.join("\n")).toMatch(/must contain exactly 30 races, got 1/);
  });
});
