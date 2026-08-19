import { RULESET_RACE_IDS } from "@/lib/rulesets";

/**
 * RAU-52 race-checkbox presets for the ruleset wizard (step 2). UI conveniences
 * only — the server accepts any subset of the 31-race catalog and never knows
 * about presets. Presets are derived from the live catalog so a catalog change
 * (e.g. a new race) automatically propagates.
 */

/** Races widely classified as "stunty" (small/weak teams). */
export const STUNTY_RACE_IDS: readonly string[] = [
  "halfling",
  "goblin",
  "snotling",
  "ogre",
  "gnome",
];

/** "Sin stunties" = every catalog race except the stunty ones. */
export function presetSinStunties(): string[] {
  return RULESET_RACE_IDS.filter((id) => !STUNTY_RACE_IDS.includes(id));
}

/** "Todas" = the full catalog. */
export function presetTodas(): string[] {
  return [...RULESET_RACE_IDS];
}

/** "Tier 1" = the eight elite/competitive races offered in the design preview. */
export const TIER1_RACE_IDS: readonly string[] = [
  "human",
  "orc",
  "dwarf",
  "dark-elf",
  "high-elf",
  "elven-union",
  "wood-elf",
  "shambling-undead",
];

export function presetTier1(): string[] {
  return [...TIER1_RACE_IDS];
}

/** The three wizard presets keyed for the UI. */
export const RACE_PRESETS = [
  { key: "todas", apply: presetTodas },
  { key: "tier1", apply: presetTier1 },
  { key: "sinStunties", apply: presetSinStunties },
] as const;
