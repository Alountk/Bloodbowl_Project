import { describe, expect, it } from "vitest";
import {
  improvementCost,
  IMPROVEMENT_KINDS,
  attributeOptionsForRoll,
  PLAYER_ATTRIBUTES,
  isReadyToImprove,
  nextImprovementCost,
} from "./improvements";
import { computeWinnings } from "./winnings";
import { postMatchFanFactor, preMatchFanFactor } from "./fanFactor";

describe("improvement cost table (bb2025-rules R2)", () => {
  it("pins the full six-row cost table", () => {
    expect(IMPROVEMENT_KINDS).toEqual(["random", "primary", "secondary", "attribute"]);
    // Row 1ª
    expect(improvementCost(1, "random")).toBe(3);
    expect(improvementCost(1, "primary")).toBe(6);
    expect(improvementCost(1, "secondary")).toBe(10);
    expect(improvementCost(1, "attribute")).toBe(14);
    // Row 2ª
    expect(improvementCost(2, "random")).toBe(4);
    expect(improvementCost(2, "primary")).toBe(8);
    expect(improvementCost(2, "secondary")).toBe(12);
    expect(improvementCost(2, "attribute")).toBe(16);
    // Row 3ª
    expect(improvementCost(3, "random")).toBe(6);
    expect(improvementCost(3, "primary")).toBe(12);
    expect(improvementCost(3, "secondary")).toBe(16);
    expect(improvementCost(3, "attribute")).toBe(20);
    // Row 4ª
    expect(improvementCost(4, "random")).toBe(8);
    expect(improvementCost(4, "primary")).toBe(16);
    expect(improvementCost(4, "secondary")).toBe(20);
    expect(improvementCost(4, "attribute")).toBe(24);
    // Row 5ª
    expect(improvementCost(5, "random")).toBe(10);
    expect(improvementCost(5, "primary")).toBe(20);
    expect(improvementCost(5, "secondary")).toBe(24);
    expect(improvementCost(5, "attribute")).toBe(28);
    // Row 6ª
    expect(improvementCost(6, "random")).toBe(15);
    expect(improvementCost(6, "primary")).toBe(30);
    expect(improvementCost(6, "secondary")).toBe(34);
    expect(improvementCost(6, "attribute")).toBe(38);
  });

  it("reuses the 6ª cost for improvements beyond six", () => {
    expect(improvementCost(8, "primary")).toBe(30);
    expect(improvementCost(12, "attribute")).toBe(38);
  });
});

describe("nextImprovementCost (cheapest next 1ª..6ª random cost)", () => {
  it("returns the 1ª..6ª random-row costs for each improvement count", () => {
    // acquisitions → next cost (random row: 3/4/6/8/10/15)
    expect(nextImprovementCost(0)).toBe(3);
    expect(nextImprovementCost(1)).toBe(4);
    expect(nextImprovementCost(4)).toBe(10);
    expect(nextImprovementCost(5)).toBe(15);
  });

  it("caps the 6ª cost once the player is already at the sixth improvement", () => {
    expect(nextImprovementCost(6)).toBe(15);
    expect(nextImprovementCost(9)).toBe(15);
  });
});

describe("isReadyToImprove", () => {
  it("flags an alive player whose PE reaches the next improvement cost", () => {
    // 0 acquisitions → next cost 3; pe 3 meets it.
    expect(isReadyToImprove({ pe: 3, alive: true, improvements: 0 })).toBe(true);
    // 1 acquisition → next cost 4; pe 4 meets it.
    expect(isReadyToImprove({ pe: 4, alive: true, improvements: 1 })).toBe(true);
  });

  it("flags not-ready when PE is below the next improvement cost", () => {
    expect(isReadyToImprove({ pe: 2, alive: true, improvements: 0 })).toBe(false);
    // 5 acquisitions → next cost 15; pe 14 is short by one.
    expect(isReadyToImprove({ pe: 14, alive: true, improvements: 5 })).toBe(false);
  });

  it("never flags a dead player as ready, regardless of PE", () => {
    expect(isReadyToImprove({ pe: 20, alive: false, improvements: 0 })).toBe(false);
    expect(isReadyToImprove({ pe: 0, alive: false, improvements: 2 })).toBe(false);
  });
});

