import { describe, expect, it } from "vitest";
import {
  d6ToD3,
  roundDownTo5k,
  bracketFor,
  resolveExpensiveMistake,
  buildKickoffEvents,
  type KickoffBracket,
  type KickoffOutcome,
} from "./kickoff";

/**
 * Pure kickoff-events (LM-21/LM-22/LM-23): D6→D3 mapping, the treasury-bracket
 * clamp, the team treasury-deduction resolution against the full 6×6 rulebook
 * matrix, and the `buildKickoffEvents` assembly returning the em(home),
 * em(away), fan_factor events plus the treasury deltas. Zero mocks.
 */

describe("d6ToD3 — D6 to D3 mapping (LM-22 D6→D3 bounds)", () => {
  it("maps 1-2→1, 3-4→2, 5-6→3", () => {
    expect(d6ToD3(1)).toBe(1);
    expect(d6ToD3(2)).toBe(1);
    expect(d6ToD3(3)).toBe(2);
    expect(d6ToD3(4)).toBe(2);
    expect(d6ToD3(5)).toBe(3);
    expect(d6ToD3(6)).toBe(3);
    expect(d6ToD3(7)).toBe(3); // out-of-range still clamps high
    expect(d6ToD3(0)).toBe(1); // out-of-range clamps low
  });
});

describe("roundDownTo5k — round DOWN to the nearest 5k", () => {
  it("rounds a half down to the nearest 5k (117k → 115k)", () => {
    expect(roundDownTo5k(117000)).toBe(115000);
  });
  it("rounds 122500 down to 120000 and 125000 down to 125000", () => {
    expect(roundDownTo5k(122500)).toBe(120000);
    expect(roundDownTo5k(125000)).toBe(125000);
  });
});

describe("bracketFor — treasury bracket clamp (LM-23)", () => {
  it("clamps a sub-100k treasury to the first bracket", () => {
    expect(bracketFor(80000)).toBe("100k-195k");
    expect(bracketFor(0)).toBe("100k-195k");
  });
  it("returns the exact bracket for a treasury in each band", () => {
    expect(bracketFor(150000)).toBe("100k-195k");
    expect(bracketFor(250000)).toBe("200k-295k");
    expect(bracketFor(350000)).toBe("300k-395k");
    expect(bracketFor(450000)).toBe("400k-495k");
    expect(bracketFor(550000)).toBe("500k-595k");
    expect(bracketFor(650000)).toBe("600k+");
  });
});

describe("resolveExpensiveMistake — full rulebook matrix (LM-23)", () => {
  // Treasury at the LOW bound of each bracket, so the matrix column is exact.
  const brackets: KickoffBracket[] = [
    "100k-195k",
    "200k-295k",
    "300k-395k",
    "400k-495k",
    "500k-595k",
    "600k+",
  ];
  const bracketTreasury: Record<KickoffBracket, number> = {
    "100k-195k": 100000,
    "200k-295k": 200000,
    "300k-395k": 300000,
    "400k-495k": 400000,
    "500k-595k": 500000,
    "600k+": 600000,
  };
  // The FULL rulebook matrix (rows roll 1..6 × columns bracket), from LM-23.
  const matrix: Record<number, KickoffOutcome[]> = {
    1: ["minor-incident", "minor-incident", "serious-incident", "serious-incident", "catastrophe", "catastrophe"],
    2: ["crisis-evaded", "minor-incident", "minor-incident", "serious-incident", "serious-incident", "catastrophe"],
    3: ["crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident", "serious-incident", "serious-incident"],
    4: ["crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident", "serious-incident"],
    5: ["crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident"],
    6: ["crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident"],
  };

  it("resolves the exact outcome for every (roll, bracket) pair in the matrix", () => {
    for (const roll of [1, 2, 3, 4, 5, 6]) {
      brackets.forEach((bracket) => {
        const result = resolveExpensiveMistake({ roll, treasury: bracketTreasury[bracket] });
        expect(result.bracket).toBe(bracket);
        expect(result.outcome).toBe(matrix[roll][brackets.indexOf(bracket)]);
      });
    }
  });

  it("minor incident deducts 1D3×10k via the supplied rollD3 (treasury 234k, d3 2 → 20k)", () => {
    const result = resolveExpensiveMistake({ roll: 1, rollD3: 2, treasury: 234000 });
    expect(result.outcome).toBe("minor-incident");
    expect(result.amountLost).toBe(20000);
    expect(result.treasuryAfter).toBe(214000);
  });

  it("serious incident deducts half the treasury rounded DOWN to 5k (334k → 165k/169k)", () => {
    // 334k sits in the 300k-395k bracket; roll 1 → serious. half = 167000 →
    // roundDownTo5k = 165000.
    const result = resolveExpensiveMistake({ roll: 1, treasury: 334000 });
    expect(result.outcome).toBe("serious-incident");
    expect(result.amountLost).toBe(165000);
    expect(result.treasuryAfter).toBe(169000);
  });

  it("catastrophe reduces treasury to the kept 2D6×10k (500k, keep 4+6 → 100k after)", () => {
    // 500k sits in the 500k-595k bracket; roll 1 → catastrophe. keep 4+6 = 10 →
    // kept 100k, so the treasury is reduced to 100k (amountLost 400k).
    const result = resolveExpensiveMistake({ roll: 1, keep: [4, 6], treasury: 500000 });
    expect(result.outcome).toBe("catastrophe");
    expect(result.amountLost).toBe(400000);
    expect(result.treasuryAfter).toBe(100000);
  });

  it("crisis-evaded loses 0 and keeps the treasury unchanged (80k clamped to first bracket)", () => {
    const result = resolveExpensiveMistake({ roll: 6, treasury: 80000 });
    expect(result.outcome).toBe("crisis-evaded");
    expect(result.bracket).toBe("100k-195k");
    expect(result.amountLost).toBe(0);
    expect(result.treasuryAfter).toBe(80000);
  });
});

