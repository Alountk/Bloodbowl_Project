import type { SkillCategory } from "@/features/teams/data/skills";
import { getSkillById, getSkillByName } from "@/features/teams/data/skills";
import type { SkillColumn } from "./rules/skills";
import type { PlayerAttribute } from "./rules/improvements";

/** The discriminated improve-route request body shared by the route and the UI. */
export type ImproveBody =
  | { type: "random-roll"; category: SkillColumn }
  | { type: "random-pick"; selectedSkill: string }
  | { type: "primary" | "secondary"; skillId: string }
  | { type: "attribute"; attribute: PlayerAttribute };

/** Progression read model rendered by the panel (one roster player). */
export interface PlayerProgression {
  rosterPlayerId: string;
  name: string;
  pe: number;
  improvements: number;
  skills: string[];
  valueBonus: number;
  alive: boolean;
  accessPrimary: string[];
  accessSecondary: string[];
}

/**
 * Progression rules glue: maps the shared skill catalog's categories onto the
 * rulebook access-letter columns (A/F/G/M/P/T) used by the race-data positionals
 * and by the random-skill table. A primary/secondary pick is valid only when the
 * skill's category letter is in the positional's `accessPrimary` (`secondary`).
 *
 * `trait` (inherent, non-acquired) skills are not purchasable via progression:
 * they map to no access letter, so the improve route rejects them with 400.
 */
const CATEGORY_TO_LETTER: Record<SkillCategory, SkillColumn | null> = {
  general: "G",
  agility: "A",
  strength: "F",
  passing: "P",
  mutation: "M",
  devious: "T",
  trait: null,
};

export function accessLetterForCategory(category: SkillCategory): SkillColumn | null {
  return CATEGORY_TO_LETTER[category];
}

/** Spanish "es" canonical display name from a catalog entry (falls back to EN). */
function spanishName(entry: { name: string; translations?: readonly { id: string; translation: string }[] }): string {
  return entry.translations?.find((t) => t.id === "es")?.translation ?? entry.name;
}

/**
 * Resolves a stored skill reference (a catalog `SkillId` OR a raw random-table
 * name) to its display name, so `Player.skills` can mix both sources and still
 * be rendered and deduplicated against the random table. Catalog ids resolve to
 * their Spanish catalog equivalent; every other value passes through unchanged.
 */
export function skillDisplayName(ref: string): string {
  const byId = getSkillById(ref);
  if (byId) return spanishName(byId);
  const byName = getSkillByName(ref);
  if (byName) return spanishName(byName);
  return ref;
}

/**
 * Résolves whether a stored skill reference is élite (rulebook `$` symbol,
 * +20.000 value). Looks the ref up as a catalog id first, then as a name.
 */
export function skillElite(ref: string): boolean {
  const byId = getSkillById(ref);
  if (byId) return byId.elite;
  return getSkillByName(ref)?.elite ?? false;
}

/**
 * Canonical dedup key for a skill reference: when the ref (an id or a
 * random-table name) resolves to a catalog skill, the key is its catalog `SkillId`;
 * otherwise the key is the raw ref. "block" and "Placar" therefore share the key
 * "block", so the random-roll eligibility check never offers a skill the player
 * already owns under either representation.
 *
 * The élite aliases are the four user-validated élite skills (REQ-RACE-08) mapped
 * to their catalog ids by their rulebook/Spanish random-table names — these
 * appear in the random table but lack the needed es catalog translation.
 */
const ELITE_NAME_ALIAS: Record<string, string> = {
  Placar: "block",
};

export function skillKey(ref: string): string {
  const byId = getSkillById(ref);
  if (byId) return byId.id;
  // The rulebook/Spanish random-table "Placar" is the élite Block skill, which the
  // catalog's es translation would otherwise bind to Tackle — resolve that name first.
  const alias = ELITE_NAME_ALIAS[ref];
  if (alias) return alias;
  const byName = getSkillByName(ref);
  if (byName) return byName.id;
  return ref;
}
