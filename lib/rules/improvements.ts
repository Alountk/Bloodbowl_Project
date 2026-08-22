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

/** The five trainable attribute characteristics (design payload units). */
export type PlayerAttribute = "ma" | "st" | "ag" | "pa" | "av";

export const PLAYER_ATTRIBUTES: readonly PlayerAttribute[] = [
  "ma",
  "st",
  "ag",
  "pa",
  "av",
];

/**
 * Rulebook attribute-improvement table (1D8, OCR from the user's original
 * message): each outcome names the attributes the coach may choose to increase.
 * Abbreviations map to the design units: AR=av (Armadura), MV=ma (Movimiento),
 * PS=pa (Pase), AG=ag (Agilidad), FU=st (Fuerza). Row 8 is "cualquier atributo"
 * (all five). Any out-of-range 1D8 reads as the any-attribute row to stay safe.
 */
const ATTRIBUTE_OPTIONS: Readonly<Record<number, readonly PlayerAttribute[]>> = {
  1: ["av"],
  2: ["av", "pa"],
  3: ["av", "ma", "pa"],
  4: ["av", "ma", "pa"],
  5: ["ma", "pa"],
  6: ["ag", "ma"],
  7: ["ag", "st"],
};

const ANY_ATTRIBUTE: readonly PlayerAttribute[] = [...PLAYER_ATTRIBUTES];

export function attributeOptionsForRoll(roll8: number): readonly PlayerAttribute[] {
  return ATTRIBUTE_OPTIONS[roll8] ?? ANY_ATTRIBUTE;
}

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

/**
 * The PE cost of a player's NEXT random (cheapest) improvement, given how many
 * improvements they have already acquired. Random is the baseline the "ready to
 * improve" flag compares against (row 6ª caps any further acquisitions).
 */
export function nextImprovementCost(improvements: number): number {
  return improvementCost(improvements + 1, "random");
}

/**
 * Whether a roster player is ready for their next improvement: alive AND with
 * enough PE to afford the cheapest (random) next improvement. Dead players are
 * never ready regardless of accumulated PE.
 */
export function isReadyToImprove(player: {
  pe: number;
  alive: boolean;
  improvements: number;
}): boolean {
  if (!player.alive) return false;
  return player.pe >= nextImprovementCost(player.improvements);
}
