/**
 * Player sprite registry (RAU-sprites).
 *
 * Sprites are AI-generated (Gemini flash-lite-image) from the app's
 * races.catalog.json positionals, post-processed to the project's
 * rulebook-light palette ("crisp" style). Assets live in `/public/sprites/`
 * named `{raceId}-{positionalKey}.png`.
 *
 * Only teams whose design has been APPROVED are registered here; unregistered
 * teams keep their emoji fallback until their sprites ship. Size class drives
 * relative rendering: big guys render 130%, stunty players 70%, the rest 100%.
 */

export type SpriteScaleClass = "big" | "normal" | "small";

/** Relative render scale per size class (big guys must look BIGGER). */
export const SPRITE_SCALE: Record<SpriteScaleClass, number> = {
  big: 1.3,
  normal: 1,
  small: 0.7,
};

/** Positional keys that identify a big guy (drawn 30% larger in the UI). */
const BIG_POSITIONAL_KEYWORDS = [
  "ogre",
  "troll",
  "minotaur",
  "kroxigor",
  "treeman",
  "mummy",
  "vargheist",
  "deathroller",
  "rotspawn",
  "juggernaut",
  "golem",
  "centaur",
  "tomb-guardian",
  "pump-wagon",
];

/** Positional keys that identify a stunty/small player (drawn 70%). */
const SMALL_POSITIONAL_KEYWORDS = [
  "halfling",
  "goblin",
  "snotling",
  "gnoblar",
  "skink",
  "hopeful",
  "stilty",
  "fungus",
  "fun-hoppa",
  "beer-boar",
  "fox",
  "loony",
  "pogoer",
  "bombardier",
  "ooligan",
  "doom-diver",
  "fanatic",
  "bruiser",
  "hefty",
];

/** The size class of a positional — big > normal > small. */
export function spriteScaleClass(
  raceId: string,
  positionalKey: string,
): SpriteScaleClass {
  void raceId;
  // A Troll Slayer is a DWARF, not a troll — normal size.
  if (positionalKey.includes("slayer")) return "normal";
  for (const kw of BIG_POSITIONAL_KEYWORDS) {
    if (positionalKey.includes(kw)) return "big";
  }
  for (const kw of SMALL_POSITIONAL_KEYWORDS) {
    if (positionalKey.includes(kw)) return "small";
  }
  return "normal";
}

/**
 * Approved sprite assets currently shipped. Team design must be approved
 * before its positionals are added here (see the sprite pipeline docs).
 */
const AVAILABLE_SPRITES = new Set<string>([
  "amazon-linewoman",
  "amazon-thrower",
  "amazon-catcher",
  "amazon-blitzer",
]);

/** Public URL for an approved sprite, or null when the team has none yet. */
export function spritePath(
  raceId: string,
  positionalKey: string,
): string | null {
  const key = `${raceId}-${positionalKey}`;
  return AVAILABLE_SPRITES.has(key) ? `/sprites/${key}.png` : null;
}
