/**
 * Player value bonus from acquired skills — user-validated
 * (player-progression R4 / REQ-RACE-08): a normal skill adds +10.000 to the
 * player's value, an élite skill +20.000. Tracked as `Player.valueBonus`.
 */

export const NORMAL_SKILL_VALUE_BONUS = 10_000;
export const ELITE_SKILL_VALUE_BONUS = 20_000;

export interface ValueSkill {
  elite: boolean;
}

/** Sums the value bonus over the player's acquired skills. */
export function computeValueBonus(skills: readonly ValueSkill[]): number {
  return skills.reduce(
    (total, skill) => total + (skill.elite ? ELITE_SKILL_VALUE_BONUS : NORMAL_SKILL_VALUE_BONUS),
    0,
  );
}
