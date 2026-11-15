/**
 * Dice engine tests (T12 — faithful, seeded, injectable).
 *
 * Determinism comes from seeded `createRng` streams injected through the
 * optional trailing `Rng` parameter documented in lib/random.ts. This file
 * NEVER monkeypatches `Math.random`: the old spy-based assertions are migrated
 * to stub/seeded injection with equivalent coverage (1..N ranges, determinism).
 *
 * Golden counts are pinned from the canonical mulberry32/xmur3 reference for
 * the named seeds, so any change to the seeded sequence is caught immediately.
 */
import { describe, expect, it } from "vitest";
import {
  createRng,
  flipCoin,
  roll2D6,
  rollD3,
  rollD6,
  rollD8,
  rollD16,
  type Rng,
} from "./random";

/** Stub streams that pin the exact floor-mapping boundaries. */
const low: Rng = () => 0;
const high: Rng = () => 0.999999;

describe("createRng (seeded engine — tests only)", () => {
  it("replays the same sequence for the same numeric seed", () => {
    const a = createRng(2025);
    const b = createRng(2025);
    const seqA = Array.from({ length: 1000 }, () => a());
    const seqB = Array.from({ length: 1000 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("replays the same sequence for the same string seed", () => {
    const a = createRng("bb2025");
    const b = createRng("bb2025");
    const seqA = Array.from({ length: 1000 }, () => a());
    const seqB = Array.from({ length: 1000 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("diverges for different seeds", () => {
    const seq = (seed: number): number[] => {
      const rng = createRng(seed);
      return Array.from({ length: 8 }, () => rng());
    };
    expect(seq(1)).not.toEqual(seq(2));
  });

  it("yields floats in [0, 1)", () => {
    const rng = createRng("unit-range");
    let min = 1;
    let max = 0;
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });
});

describe("floor mapping (stub Rng — migrated from Math.random spies)", () => {
  it("maps the unit interval exactly like physical dice", () => {
    expect(rollD3(low)).toBe(1);
    expect(rollD6(low)).toBe(1);
    expect(rollD8(low)).toBe(1);
    expect(rollD16(low)).toBe(1);
    expect(roll2D6(low)).toBe(2);
    expect(flipCoin(low)).toBe(true);

    expect(rollD3(high)).toBe(3);
    expect(rollD6(high)).toBe(6);
    expect(rollD8(high)).toBe(8);
    expect(rollD16(high)).toBe(16);
    expect(roll2D6(high)).toBe(12);
    expect(flipCoin(high)).toBe(false);
  });
});

describe("tabletop distributions (seeded)", () => {
  const N = 20000;

  const draw = (roll: (rng: Rng) => number, seed: number): number[] => {
    const rng = createRng(seed);
    return Array.from({ length: N }, () => roll(rng));
  };

  it("every die keeps its 1..N face range and all faces appear (long seeded run)", () => {
    const d3 = draw(rollD3, 2025);
    const d6 = draw(rollD6, 2025);
    const d8 = draw(rollD8, 2025);
    const d16 = draw(rollD16, 2025);

    expect(d3.every((v) => Number.isInteger(v) && v >= 1 && v <= 3)).toBe(true);
    expect(d6.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)).toBe(true);
    expect(d8.every((v) => Number.isInteger(v) && v >= 1 && v <= 8)).toBe(true);
    expect(d16.every((v) => Number.isInteger(v) && v >= 1 && v <= 16)).toBe(true);

    expect(new Set(d3).size).toBe(3);
    expect(new Set(d6).size).toBe(6);
    expect(new Set(d8).size).toBe(8);
    expect(new Set(d16).size).toBe(16);

    const sums = draw(roll2D6, 2025);
    expect(sums.every((v) => Number.isInteger(v) && v >= 2 && v <= 12)).toBe(true);
    expect(new Set(sums).size).toBe(11);
  });

  it("the same seed rolls identical sequences through the helpers", () => {
    const walk = (seed: string): (number | boolean)[] => {
      const rng = createRng(seed);
      return Array.from({ length: 300 }, () => [
        rollD3(rng),
        rollD6(rng),
        rollD16(rng),
        roll2D6(rng),
        flipCoin(rng),
      ]).flat();
    };
    expect(walk("dice-engine")).toEqual(walk("dice-engine"));
  });

  it("roll2D6 is the sum of two independent d6 — triangular 2..12 (seed-pinned)", () => {
    const GOLDEN = {
      seed: 2025,
      rolls: 60000,
      /** mulberry32(2025) reference counts for sums 2..12. */
      counts: [1694, 3374, 5111, 6643, 8332, 10091, 8202, 6589, 4971, 3358, 1635],
    };
    const rng = createRng(GOLDEN.seed);
    const counts: number[] = new Array(13).fill(0);
    for (let i = 0; i < GOLDEN.rolls; i++) counts[roll2D6(rng)]++;

    // deterministic counts from the seed
    expect(counts.slice(2)).toEqual(GOLDEN.counts);

    // 7 is the unique mode of the triangular shape
    const mode = counts.indexOf(Math.max(...counts.slice(2)));
    expect(mode).toBe(7);

    // symmetric around 7: P(k) == P(14-k)
    for (let k = 2; k <= 6; k++) {
      expect(Math.abs(counts[k] - counts[14 - k])).toBeLessThanOrEqual(250);
    }

    // each sum within 5% of its theoretical triangular frequency
    for (let s = 2; s <= 12; s++) {
      const expected = (GOLDEN.rolls * Math.min(s - 1, 13 - s)) / 36;
      expect(Math.abs(counts[s] - expected)).toBeLessThanOrEqual(expected * 0.05);
    }
  });

  it("rollD16 (injury table) is uniform 1..16 over a long seeded run", () => {
    const rolls = 160000;
    const rng = createRng(2025);
    const counts: number[] = new Array(17).fill(0);
    for (let i = 0; i < rolls; i++) counts[rollD16(rng)]++;

    const expected = rolls / 16;
    for (let face = 1; face <= 16; face++) {
      expect(counts[face]).toBeGreaterThan(0);
      expect(Math.abs(counts[face] - expected)).toBeLessThanOrEqual(expected * 0.03);
    }
  });

  it("flipCoin is fair over a long seeded run", () => {
    const flips = 100000;
    const rng = createRng(2025);
    let heads = 0;
    for (let i = 0; i < flips; i++) if (flipCoin(rng)) heads++;
    expect(heads).toBeGreaterThan(0);
    expect(Math.abs(heads - flips / 2)).toBeLessThanOrEqual(flips * 0.01);
  });
});
