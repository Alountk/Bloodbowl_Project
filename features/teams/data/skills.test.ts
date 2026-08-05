import { describe, expect, it } from "vitest";
import { RACES } from "./races";
import { SKILLS, getSkillByName } from "./skills";

describe("skills catalog", () => {
  it("uses unique ids", () => {
    const ids = SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses unique English names", () => {
    const names = SKILLS.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every skill string used by races.ts", () => {
    const raceSkills = new Set(
      RACES.flatMap((race) => race.positionals.flatMap((positional) => positional.skills)),
    );

    const unresolved = [...raceSkills].filter((skillName) => !getSkillByName(skillName));

    expect(unresolved).toEqual([]);
  });
});
