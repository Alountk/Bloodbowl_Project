import { describe, expect, it } from "vitest";

import {
  RULESET_HIRE_FIRE,
  RULESET_RACE_IDS,
  rulesetToDto,
  validateRulesetBody,
  validateRulesetPatch,
} from "./rulesets";

const validBody = {
  name: "Liga Tier 1",
  description: "Solo razas de élite.",
  races: ["human", "orc", "dwarf"],
  startingTreasury: 1100000,
  tvCap: 1150000,
  minPlayers: 11,
  maxPlayers: 16,
  hireFire: "between-jornadas",
  seasonReform: true,
  mercenaries: false,
  active: true,
};

describe("RULESET_RACE_IDS", () => {
  it("covers the full 31-race catalog with unique ids", () => {
    expect(RULESET_RACE_IDS).toHaveLength(31);
    expect(new Set(RULESET_RACE_IDS).size).toBe(31);
  });
});

describe("validateRulesetBody", () => {
  it("accepts a full valid payload and normalizes it", () => {
    const result = validateRulesetBody(validBody);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      name: "Liga Tier 1",
      description: "Solo razas de élite.",
      races: ["human", "orc", "dwarf"],
      startingTreasury: 1100000,
      tvCap: 1150000,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "between-jornadas",
      seasonReform: true,
      mercenaries: false,
      active: true,
    });
  });

  it("trims the name and description and maps an empty description to null", () => {
    const result = validateRulesetBody({ ...validBody, name: "  Estándar  ", description: "   " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Estándar");
    expect(result.value.description).toBeNull();
  });

  it("rejects a missing/blank name", () => {
    expect(validateRulesetBody({ ...validBody, name: "" }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, name: undefined }).ok).toBe(false);
  });

  it("rejects unknown fields", () => {
    const result = validateRulesetBody({ ...validBody, malicious: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("malicious");
  });

  it("rejects races that are empty, non-array, duplicated or outside the catalog", () => {
    expect(validateRulesetBody({ ...validBody, races: [] }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, races: "human" }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, races: ["human", "human"] }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, races: ["human", "not-a-race"] }).ok).toBe(false);
  });

  it("accepts the full catalog as the races list", () => {
    const result = validateRulesetBody({ ...validBody, races: [...RULESET_RACE_IDS] });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid treasury and tvCap amounts", () => {
    expect(validateRulesetBody({ ...validBody, startingTreasury: 0 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, startingTreasury: -100 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, startingTreasury: 1.5 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, tvCap: 0 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, tvCap: "1150000" }).ok).toBe(false);
    // null/undefined tvCap means "no cap" and is valid.
    expect(validateRulesetBody({ ...validBody, tvCap: null }).ok).toBe(true);
  });

  it("rejects players outside 1..16 or with min > max", () => {
    expect(validateRulesetBody({ ...validBody, minPlayers: 0 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, maxPlayers: 17 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, minPlayers: 12, maxPlayers: 11 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, minPlayers: 11, maxPlayers: 16 }).ok).toBe(true);
  });

  it("rejects invalid hireFire values and non-boolean toggles", () => {
    expect(validateRulesetBody({ ...validBody, hireFire: "anytime" }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, seasonReform: "yes" }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, mercenaries: 1 }).ok).toBe(false);
    expect(validateRulesetBody({ ...validBody, active: null }).ok).toBe(false);
  });

  it("accepts both hireFire windows", () => {
    for (const hireFire of RULESET_HIRE_FIRE) {
      expect(validateRulesetBody({ ...validBody, hireFire }).ok).toBe(true);
    }
  });
});

describe("validateRulesetPatch", () => {
  it("rejects an empty body and unknown fields", () => {
    expect(validateRulesetPatch({}).ok).toBe(false);
    expect(validateRulesetPatch({ name: "x", hacked: 1 }).ok).toBe(false);
  });

  it("accepts a partial subset and returns only the provided keys", () => {
    const result = validateRulesetPatch({ name: "Copa de Invierno", active: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ name: "Copa de Invierno", active: false });
  });

  it("allows tvCap null (clear the cap)", () => {
    const result = validateRulesetPatch({ tvCap: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ tvCap: null });
  });

  it("validates each provided field with the same rules as POST", () => {
    expect(validateRulesetPatch({ races: ["bad-id"] }).ok).toBe(false);
    expect(validateRulesetPatch({ startingTreasury: -5 }).ok).toBe(false);
    expect(validateRulesetPatch({ maxPlayers: 20 }).ok).toBe(false);
    expect(validateRulesetPatch({ hireFire: "nope" }).ok).toBe(false);
  });
});

describe("rulesetToDto", () => {
  it("normalizes the Json races column and ISO dates", () => {
    const dto = rulesetToDto({
      id: "r1",
      name: "Estándar BB2025",
      description: null,
      races: ["human", "orc"],
      startingTreasury: 1000000,
      tvCap: null,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "between-jornadas",
      seasonReform: true,
      mercenaries: false,
      active: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    });
    expect(dto.races).toEqual(["human", "orc"]);
    expect(dto.tvCap).toBeNull();
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("defends against a non-array races column", () => {
    const dto = rulesetToDto({
      id: "r2",
      name: "Broken",
      description: null,
      races: "not-an-array",
      startingTreasury: 1000000,
      tvCap: null,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "libre",
      seasonReform: true,
      mercenaries: false,
      active: true,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    });
    expect(dto.races).toEqual([]);
  });
});
