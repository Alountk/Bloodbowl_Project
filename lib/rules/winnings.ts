/**
 * BB2025 match winnings — user-validated formula (bb2025-rules R4):
 *   ((FF1+FF2)/2 + own TDs + 1 if the team never held the ball) × 10.000
 * Fractional halves carry through (e.g. (4+3)/2 = 3.5 → 65.000 with 2 TDs
 * and the ball held). No roll is involved.
 */

export interface WinningsInput {
  /** Pre-match fan factor of this team (1D3 + dedicated fans). */
  ffHome: number;
  /** Pre-match fan factor of the opposing team. */
  ffAway: number;
  /** Touchdowns this team scored. */
  ownTds: number;
  /** Whether the team held the ball at least once during the match. */
  heldBall: boolean;
}

export const WINNINGS_MULTIPLIER = 10_000;

export function computeWinnings(input: WinningsInput): number {
  const heldBallBonus = input.heldBall ? 0 : 1;
  const units = (input.ffHome + input.ffAway) / 2 + input.ownTds + heldBallBonus;
  return Math.round(units * WINNINGS_MULTIPLIER);
}