describe("attribute improvement table (1D8, rulebook OCR)", () => {
  it("exposes the five trainable attributes", () => {
    expect(PLAYER_ATTRIBUTES).toEqual(["ma", "st", "ag", "pa", "av"]);
  });

  it("gives the eligible attributes per 1D8 outcome exactly as the rulebook OCR", () => {
    // 1 → AR (Armour = av)
    expect(attributeOptionsForRoll(1)).toEqual(["av"]);
    // 2 → AR o PS (av or pa)
    expect(attributeOptionsForRoll(2)).toEqual(["av", "pa"]);
    // 3-4 → AR/MV o PS (av, ma or pa)
    expect(attributeOptionsForRoll(3)).toEqual(["av", "ma", "pa"]);
    expect(attributeOptionsForRoll(4)).toEqual(["av", "ma", "pa"]);
    // 5 → MV o PS (ma or pa)
    expect(attributeOptionsForRoll(5)).toEqual(["ma", "pa"]);
    // 6 → AG o MV (ag or ma)
    expect(attributeOptionsForRoll(6)).toEqual(["ag", "ma"]);
    // 7 → AG o FU (ag or st)
    expect(attributeOptionsForRoll(7)).toEqual(["ag", "st"]);
    // 8 → cualquier atributo
    expect(attributeOptionsForRoll(8)).toEqual(["ma", "st", "ag", "pa", "av"]);
  });

  it("returns the any-attribute row for 1D8 values outside 1-8", () => {
    expect(attributeOptionsForRoll(0)).toEqual(["ma", "st", "ag", "pa", "av"]);
    expect(attributeOptionsForRoll(9)).toEqual(["ma", "st", "ag", "pa", "av"]);
  });
});

describe("winnings (bb2025-rules R4)", () => {
  it("computes the validated scenario: FF 5 vs 3, 2 TDs, ball held", () => {
    // (5+3)/2 + 2 + 0 = 6 → 60.000
    expect(computeWinnings({ ffHome: 5, ffAway: 3, ownTds: 2, heldBall: true })).toBe(60_000);
  });

  it("preserves the fractional half when FF halves to .5", () => {
    // (4+3)/2 = 3.5 → 6.5 total → 65.000  (spec: 3.5 + 3 TDs = 6.5)
    expect(computeWinnings({ ffHome: 4, ffAway: 3, ownTds: 3, heldBall: true })).toBe(65_000);
  });

  it("adds 1 unit when the team never held the ball", () => {
    // (5+3)/2 + 1 + 1 = 6 → 60.000
    expect(computeWinnings({ ffHome: 5, ffAway: 3, ownTds: 1, heldBall: false })).toBe(60_000);
  });
});

describe("fan factor (bb2025-rules R4)", () => {
  it("raises FF on a win when 1D6 >= FF, capped at 7", () => {
    expect(postMatchFanFactor({ ff: 3, result: "win", roll6: 4 })).toBe(4);
    expect(postMatchFanFactor({ ff: 7, result: "win", roll6: 6 })).toBe(7);
  });

  it("does not raise FF on a win when 1D6 < FF", () => {
    expect(postMatchFanFactor({ ff: 5, result: "win", roll6: 3 })).toBe(5);
  });

  it("lowers FF on a loss when 1D6 < FF, floored at 1", () => {
    expect(postMatchFanFactor({ ff: 4, result: "loss", roll6: 3 })).toBe(3);
    expect(postMatchFanFactor({ ff: 1, result: "loss", roll6: 1 })).toBe(1);
  });

  it("does not lower FF on a loss when 1D6 >= FF", () => {
    expect(postMatchFanFactor({ ff: 2, result: "loss", roll6: 4 })).toBe(2);
  });

  it("leaves FF unchanged on a draw", () => {
    expect(postMatchFanFactor({ ff: 6, result: "draw", roll6: 1 })).toBe(6);
  });

  it("computes pre-match FF as 1D3 + dedicated fans", () => {
    expect(preMatchFanFactor({ roll3: 2, dedicatedFans: 1 })).toBe(3);
    expect(preMatchFanFactor({ roll3: 3, dedicatedFans: 2 })).toBe(5);
  });
});
