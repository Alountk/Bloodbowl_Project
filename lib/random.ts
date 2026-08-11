/**
 * Server-owned dice wrappers for BB2025 post-match resolution. All result
 * dice — pre-match fan factor (1D3), action/FF/MJP (1D6), injury (1D16) — are
 * rolled here so the result route never trusts a client-provided roll.
 */
export function rollD3(): number {
  return rollDie(3);
}

export function rollD6(): number {
  return rollDie(6);
}

export function rollD8(): number {
  return rollDie(8);
}

export function rollD16(): number {
  return rollDie(16);
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}
