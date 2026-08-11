import { describe, expect, it } from "vitest";
import { improvementCost, IMPROVEMENT_KINDS } from "./improvements";
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
