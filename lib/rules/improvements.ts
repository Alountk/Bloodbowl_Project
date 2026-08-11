/**
 * BB2025 improvement cost table — user-validated (bb2025-rules R2).
 * `improvementCost(improvementNumber, kind)` returns the PE cost for the
 * Nth improvement (1-based). The 6ª row is the ceiling for any further ones.
 */

export type ImprovementKind = "random" | "primary" | "secondary" | "attribute";

export const IMPROVEMENT_KINDS: readonly ImprovementKind[] = [
  "random",
  "primary",
  "secondary",
  "attribute",
];

/** 2D cost table: row = kind, col = improvement number (0-based `[1ª, ..., 6ª]`). */
const COSTS: readonly number[][] = [
  // 1ª, 2ª, 3ª, 4ª, 5ª, 6ª
  [3, 4, 6, 8, 10, 15], // random / azar
  [6, 8, 12, 16, 20, 30], // primary
  [10, 12, 16, 20, 24, 34], // secondary
  [14, 16, 20, 24, 28, 38], // attribute
];

const KIND_INDEX: Record<ImprovementKind, number> = {
  random: 0,
  primary: 1,
  secondary: 2,
  attribute: 3,
};

export function improvementCost(improvementNumber: number, kind: ImprovementKind): number {
  // improvementNumber is 1-based; the 6ª row caps any improvement beyond it.
  const row = Math.min(improvementNumber, 6);
  return COSTS[KIND_INDEX[kind]][row - 1];
}
