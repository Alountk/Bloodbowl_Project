import { describe, expect, it } from "vitest";
import { buildRoundRobin, generateRoundRobin } from "./roundRobin";

/**
 * Units tests for the round-robin fixture generator.
 *
 * The generator SHUFFLES team ids (Math.random), then applies the circle
 * method, so the exact pairing order is non-deterministic. Tests therefore
 * assert invariants: correct round count, floor(n/2) matchups per round,
 * no repeated unordered pair across the returned rounds, and — at the full
 * season length (n−1) — every unordered pair exactly once.
 */

/** Canonical, order-independent key for a home/away pair. */
function keyOf(home: string, away: string): string {
  return [home, away].sort().join("|");
}

describe("buildRoundRobin", () => {
  it("n=4, length 3 → 3 rounds, 6 matchups, every unordered pair exactly once", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const fixtures = buildRoundRobin(ids, 3);

    // 3 rounds, floor(4/2)=2 matchups each.
    const rounds = Math.max(...fixtures.map((f) => f.round));
    expect(rounds).toBe(3);
    expect(fixtures.map((f) => f.round)).toEqual([1, 1, 2, 2, 3, 3]);

    // Every team appears exactly once per round (2 matchups = 4 team slots).
    for (let r = 1; r <= 3; r++) {
      const slots = fixtures.filter((f) => f.round === r).flatMap((f) => [f.homeTeamId, f.awayTeamId]);
      expect(slots).toHaveLength(4);
      expect(new Set(slots).size).toBe(4);
    }

    // 6 matchups, 6 distinct unordered pairs → every unordered pair once.
    const pairs = fixtures.map((f) => keyOf(f.homeTeamId, f.awayTeamId));
    expect(pairs).toHaveLength(6);
    expect(new Set(pairs).size).toBe(6);
    const expected = ["t1|t2", "t1|t3", "t1|t4", "t2|t3", "t2|t4", "t3|t4"];
    for (const pair of expected) {
      expect(pairs).toContain(pair);
    }
  });

  it("n=6, length 5 → 5 rounds, 15 matchups, every unordered pair exactly once", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const fixtures = buildRoundRobin(ids, 5);

    const rounds = Math.max(...fixtures.map((f) => f.round));
    expect(rounds).toBe(5);
    // 5 rounds × floor(6/2)=3 matchups = 15.
    expect(fixtures).toHaveLength(15);

    // Each round has exactly 3 matchups covering all 6 teams once.
    for (let r = 1; r <= 5; r++) {
      const round = fixtures.filter((f) => f.round === r);
      expect(round).toHaveLength(3);
      const slots = round.flatMap((f) => [f.homeTeamId, f.awayTeamId]);
      expect(new Set(slots).size).toBe(6);
    }

    // 15 distinct unordered pairs = C(6,2), so every pair occurs once.
    const pairs = fixtures.map((f) => keyOf(f.homeTeamId, f.awayTeamId));
    expect(new Set(pairs).size).toBe(15);
  });

  it("n=4, length 2 → only 2 rounds, no repeated unordered pair", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const fixtures = buildRoundRobin(ids, 2);

    expect(Math.max(...fixtures.map((f) => f.round))).toBe(2);
    expect(fixtures).toHaveLength(4);
    const pairs = fixtures.map((f) => keyOf(f.homeTeamId, f.awayTeamId));
    expect(new Set(pairs).size).toBe(4); // no repeats across the partial season
  });

  it("n=4, length 1 → exactly one round of 2 matchups", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const fixtures = buildRoundRobin(ids, 1);
    expect(fixtures).toHaveLength(2);
    expect(new Set(fixtures.map((f) => f.round))).toEqual(new Set([1]));
  });

  it("throws RangeError when fewer than 2 teams", () => {
    expect(() => buildRoundRobin([], 1)).toThrow(RangeError);
    expect(() => buildRoundRobin(["only"], 1)).toThrow(RangeError);
  });

  it("throws RangeError when seasonLength exceeds teams - 1", () => {
    expect(() => buildRoundRobin(["a", "b", "c", "d"], 4)).toThrow(RangeError);
    expect(() => buildRoundRobin(["a", "b", "c", "d"], 400)).toThrow(RangeError);
  });

  it("throws RangeError when seasonLength is below 1", () => {
    expect(() => buildRoundRobin(["a", "b", "c", "d"], 0)).toThrow(RangeError);
    expect(() => buildRoundRobin(["a", "b", "c", "d"], -3)).toThrow(RangeError);
  });

  it("does not mutate the input array", () => {
    const ids = ["t1", "t2", "t3", "t4"];
    const snapshot = [...ids];
    buildRoundRobin(ids, 3);
    expect(ids).toEqual(snapshot);
  });
});

describe("generateRoundRobin (circle method, unshuffled)", () => {
  it("is deterministic for a fixed input order", () => {
    const a = generateRoundRobin(["1", "2", "3", "4"]);
    const b = generateRoundRobin(["1", "2", "3", "4"]);
    expect(a).toEqual(b);
  });

  it("handles an odd team count with a per-round bye (n=5 → 4 usable rounds)", () => {
    const fixtures = buildRoundRobin(["a", "b", "c", "d", "e"], 4);
    // 4 rounds × floor(5/2)=2 matchups = 8.
    expect(fixtures).toHaveLength(8);
    for (let r = 1; r <= 4; r++) {
      const slots = fixtures
        .filter((f) => f.round === r)
        .flatMap((f) => [f.homeTeamId, f.awayTeamId]);
      expect(new Set(slots).size).toBe(4); // one team gets the bye each round
    }
    const pairs = fixtures.map((f) => keyOf(f.homeTeamId, f.awayTeamId));
    expect(new Set(pairs).size).toBe(8); // 8 distinct pairs, no repeats
  });
});
