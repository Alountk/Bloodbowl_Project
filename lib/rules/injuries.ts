/**
 * BB2025 injury table — user-validated (bb2025-rules R5, rulebook 1D16):
 *   1-8 Magullado · 9-10 Apaleado (misses next) · 11-12 Herida grave (+PE) ·
 *   13-14 Permanente (−1 attribute, +PE) · 15-16 Muerto (eliminated).
 * A player with a previous permanent injury carries the LMC +1 modifier applied
 * to future 1D16 injury rolls. The permanent 1D6 maps 1 and 2 to −AR
 * (user-confirmed: the old "6 duplicado" is folded into ar), 3 −MV, 4 −PS,
 * 5 −AG, 6 −ST.
 *
 * NOTE: the +PE award for grave/permanent injuries is NOT numeric in the
 * validated artifacts — this module exposes the deterministic outcome only.
 */

export type InjuryOutcomeKind = "bruise" | "apaleado" | "grave" | "permanent" | "dead";

export type PermanentAttribute = "ar" | "mv" | "ps" | "ag" | "st";

export const INJURY_OUTCOMES: readonly InjuryOutcomeKind[] = [
  "bruise",
  "apaleado",
  "grave",
  "permanent",
  "dead",
];

export const PERMANENT_ATTRIBUTES: readonly PermanentAttribute[] = [
  "ar",
  "mv",
  "ps",
  "ag",
  "st",
];

export type InjuryOutcome =
  | { kind: "bruise" }
  | { kind: "apaleado" }
  | { kind: "grave" }
  | { kind: "permanent" }
  | { kind: "dead" };

/** Maps the permanent-injury 1D6 to the reduced attribute (1 and 2 → ar). */
export function permanentAttribute(roll6: number): PermanentAttribute {
  if (roll6 <= 2) return "ar";
  if (roll6 === 3) return "mv";
  if (roll6 === 4) return "ps";
  if (roll6 === 5) return "ag";
  return "st";
}

/**
 * Resolves a 1D16 injury roll band. `permanentModifier` is the LMC +1 carried by
 * a player with a previous permanent injury; it is added to the raw roll. The
 * `permanent` outcome's reduced attribute is resolved separately by
 * `permanentAttribute(1D6)` (a distinct die roll per the rulebook).
 */
export function resolveInjury(roll16: number, permanentModifier = 0): InjuryOutcome {
  const effectiveRoll = roll16 + permanentModifier;
  if (effectiveRoll <= 8) return { kind: "bruise" };
  if (effectiveRoll <= 10) return { kind: "apaleado" };
  if (effectiveRoll <= 12) return { kind: "grave" };
  if (effectiveRoll <= 14) return { kind: "permanent" };
  return { kind: "dead" };
}
