export const SKILL_CATEGORIES = [
  "general",
  "strength",
  "agility",
  "passing",
  "mutation",
  "devious",
  "trait",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export interface SkillTranslation {
  id: string;
  translation: string;
}

export interface SkillDescriptionTranslation {
  id: string;
  description: string;
}

export interface SkillCatalogEntry {
  id: SkillId;
  name: string;
  category: SkillCategory;
  translations: SkillTranslation[];
  description: string;
  descriptions: SkillDescriptionTranslation[];
  /** Whether the skill is an élite skill (rulebook $ symbol, +20.000 value). */
  elite: boolean;
  /** Whether the skill is mandatory (rulebook * marker, must be used). */
  mandatory: boolean;
}

const TODO_DESCRIPTION = "TODO: Official BB2025 rules text is still pending.";

interface RawSkillDef {
  id: string;
  name: string;
  category: SkillCategory;
  translations?: readonly SkillTranslation[];
  /** Élite skill (rulebook $ symbol); default false. */
  elite?: boolean;
  /** Mandatory skill (rulebook * marker); default false. */
  mandatory?: boolean;
}

function createSkill(def: RawSkillDef): SkillCatalogEntry {
  const translations: SkillTranslation[] = def.translations
    ? def.translations.map((translation) => ({ ...translation }))
    : [];

  return {
    id: def.id as SkillId,
    name: def.name,
    category: def.category,
    translations,
    description: `${TODO_DESCRIPTION} (${def.name})`,
    descriptions: translations.map((translation) => ({
      id: translation.id,
      description: `${TODO_DESCRIPTION} (${translation.translation})`,
    })),
    elite: def.elite ?? false,
    mandatory: def.mandatory ?? false,
  };
}

const SKILL_DEFS = [
  { id: "always-hungry", name: "Always Hungry", category: "trait" },
  { id: "animal-savagery", name: "Animal Savagery", category: "trait" },
  { id: "animosity-all", name: "Animosity (all)", category: "trait" },
  { id: "animosity-goblin", name: "Animosity (Goblin)", category: "trait" },
  { id: "arm-bar", name: "Arm Bar", category: "strength", translations: [{ id: "es", translation: "Llave de brazo" }] },
  { id: "ball-and-chain", name: "Ball & Chain", category: "trait" },
  { id: "block", name: "Block", category: "general", elite: true },
  { id: "blood-lust-2-plus", name: "Blood Lust (2+)", category: "trait" },
  { id: "blood-lust-3-plus", name: "Blood Lust (3+)", category: "trait" },
  { id: "bombardier", name: "Bombardier", category: "trait" },
  { id: "brawler", name: "Brawler", category: "strength", translations: [{ id: "es", translation: "Luchador" }] },
  { id: "break-tackle", name: "Break Tackle", category: "strength" },
  { id: "bribery-and-corruption", name: "Bribery & Corruption", category: "trait" },
  { id: "catch", name: "Catch", category: "agility" },
  { id: "chainsaw", name: "Chainsaw", category: "trait" },
  { id: "claws", name: "Claws", category: "mutation" },
  { id: "dauntless", name: "Dauntless", category: "general" },
  { id: "decay", name: "Decay", category: "trait" },
  { id: "defensive", name: "Defensive", category: "agility", translations: [{ id: "es", translation: "Defensa" }], elite: true },
  { id: "dirty-player-plus-1", name: "Dirty Player (+1)", category: "devious" },
  { id: "disturbing-presence", name: "Disturbing Presence", category: "mutation", translations: [{ id: "es", translation: "Presencia perturbadora" }] },
  { id: "dodge", name: "Dodge", category: "agility", translations: [{ id: "es", translation: "Esquivar" }], elite: true },
  { id: "drunkard", name: "Drunkard", category: "trait" },
  { id: "dump-off", name: "Dump-off", category: "passing", translations: [{ id: "es", translation: "Dejada" }] },
  { id: "fend", name: "Fend", category: "general" },
  { id: "fire-breathing", name: "Fire Breathing", category: "trait", translations: [{ id: "es", translation: "Exhalar fuego" }] },
  { id: "foul-appearance", name: "Foul Appearance", category: "mutation", mandatory: true },
  { id: "frenzy", name: "Frenzy", category: "general", translations: [{ id: "es", translation: "Furia" }, { id: "es-ocr", translation: "Furia asesina" }], mandatory: true },
  { id: "grab", name: "Grab", category: "strength" },
  { id: "hit-and-run", name: "Hit and Run", category: "agility" },
  { id: "horns", name: "Horns", category: "mutation", translations: [{ id: "es", translation: "Cuernos" }] },
  { id: "hypnotic-gaze", name: "Hypnotic Gaze", category: "trait" },
  { id: "iron-hard-skin", name: "Iron Hard Skin", category: "mutation", translations: [{ id: "es", translation: "Piel férrea" }] },
  { id: "juggernaut", name: "Juggernaut", category: "strength" },
  { id: "jump-up", name: "Jump Up", category: "agility", translations: [{ id: "es", translation: "En pie de un salto" }] },
  { id: "kick", name: "Kick", category: "general", translations: [{ id: "es", translation: "Patada de despeje" }] },
  { id: "kick-team-mate", name: "Kick Team-mate", category: "trait", translations: [{ id: "es", translation: "Chutar compañero" }] },
  { id: "leap", name: "Leap", category: "agility" },
  { id: "loner-3-plus", name: "Loner (3+)", category: "trait" },
  { id: "loner-4-plus", name: "Loner (4+)", category: "trait", translations: [{ id: "es", translation: "Solitario (4+)" }] },
  { id: "low-blow", name: "Low Blow", category: "trait" },
  { id: "mighty-blow-plus-1", name: "Mighty Blow (+1)", category: "strength", translations: [{ id: "es", translation: "Golpe mortífero" }], elite: true },
  { id: "nerves-of-steel", name: "Nerves of Steel", category: "passing" },
  { id: "no-hands", name: "No Hands", category: "trait" },
  { id: "nurgling-infestation", name: "Nurgling Infestation", category: "trait" },
  { id: "on-the-ball", name: "On the Ball", category: "passing" },
  { id: "pass", name: "Pass", category: "passing" },
  { id: "pogo-stick", name: "Pogo Stick", category: "trait" },
  { id: "prehensile-tail", name: "Prehensile Tail", category: "mutation" },
  { id: "pro", name: "Pro", category: "general" },
  { id: "projectile-vomit", name: "Projectile Vomit", category: "trait" },
  { id: "really-stupid", name: "Really Stupid", category: "trait", translations: [{ id: "es", translation: "Estúpido" }] },
  { id: "regeneration", name: "Regeneration", category: "trait" },
  { id: "right-stuff", name: "Right Stuff", category: "trait", translations: [{ id: "es", translation: "Humanoide bala" }] },
  { id: "running-pass", name: "Running Pass", category: "passing", translations: [{ id: "es", translation: "Pase precipitado" }] },
  { id: "runt-punter", name: "Runt Punter", category: "trait", translations: [{ id: "es", translation: "RP" }] },
  { id: "safe-pair-of-hands", name: "Safe Pair of Hands", category: "agility", translations: [{ id: "es", translation: "El balón es mío" }] },
  { id: "safe-pass", name: "Safe Pass", category: "passing" },
  { id: "secret-weapon", name: "Secret Weapon", category: "trait" },
  { id: "shadowing", name: "Shadowing", category: "devious", translations: [{ id: "es", translation: "Perseguir" }] },
  { id: "shakey", name: "Shakey", category: "trait", translations: [{ id: "es", translation: "Tembloroso" }] },
  { id: "side-step", name: "Side Step", category: "agility", translations: [{ id: "en-alt", translation: "Sidestep" }, { id: "es", translation: "Echarse a un lado" }] },
  { id: "slippery", name: "Slippery", category: "trait", translations: [{ id: "es", translation: "Escurridizo" }] },
  { id: "sneaky-git", name: "Sneaky Git", category: "devious" },
  { id: "sprint", name: "Sprint", category: "agility", translations: [{ id: "es", translation: "Esprintar" }] },
  { id: "stab", name: "Stab", category: "trait", translations: [{ id: "es", translation: "Apuñalar" }] },
  { id: "stand-firm", name: "Stand Firm", category: "strength", translations: [{ id: "es", translation: "Mantenerse firme" }] },
  { id: "strip-ball", name: "Strip Ball", category: "general" },
  { id: "strong-arm", name: "Strong Arm", category: "strength", translations: [{ id: "es", translation: "Brazo fuerte" }] },
  { id: "stunty", name: "Stunty", category: "trait" },
  { id: "sure-feet", name: "Sure Feet", category: "agility", translations: [{ id: "es", translation: "Pies firmes" }] },
  { id: "sure-hands", name: "Sure Hands", category: "general" },
  { id: "swarming", name: "Swarming", category: "trait" },
  { id: "tackle", name: "Tackle", category: "general", translations: [{ id: "es", translation: "Placar" }] },
  { id: "take-root", name: "Take Root", category: "trait", translations: [{ id: "es", translation: "Echar raíces" }] },
  { id: "taunt", name: "Taunt", category: "general" },
  { id: "tentacles", name: "Tentacles", category: "mutation" },
  { id: "thick-skull", name: "Thick Skull", category: "strength", translations: [{ id: "es", translation: "Cabeza dura" }] },
  { id: "throw-team-mate", name: "Throw Team-mate", category: "trait", translations: [{ id: "es", translation: "Lanzar compañero" }] },
  { id: "timmm-ber", name: "Timmm-ber!", category: "trait", translations: [{ id: "es", translation: "¡Tronco va!" }] },
  { id: "titchy", name: "Titchy", category: "trait", translations: [{ id: "es", translation: "Canijo" }] },
  { id: "trickster", name: "Trickster", category: "trait", translations: [{ id: "es", translation: "Embustero" }] },
  { id: "troll-hatred", name: "Troll Hatred", category: "trait" },
  { id: "unchannelled-fury", name: "Unchannelled Fury", category: "trait", translations: [{ id: "es", translation: "Ira descontrolada" }] },
  { id: "wrestle", name: "Wrestle", category: "general", translations: [{ id: "es", translation: "Forcejear" }] },
] as const satisfies readonly RawSkillDef[];

export type SkillId = (typeof SKILL_DEFS)[number]["id"];

export const SKILLS: SkillCatalogEntry[] = SKILL_DEFS.map((def) => createSkill(def));

const skillsById = new Map<string, SkillCatalogEntry>(SKILLS.map((skill) => [skill.id, skill]));

function normalizeSkillName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

const skillsByName = new Map<string, SkillCatalogEntry>();

for (const skill of SKILLS) {
  skillsByName.set(normalizeSkillName(skill.name), skill);
  for (const translation of skill.translations) {
    skillsByName.set(normalizeSkillName(translation.translation), skill);
  }
}

export function getSkillById(id: string): SkillCatalogEntry | undefined {
  return skillsById.get(id);
}

export function getSkillByName(name: string): SkillCatalogEntry | undefined {
  return skillsByName.get(normalizeSkillName(name));
}