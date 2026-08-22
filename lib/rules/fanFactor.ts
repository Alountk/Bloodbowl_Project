/**
 * BB2025 fan factor changes and pre-match value — user-validated (bb2025-rules
 * R4). Post-match "ACTUALIZAR HINCHAS" (rulebook p. 103, "Secuencia posterior
 * al partido"):
 *   - WIN:   roll 1D6. If the result is >= the team's Hinchas attribute
 *            (dedicated fans), the attribute INCREASES by 1 (max 7).
 *   - LOSS:  roll 1D6. If the result is <  the Hinchas attribute, it DECREASES
 *            by 1 (min 1).
 *   - DRAW:  the attribute stays unchanged.
 * The roll compares against the dedicated-fans ATTRIBUTE (`coaching.
 * dedicatedFans`), NOT the pre-match attendance factor (1D3 + dedicated fans) —
 * that one only drives winnings/kickoff.
 * Pre-match attendance FF = 1D3 + roster dedicated fans.
 */

export const MAX_FAN_FACTOR = 7;
export const MIN_FAN_FACTOR = 1;

export type MatchOutcome = "win" | "loss" | "draw";

export interface FanFactorInput {
  /** Pre-match dedicated-fans attribute (1-7). */
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

/** The post-match fan-factor roll verdict: UP, STAYS or DOWN. */
export type FanFactorDirection = "up" | "stay" | "down";

/** The full post-match fan-factor roll result — the before attribute, the 1D6
 * roll, the after attribute and the direction. Surfaced in the resolution
 * summary ("Factor fan: ↑ / = / ↓" + the roll) and applied to
 * `coaching.dedicatedFans`. */
export interface PostMatchFanFactorRoll {
  /** The dedicated-fans attribute BEFORE the roll. */
  before: number;
  /** The 1D6 roll. */
  roll6: number;
  /** The dedicated-fans attribute AFTER the roll. */
  after: number;
  direction: FanFactorDirection;
}

/** Rolls the post-match fan-factor change: derives the new attribute AND the
 * UP/STAY/DOWN verdict from the SAME roll (rulebook p. 103). */
export function rollPostMatchFanFactor(input: FanFactorInput): PostMatchFanFactorRoll {
  const after = postMatchFanFactor(input);
  const direction: FanFactorDirection = after > input.ff ? "up" : after < input.ff ? "down" : "stay";
  return { before: input.ff, roll6: input.roll6, after, direction };
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

