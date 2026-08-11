import { describe, expect, it } from "vitest";
import {
  NORMAL_SKILL_VALUE_BONUS,
  ELITE_SKILL_VALUE_BONUS,
  computeValueBonus,
} from "./value";

describe("value bonus (player-progression R4 / REQ-RACE-08)", () => {
  it("pins the normal skill bonus to +10.000 and élite to +20.000", () => {
    expect(NORMAL_SKILL_VALUE_BONUS).toBe(10_000);
    expect(ELITE_SKILL_VALUE_BONUS).toBe(20_000);
  });

  it("adds +10.000 for each normal skill", () => {
    expect(
      computeValueBonus([{ elite: false }, { elite: false }]),
    ).toBe(20_000);
  });

  it("adds +20.000 for each élite skill", () => {
    expect(
      computeValueBonus([{ elite: true }, { elite: true }]),
    ).toBe(40_000);
  });

  it("mixes normal and élite skills", () => {
    // 3 normal + 2 élite = 3*10k + 2*20k = 70k
    expect(
      computeValueBonus([
        { elite: false },
        { elite: false },
        { elite: false },
        { elite: true },
        { elite: true },
      ]),
    ).toBe(70_000);
  });

  it("returns zero for a player with no skills", () => {
    expect(computeValueBonus([])).toBe(0);
  });
});
