import { describe, expect, it } from "vitest";
import { RACES } from "./races";
import { SKILL_CATEGORIES, SKILLS, getSkillById, getSkillByName } from "./skills";

function resolveSkillRef(ref: string) {
  return getSkillById(ref) ?? getSkillByName(ref);
}

describe("skills catalog", () => {
  it("uses unique ids", () => {
    const ids = SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses a valid category from the SkillCategory enum", () => {
    const categories = new Set(SKILL_CATEGORIES);
    const invalid = SKILLS.map((skill) => skill.category).filter(
      (category) => !categories.has(category),
    );
    expect(invalid).toEqual([]);
  });

  it("uses unique English names", () => {
    const names = SKILLS.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves every skill ref used by races.ts", () => {
    const raceSkills = new Set(
      RACES.flatMap((race) => race.positionals.flatMap((positional) => positional.skills)),
    );

    const unresolved = [...raceSkills].filter((skillRef) => !resolveSkillRef(skillRef));

    expect(unresolved).toEqual([]);
  });

  it("uses catalog ids for skills in races.ts", () => {
    const raceSkills = new Set(
      RACES.flatMap((race) => race.positionals.flatMap((positional) => positional.skills)),
    );
    const knownIds = new Set(SKILLS.map((skill) => skill.id));

    const nonIds = [...raceSkills].filter((skillRef) => !knownIds.has(skillRef));

    expect(nonIds).toEqual([]);
  });

  // REQ-RACE-08: user-confirmed élite skills.
  it.each(["block", "dodge", "guard", "mighty-blow-plus-1"])(
    "marks %s as an élite skill",
    (id) => {
      expect(getSkillById(id)?.elite).toBe(true);
    },
  );

  // REQ-RACE-08: asterisked skills are mandatory, not élite.
  it.each(["foul-appearance", "frenzy", "bone-head", "insignificant", "my-ball"])(
    "marks %s as mandatory (not élite)",
    (id) => {
      expect(getSkillById(id)).toMatchObject({ mandatory: true, elite: false });
    },
  );

  it("defaults unlisted skills to non-élite and non-mandatory", () => {
    expect(getSkillById("fend")).toMatchObject({ elite: false, mandatory: false });
    expect(getSkillById("kick")).toMatchObject({ elite: false, mandatory: false });
  });

  it("defensive is not élite (the élite Defensa skill is Guard)", () => {
    expect(getSkillById("defensive")).toMatchObject({ elite: false });
  });
});
