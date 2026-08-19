import { describe, expect, it } from "vitest";
import { RULESET_RACE_IDS } from "@/lib/rulesets";
import {
  presetSinStunties,
  presetTier1,
  presetTodas,
  STUNTY_RACE_IDS,
  TIER1_RACE_IDS,
} from "./presets";

describe("ruleset race presets", () => {
  it("presetTodas covers the full 31-race catalog", () => {
    expect(presetTodas()).toHaveLength(RULESET_RACE_IDS.length);
    expect(new Set(presetTodas()).size).toBe(RULESET_RACE_IDS.length);
  });

  it("presetSinStunties is the catalog minus the five stunty races", () => {
    const sinStunties = presetSinStunties();
    expect(sinStunties).toHaveLength(RULESET_RACE_IDS.length - STUNTY_RACE_IDS.length);
    for (const id of STUNTY_RACE_IDS) expect(sinStunties).not.toContain(id);
    // Every remaining race is a valid catalog id.
    for (const id of sinStunties) expect(RULESET_RACE_IDS).toContain(id);
  });

  it("presetTier1 is an 8-race elite subset of the catalog", () => {
    expect(presetTier1()).toHaveLength(8);
    for (const id of presetTier1()) expect(RULESET_RACE_IDS).toContain(id);
    expect(new Set(TIER1_RACE_IDS).size).toBe(TIER1_RACE_IDS.length);
  });
});