describe("buildKickoffEvents — em(home), em(away), fan_factor events + treasury deltas (LM-21/22/23)", () => {
  it("builds the two expensive-mistake events, the centered fan_factor, and the per-team deltas", () => {
    const input = {
      now: 1000,
      half: 1,
      turnNumber: 1,
      home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
      away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
      dice: {
        home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
        away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
      },
    };
    const { events, treasuryUpdates } = buildKickoffEvents(input);

    // seq order: em(home), em(away), fan_factor. All share the same `at`.
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual(["expensive_mistake", "expensive_mistake", "fan_factor"]);
    expect(events.every((e) => e.at === 1000)).toBe(true);
    expect(events.every((e) => e.half === 1 && e.turnNumber === 1)).toBe(true);

    // em(home): minor incident 20k.
    const emHome = events[0];
    expect(emHome.side).toBe("home");
    expect(emHome.payload).toMatchObject({
      side: "home",
      roll: 1,
      bracket: "200k-295k",
      outcome: "minor-incident",
      amountLost: 20000,
      treasuryBefore: 234000,
      treasuryAfter: 214000,
    });

    // em(away): catastrophe — treasury reduced to kept 2D6×10k (100k).
    const emAway = events[1];
    expect(emAway.side).toBe("away");
    expect(emAway.payload).toMatchObject({
      side: "away",
      roll: 1,
      bracket: "500k-595k",
      outcome: "catastrophe",
      amountLost: 400000,
      treasuryBefore: 500000,
      treasuryAfter: 100000,
    });

    // fan_factor centered: home base 2 + d3 2 = 4; away base 1 + d3 3 = 4.
    const fan = events[2];
    expect(fan.side).toBeNull();
    expect(fan.payload).toMatchObject({
      home: { base: 2, dice: 2, total: 4 },
      away: { base: 1, dice: 3, total: 4 },
    });

    // treasury deltas mirror the two em amounts.
    expect(treasuryUpdates).toEqual([
      { teamId: "home-t", amountLost: 20000 },
      { teamId: "away-t", amountLost: 400000 },
    ]);
  });

  it("emits no treasury updates when both teams resolve crisis-evaded (roll 6 at 500k)", () => {
    const input = {
      now: 2000,
      half: 1,
      turnNumber: 1,
      home: { teamId: "home-t", treasury: 500000, dedicatedFans: 2 },
      away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
      dice: {
        home: { em: 6, d3: 1, keep: [0, 0] as [number, number], fan: 3 },
        away: { em: 6, d3: 1, keep: [0, 0] as [number, number], fan: 6 },
      },
    };
    const { events, treasuryUpdates } = buildKickoffEvents(input);
    // roll 6 at the 500k bracket → row6 col4 = crisis-evaded (e).
    const emKinds = events.filter((e) => e.kind === "expensive_mistake");
    expect(emKinds).toHaveLength(2);
    for (const em of emKinds) {
      expect(em.payload.outcome).toBe("crisis-evaded");
      expect(em.payload.amountLost).toBe(0);
    }
    expect(treasuryUpdates).toEqual([]);
    // fan factor maps D6 rolls 3 and 6 → dice 2 and 3 (LM-22).
    const fan = events.find((e) => e.kind === "fan_factor")!;
    expect(fan.payload).toMatchObject({
      home: { base: 2, dice: 2, total: 4 },
      away: { base: 1, dice: 3, total: 4 },
    });
  });
});
