import { describe, expect, it } from "vitest";
import { RACES } from "./races";
import {
  BRAWLIN_BRUTES_RACES,
  SKILL_CATEGORIES,
  SKILLS,
  SPECIAL_ACTION_TRAITS,
  brawlinBrutesRace,
  canHaveViolentInnovator,
  getSkillById,
  getSkillByName,
  sppSkillFlags,
} from "./skills";

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

/**
 * T27 (L87/L88 — user verbatim): the SPP-exception skills and the per-player
 * flags the earn rule consumes. The flags record is keyed by the USER'S EXACT
 * three names — «Innovador Violento», «Vuelo Letal», «Llave de Brazo» — and by
 * nothing else (the rule map never invents skill names). Roster records store
 * skill refs as catalog ids OR rulebook random-table names (the `skillKey`
 * convention in lib/progression) — every representation must resolve to the
 * same flag.
 */
describe("T27 · SPP skill flags (L87 — «use these EXACT three names»)", () => {
  const NONE = {
    "Innovador Violento": false,
    "Vuelo Letal": false,
    "Llave de Brazo": false,
  } as const;

  it("resolves the three exact user names to the catalog skills", () => {
    expect(getSkillByName("Innovador Violento")?.id).toBe("violent-innovator");
    expect(getSkillByName("Vuelo Letal")?.id).toBe("lethal-flight");
    expect(getSkillByName("Llave de Brazo")?.id).toBe("arm-bar");
  });

  it("derives the per-player flags from roster skill refs — catalog ids, random-table names and user spellings all resolve", () => {
    // Innovador Violento (Triquiñuela) — id / rulebook table name / user name.
    expect(sppSkillFlags(["violent-innovator"])).toEqual({
      ...NONE,
      "Innovador Violento": true,
    });
    expect(sppSkillFlags(["Innovador violento"])).toEqual({
      ...NONE,
      "Innovador Violento": true,
    });
    expect(sppSkillFlags(["Innovador Violento"])).toEqual({
      ...NONE,
      "Innovador Violento": true,
    });
    // Llave de Brazo (Fuerza) — id / user name (the catalog es lookup is
    // case-insensitive, so «Llave de brazo» resolves too).
    expect(sppSkillFlags(["arm-bar"])).toEqual({ ...NONE, "Llave de Brazo": true });
    expect(sppSkillFlags(["Llave de Brazo"])).toEqual({ ...NONE, "Llave de Brazo": true });
  });

  it("«Right-Stuff only» (user verbatim): the Vuelo Letal flag needs Right Stuff («Humanoide bala») too", () => {
    expect(sppSkillFlags(["Vuelo Letal", "Right Stuff"])).toEqual({
      ...NONE,
      "Vuelo Letal": true,
    });
    expect(sppSkillFlags(["lethal-flight", "right-stuff"])).toEqual({
      ...NONE,
      "Vuelo Letal": true,
    });
    expect(sppSkillFlags(["Vuelo Letal", "Humanoide bala"])).toEqual({
      ...NONE,
      "Vuelo Letal": true,
    });
    // Right-Stuff only — the skill alone never lights the flag.
    expect(sppSkillFlags(["Vuelo Letal"])).toEqual(NONE);
    expect(sppSkillFlags(["Right Stuff"])).toEqual(NONE);
  });

  it("flags ONLY the three exception skills — every other ref yields all-false (never fuzzy-match)", () => {
    expect(sppSkillFlags([])).toEqual(NONE);
    expect(sppSkillFlags(["block", "Block", "Mighty Blow (+1)", "Chainsaw", "Right Stuff"])).toEqual(
      NONE,
    );
    expect(sppSkillFlags(["Innovador Violent", "Vuelo", "Llave"])).toEqual(NONE);
  });

  it("canHaveViolentInnovator: «Only players with a trait allowing Special Actions can have it» — the five user-named traits («etc.» stays unmodeled, never invented)", () => {
    // The user's verbatim set: Motosierra, Apuñalar, Vomitar proyectiles,
    // Aliento de fuego, Bomba — resolved to their catalog ids.
    for (const trait of ["chainsaw", "stab", "projectile-vomit", "fire-breathing", "bombardier"]) {
      expect(SPECIAL_ACTION_TRAITS).toContain(trait);
      expect(canHaveViolentInnovator([trait])).toBe(true);
    }
    expect(canHaveViolentInnovator(["chainsaw", "Innovador Violento"])).toBe(true);
    // Without a special-action trait the player may NOT have the skill.
    expect(canHaveViolentInnovator(["Innovador Violento"])).toBe(false);
    expect(canHaveViolentInnovator(["block", "Right Stuff"])).toBe(false);
    expect(canHaveViolentInnovator([])).toBe(false);
  });
});

/**
 * T26a (L88 — user verbatim): «Brutos Peleones (Brawlin Brutes)» is a TEAM
 * special rule — NOT a player skill — on exactly the six races the user named
 * (Khorne / Orcos / Enanos / Ogros / Nurgle / Orcos Negros). Effect: a caused
 * Casualty pays 3 SPP (instead of 2), a Touchdown pays 2 (instead of 3). The
 * map pins those races as CATALOG race ids; the earn rule keys the modifier on
 * the earner's team race (causal causer / TD scorer).
 */
describe("T26a · «Brutos Peleones» race map (L88 — team special rule, six races)", () => {
  it("pins the user's L88 race list as catalog race ids", () => {
    expect(BRAWLIN_BRUTES_RACES).toEqual([
      "khorne",
      "orc",
      "dwarf",
      "ogre",
      "nurgle",
      "black-orc",
    ]);
  });

  it.each(["khorne", "orc", "dwarf", "ogre", "nurgle", "black-orc"])(
    "%s carries the Brutos Peleones rule",
    (raceId) => {
      expect(brawlinBrutesRace(raceId)).toBe(true);
    },
  );

  it.each(["human", "tomb-kings", "khorne-blocker", "", "unknown-race"])(
    "%s does NOT carry the rule",
    (raceId) => {
      expect(brawlinBrutesRace(raceId)).toBe(false);
    },
  );
});
