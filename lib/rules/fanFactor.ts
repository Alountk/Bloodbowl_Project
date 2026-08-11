/**
 * BB2025 fan factor changes and pre-match value — user-validated (bb2025-rules R4).
 * Win: 1D6 >= FF → +1 (max 7). Loss: 1D6 < FF → −1 (min 1). Draw: 0.
 * Pre-match FF = 1D3 + roster dedicated fans.
 */

export const MAX_FAN_FACTOR = 7;
export const MIN_FAN_FACTOR = 1;

export type MatchOutcome = "win" | "loss" | "draw";

export interface FanFactorInput {
  /** Pre-match fan factor (1-7). */
  ff: number;
  /** The team's match result. */
  result: MatchOutcome;
  /** A 1D6 roll (1-6). */
  roll6: number;
}

export function postMatchFanFactor(input: FanFactorInput): number {
  if (input.result === "draw") return input.ff;
  if (input.result === "win") {
    if (input.roll6 >= input.ff) return Math.min(MAX_FAN_FACTOR, input.ff + 1);
    return input.ff;
  }
  // loss
  if (input.roll6 < input.ff) return Math.max(MIN_FAN_FACTOR, input.ff - 1);
  return input.ff;
}

export interface PreMatchFanFactorInput {
  /** A 1D3 roll (1-3). */
  roll3: number;
  /** Roster dedicated fans characteristic (coaching.dedicatedFans). */
  dedicatedFans: number;
}

export function preMatchFanFactor(input: PreMatchFanFactorInput): number {
  return input.roll3 + input.dedicatedFans;
}
