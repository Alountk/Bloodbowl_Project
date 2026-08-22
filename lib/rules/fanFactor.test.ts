import { describe, expect, it } from "vitest";
import {
  postMatchFanFactor,
  preMatchFanFactor,
  rollPostMatchFanFactor,
} from "./fanFactor";

/**
 * BB2025 post-match fan factor — "ACTUALIZAR HINCHAS" (rulebook p. 103,
 * "Secuencia posterior al partido"). The 1D6 roll is compared against the
 * team's dedicated-fans ATTRIBUTE (not the pre-match attendance factor), and
 * the change applies to that attribute:
 *   - WIN:   roll6 >= attribute → +1 (max 7)
 *   - LOSS:  roll6 <  attribute → −1 (min 1)
 *   - DRAW:  unchanged
 * The `rollPostMatchFanFactor` helper surfaces the UP/STAY/DOWN verdict + the
 * roll so the resolution summary can show "Factor fan: ↑ / = / ↓".
 */

describe("post-match fan factor (bb2025-rules R4, rulebook p. 103)", () => {
  it("WIN: the attribute goes UP when 1D6 >= the dedicated-fans attribute, capped at 7", () => {
    expect(postMatchFanFactor({ ff: 3, result: "win", roll6: 3 })).toBe(4);
    expect(postMatchFanFactor({ ff: 3, result: "win", roll6: 4 })).toBe(4);
    expect(postMatchFanFactor({ ff: 7, result: "win", roll6: 6 })).toBe(7);
  });

  it("WIN: the attribute STAYS when 1D6 < the dedicated-fans attribute", () => {
    expect(postMatchFanFactor({ ff: 5, result: "win", roll6: 3 })).toBe(5);
    expect(postMatchFanFactor({ ff: 2, result: "win", roll6: 1 })).toBe(2);
  });

  it("LOSS: the attribute goes DOWN when 1D6 < the dedicated-fans attribute, floored at 1", () => {
    expect(postMatchFanFactor({ ff: 4, result: "loss", roll6: 3 })).toBe(3);
    expect(postMatchFanFactor({ ff: 1, result: "loss", roll6: 1 })).toBe(1);
  });

  it("LOSS: the attribute STAYS when 1D6 >= the dedicated-fans attribute", () => {
    expect(postMatchFanFactor({ ff: 2, result: "loss", roll6: 4 })).toBe(2);
    expect(postMatchFanFactor({ ff: 3, result: "loss", roll6: 3 })).toBe(3);
  });

  it("DRAW: the attribute always STAYS", () => {
    expect(postMatchFanFactor({ ff: 6, result: "draw", roll6: 1 })).toBe(6);
    expect(postMatchFanFactor({ ff: 1, result: "draw", roll6: 6 })).toBe(1);
  });

  it("computes pre-match attendance FF as 1D3 + dedicated fans (winnings/kickoff only)", () => {
    expect(preMatchFanFactor({ roll3: 2, dedicatedFans: 1 })).toBe(3);
    expect(preMatchFanFactor({ roll3: 3, dedicatedFans: 2 })).toBe(5);
  });
});

describe("rollPostMatchFanFactor — the UP/STAY/DOWN verdict surfaced in the resolution", () => {
  it("returns UP with the before/after attribute and the 1D6 roll for a winning rise", () => {
    expect(rollPostMatchFanFactor({ ff: 2, result: "win", roll6: 4 })).toEqual({
      before: 2,
      roll6: 4,
      after: 3,
      direction: "up",
    });
  });

  it("returns DOWN for a losing drop", () => {
    expect(rollPostMatchFanFactor({ ff: 4, result: "loss", roll6: 2 })).toEqual({
      before: 4,
      roll6: 2,
      after: 3,
      direction: "down",
    });
  });

  it("returns STAY when the roll does not move the attribute (win below / loss at-or-above / any draw)", () => {
    expect(rollPostMatchFanFactor({ ff: 5, result: "win", roll6: 3 }).direction).toBe("stay");
    expect(rollPostMatchFanFactor({ ff: 2, result: "loss", roll6: 4 }).direction).toBe("stay");
    expect(rollPostMatchFanFactor({ ff: 3, result: "draw", roll6: 1 }).direction).toBe("stay");
  });

  it("never exceeds the 7 / 1 bounds while keeping the verdict", () => {
    expect(rollPostMatchFanFactor({ ff: 7, result: "win", roll6: 6 })).toMatchObject({
      after: 7,
      direction: "stay",
    });
    expect(rollPostMatchFanFactor({ ff: 1, result: "loss", roll6: 1 })).toMatchObject({
      after: 1,
      direction: "stay",
    });
  });
});
