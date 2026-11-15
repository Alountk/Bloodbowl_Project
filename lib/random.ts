/**
 * Server-owned dice wrappers for BB2025 post-match resolution. All result
 * dice — pre-match fan factor (1D3), action/FF/MJP (1D6), injury (1D16) — are
 * rolled here so the result route never trusts a client-provided roll.
 *
 * Tabletop fidelity: every die is uniform on its physical faces; `rollD3` is
 * the real d6/2 mapping (roll a d6, halve, round up); `rollD16` is a real 1D16
 * (uniform — the injury table is NOT 2D8); `roll2D6` is the SUM of two
 * independent d6 (triangular 2..12); `flipCoin` is fair.
 *
 * Seeded engine (TESTS ONLY): `createRng(seed)` returns a deterministic
 * mulberry32 stream — the same seed replays the same sequence. Numeric seeds
 * are used as 32-bit integers; string seeds are hashed with xmur3. Runtime
 * stays random: production call sites never pass a seed.
 *
 * Injection approach (one, documented): every roll helper takes an OPTIONAL
 * TRAILING `Rng` — no module-level setter, no hidden state. Tests pass a
 * seeded `createRng(seed)` (or any stub `() => number`); when omitted, the
 * source is `Math.random`, so every existing zero-arg call site is
 * behavior-identical.
 */

/** A float stream in [0, 1) — the only source of randomness in this module. */
export type Rng = () => number;

const defaultRng: Rng = () => Math.random();

/**
 * Deterministic seeded stream (tests only). Same seed = same sequence.
 */
export function createRng(seed: number | string): Rng {
  return mulberry32(typeof seed === "number" ? seed >>> 0 : xmur3(seed)());
}

/** Physical D3: roll a d6 and halve (round up) — uniform 1-3. */
export function rollD3(rng: Rng = defaultRng): number {
  return Math.ceil(rollDie(6, rng) / 2);
}

export function rollD6(rng: Rng = defaultRng): number {
  return rollDie(6, rng);
}

export function rollD8(rng: Rng = defaultRng): number {
  return rollDie(8, rng);
}

/** Injury table: a real 1D16 — uniform 1-16 (NOT 2D8). */
export function rollD16(rng: Rng = defaultRng): number {
  return rollDie(16, rng);
}

/** Real 2D6: the SUM of two independent d6 — triangular 2..12. */
export function roll2D6(rng: Rng = defaultRng): number {
  return rollDie(6, rng) + rollDie(6, rng);
}

/** Fair coin flip — `true` = heads. */
export function flipCoin(rng: Rng = defaultRng): boolean {
  return rng() < 0.5;
}

function rollDie(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

/** mulberry32 — small, high-quality 32-bit PRNG (public domain). */
function mulberry32(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** xmur3 — hashes a seed string into a 32-bit integer. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
