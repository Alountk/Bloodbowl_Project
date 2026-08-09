/**
 * Round-robin (circle method) fixture generator.
 *
 * Gives a started league an automatic set of "jornada" pairings. The
 * generator SHUFFLES the team ids (Fisher-Yates with Math.random), applies the
 * classic circle method to produce `n−1` rounds of `floor(n/2)` matchups where
 * every unordered pair of teams meets at most once, and returns only the first
 * `seasonLength` rounds. At `seasonLength = n−1` the returned set forms a
 * perfect round-robin: every unordered pair appears exactly once (n=4 → all 6
 * of C(4,2) pairs; n=6 → all 15 of C(6,2) pairs).
 */

/** A single scheduled pairing within a round (jornada). */
export interface FixtureDraft {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

function assertValid(
  teamIds: readonly string[],
  seasonLength: number,
): asserts teamIds is readonly string[] {
  if (teamIds.length < 2) {
    throw new RangeError("Round-robin requires at least two teams.");
  }
  if (seasonLength < 1 || seasonLength > teamIds.length - 1) {
    throw new RangeError(
      `Season length must be between 1 and ${teamIds.length - 1}.`,
    );
  }
}

/**
 * Fisher-Yates shuffle over a copy of the input. The input array is never
 * mutated. `random` is injectable for deterministic tests/property checks.
 */
export function shuffle<T>(
  input: readonly T[],
  random: () => number = Math.random,
): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Circle method over team ids in the given (already-ordered) sequence.
 * Returns every generated round, i.e. `n−1` rounds for an even `n` (one team
 * receives a bye per round when `n` is odd, and the returned rounds are those
 * up to `n−1`). Deterministic for a fixed input order.
 */
export function generateFullRoundRobin(
  teamIds: readonly string[],
): FixtureDraft[] {
  const arr: Array<string | null> = [...teamIds];
  // Bye sentinel: pad odd team counts so the circle has an even number of
  // slots; a pairing that touches the sentinel is skipped.
  if (arr.length % 2 === 1) arr.push(null);
  const m = arr.length;
  const rounds = m - 1;
  const drafts: FixtureDraft[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < m / 2; i++) {
      const home = arr[i];
      const away = arr[m - 1 - i];
      if (home === null || away === null) continue; // bye round
      drafts.push({ round: r + 1, homeTeamId: home, awayTeamId: away });
    }
    // Rotate everything except the fixed pivot (arr[0]) one step to the right.
    const last = arr[m - 1];
    for (let j = m - 1; j > 1; j--) arr[j] = arr[j - 1];
    arr[1] = last;
  }
  return drafts;
}

/**
 * Deterministic circle method limited to `seasonLength` rounds, with input
 * validation. Throws RangeError when fewer than two teams are supplied or when
 * `seasonLength` is outside `[1, n−1]`. Does NOT shuffle; the caller decides
 * the order (see `buildRoundRobin` for the shuffled entry point).
 */
export function generateRoundRobin(
  teamIds: readonly string[],
  seasonLength: number,
): FixtureDraft[] {
  assertValid(teamIds, seasonLength);
  return generateFullRoundRobin(teamIds).filter(
    (d) => d.round <= seasonLength,
  );
}

/**
 * Shuffles the team ids (Fisher-Yates with Math.random), applies the circle
 * method, and returns the first `seasonLength` rounds. The shuffle is a copy
 * operation — the input array is left unchanged. Throws RangeError when fewer
 * than two teams are supplied or `seasonLength` is outside `[1, n−1]`.
 */
export function buildRoundRobin(
  teamIds: string[],
  seasonLength: number,
): FixtureDraft[] {
  assertValid(teamIds, seasonLength);
  const shuffled = shuffle(teamIds);
  return generateRoundRobin(shuffled, seasonLength);
}
