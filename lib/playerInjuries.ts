/**
 * RAU-12 next-match availability rules (BB2025): a player who suffers a
 * LASTING injury (apaleado, grave, permanent) in a match is unavailable for
 * the team's NEXT match. Bruises never block; dead players stay dead.
 *
 * Apply order matters: when a match is applied the team's players who were
 * suspended from BEFORE this match have served their suspension, so the store
 * CLEARS every player of both teams first, THEN re-sets the newly injured —
 * a player injured in THIS match starts their suspension AFTER it, not during.
 */

/** The rulebook bands that make a player miss the NEXT match (RAU-12). */
export const LASTING_BANDS = ["apaleado", "grave", "permanent"] as const;

export type LastingBand = (typeof LASTING_BANDS)[number];

/** True when the band marks a player unavailable for the next match. */
export function isLastingBand(band: string): boolean {
  return (LASTING_BANDS as readonly string[]).includes(band);
}

/** Clear: a match was just applied — pre-existing suspensions are served. */
export function clearSuspensionUpdate(): { missNextMatch: boolean } {
  return { missNextMatch: false };
}

/** Set: a victim's persisted band marks their next-match availability. Dead
 * victims keep `missNextMatch` false (the flag is irrelevant once dead); the
 * alive flag follows the band exactly as before the suspension rules. */
export function injurySuspensionUpdate(
  band: string,
  alive: boolean,
): { missNextMatch: boolean; alive: boolean } {
  return {
    missNextMatch: isLastingBand(band),
    alive: band === "dead" ? false : alive,
  };
}
