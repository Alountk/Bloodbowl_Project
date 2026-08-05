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
  id: string;
  name: string;
  category: SkillCategory;
  translations: SkillTranslation[];
  description: string;
  descriptions: SkillDescriptionTranslation[];
}

const TODO_DESCRIPTION = "TODO: Official BB2025 rules text is still pending.";

function createSkill(params: {
  id: string;
  name: string;
  category: SkillCategory;
  translations?: SkillTranslation[];
}): SkillCatalogEntry {
  const translations = params.translations ?? [];

  return {
    id: params.id,
    name: params.name,
    category: params.category,
    translations,
    description: `${TODO_DESCRIPTION} (${params.name})`,
    descriptions: translations.map((translation) => ({
      id: translation.id,
      description: `${TODO_DESCRIPTION} (${translation.translation})`,
    })),
  };
}

export const SKILLS: SkillCatalogEntry[] = [
  createSkill({ id: "always-hungry", name: "Always Hungry", category: "trait" }),
  createSkill({ id: "animal-savagery", name: "Animal Savagery", category: "trait" }),
  createSkill({ id: "animosity-all", name: "Animosity (all)", category: "trait" }),
  createSkill({ id: "animosity-goblin", name: "Animosity (Goblin)", category: "trait" }),
  createSkill({ id: "arm-bar", name: "Arm Bar", category: "strength", translations: [{ id: "es", translation: "Llave de brazo" }] }),
  createSkill({ id: "ball-and-chain", name: "Ball & Chain", category: "trait" }),
  createSkill({ id: "block", name: "Block", category: "general" }),
  createSkill({ id: "blood-lust-2-plus", name: "Blood Lust (2+)", category: "trait" }),
  createSkill({ id: "blood-lust-3-plus", name: "Blood Lust (3+)", category: "trait" }),
  createSkill({ id: "bombardier", name: "Bombardier", category: "trait" }),
  createSkill({ id: "brawler", name: "Brawler", category: "strength", translations: [{ id: "es", translation: "Luchador" }] }),
  createSkill({ id: "break-tackle", name: "Break Tackle", category: "strength" }),
  createSkill({ id: "bribery-and-corruption", name: "Bribery & Corruption", category: "trait" }),
  createSkill({ id: "catch", name: "Catch", category: "agility" }),
  createSkill({ id: "chainsaw", name: "Chainsaw", category: "trait" }),
  createSkill({ id: "claws", name: "Claws", category: "mutation" }),
  createSkill({ id: "dauntless", name: "Dauntless", category: "general" }),
  createSkill({ id: "decay", name: "Decay", category: "trait" }),
  createSkill({ id: "defensive", name: "Defensive", category: "agility", translations: [{ id: "es", translation: "Defensa" }] }),
  createSkill({ id: "dirty-player-plus-1", name: "Dirty Player (+1)", category: "devious" }),
  createSkill({ id: "disturbing-presence", name: "Disturbing Presence", category: "mutation", translations: [{ id: "es", translation: "Presencia perturbadora" }] }),
  createSkill({ id: "dodge", name: "Dodge", category: "agility", translations: [{ id: "es", translation: "Esquivar" }] }),
  createSkill({ id: "drunkard", name: "Drunkard", category: "trait" }),
  createSkill({ id: "dump-off", name: "Dump-off", category: "passing", translations: [{ id: "es", translation: "Dejada" }] }),
  createSkill({ id: "fend", name: "Fend", category: "general" }),
  createSkill({ id: "fire-breathing", name: "Fire Breathing", category: "trait", translations: [{ id: "es", translation: "Exhalar fuego" }] }),
  createSkill({ id: "foul-appearance", name: "Foul Appearance", category: "mutation" }),
  createSkill({ id: "frenzy", name: "Frenzy", category: "general", translations: [{ id: "es", translation: "Furia" }, { id: "es-ocr", translation: "Furia asesina" }] }),
  createSkill({ id: "grab", name: "Grab", category: "strength" }),
  createSkill({ id: "hit-and-run", name: "Hit and Run", category: "agility" }),
  createSkill({ id: "horns", name: "Horns", category: "mutation", translations: [{ id: "es", translation: "Cuernos" }] }),
  createSkill({ id: "hypnotic-gaze", name: "Hypnotic Gaze", category: "trait" }),
  createSkill({ id: "iron-hard-skin", name: "Iron Hard Skin", category: "mutation", translations: [{ id: "es", translation: "Piel férrea" }] }),
  createSkill({ id: "juggernaut", name: "Juggernaut", category: "strength" }),
  createSkill({ id: "jump-up", name: "Jump Up", category: "agility", translations: [{ id: "es", translation: "En pie de un salto" }] }),
  createSkill({ id: "kick", name: "Kick", category: "general", translations: [{ id: "es", translation: "Patada de despeje" }] }),
  createSkill({ id: "kick-team-mate", name: "Kick Team-mate", category: "trait", translations: [{ id: "es", translation: "Chutar compañero" }] }),
  createSkill({ id: "leap", name: "Leap", category: "agility" }),
  createSkill({ id: "loner-3-plus", name: "Loner (3+)", category: "trait" }),
  createSkill({ id: "loner-4-plus", name: "Loner (4+)", category: "trait", translations: [{ id: "es", translation: "Solitario (4+)" }] }),
  createSkill({ id: "low-blow", name: "Low Blow", category: "trait" }),
  createSkill({ id: "mighty-blow-plus-1", name: "Mighty Blow (+1)", category: "strength", translations: [{ id: "es", translation: "Golpe mortífero" }] }),
  createSkill({ id: "nerves-of-steel", name: "Nerves of Steel", category: "passing" }),
  createSkill({ id: "no-hands", name: "No Hands", category: "trait" }),
  createSkill({ id: "nurgling-infestation", name: "Nurgling Infestation", category: "trait" }),
  createSkill({ id: "on-the-ball", name: "On the Ball", category: "passing" }),
  createSkill({ id: "pass", name: "Pass", category: "passing" }),
  createSkill({ id: "pogo-stick", name: "Pogo Stick", category: "trait" }),
  createSkill({ id: "prehensile-tail", name: "Prehensile Tail", category: "mutation" }),
  createSkill({ id: "pro", name: "Pro", category: "general" }),
  createSkill({ id: "projectile-vomit", name: "Projectile Vomit", category: "trait" }),
  createSkill({ id: "really-stupid", name: "Really Stupid", category: "trait", translations: [{ id: "es", translation: "Estúpido" }] }),
  createSkill({ id: "regeneration", name: "Regeneration", category: "trait" }),
  createSkill({ id: "right-stuff", name: "Right Stuff", category: "trait", translations: [{ id: "es", translation: "Humanoide bala" }] }),
  createSkill({ id: "running-pass", name: "Running Pass", category: "passing", translations: [{ id: "es", translation: "Pase precipitado" }] }),
  createSkill({ id: "runt-punter", name: "Runt Punter", category: "trait", translations: [{ id: "es", translation: "RP" }] }),
  createSkill({ id: "safe-pair-of-hands", name: "Safe Pair of Hands", category: "agility", translations: [{ id: "es", translation: "El balón es mío" }] }),
  createSkill({ id: "safe-pass", name: "Safe Pass", category: "passing" }),
  createSkill({ id: "secret-weapon", name: "Secret Weapon", category: "trait" }),
  createSkill({ id: "shadowing", name: "Shadowing", category: "devious", translations: [{ id: "es", translation: "Perseguir" }] }),
  createSkill({ id: "shakey", name: "Shakey", category: "trait", translations: [{ id: "es", translation: "Tembloroso" }] }),
  createSkill({ id: "side-step", name: "Side Step", category: "agility", translations: [{ id: "en-alt", translation: "Sidestep" }, { id: "es", translation: "Echarse a un lado" }] }),
  createSkill({ id: "slippery", name: "Slippery", category: "trait", translations: [{ id: "es", translation: "Escurridizo" }] }),
  createSkill({ id: "sneaky-git", name: "Sneaky Git", category: "devious" }),
  createSkill({ id: "sprint", name: "Sprint", category: "agility", translations: [{ id: "es", translation: "Esprintar" }] }),
  createSkill({ id: "stab", name: "Stab", category: "trait", translations: [{ id: "es", translation: "Apuñalar" }] }),
  createSkill({ id: "stand-firm", name: "Stand Firm", category: "strength", translations: [{ id: "es", translation: "Mantenerse firme" }] }),
  createSkill({ id: "strip-ball", name: "Strip Ball", category: "general" }),
  createSkill({ id: "strong-arm", name: "Strong Arm", category: "strength", translations: [{ id: "es", translation: "Brazo fuerte" }] }),
  createSkill({ id: "stunty", name: "Stunty", category: "trait" }),
  createSkill({ id: "sure-feet", name: "Sure Feet", category: "agility", translations: [{ id: "es", translation: "Pies firmes" }] }),
  createSkill({ id: "sure-hands", name: "Sure Hands", category: "general" }),
  createSkill({ id: "swarming", name: "Swarming", category: "trait" }),
  createSkill({ id: "tackle", name: "Tackle", category: "general", translations: [{ id: "es", translation: "Placar" }] }),
  createSkill({ id: "take-root", name: "Take Root", category: "trait", translations: [{ id: "es", translation: "Echar raíces" }] }),
  createSkill({ id: "taunt", name: "Taunt", category: "general" }),
  createSkill({ id: "tentacles", name: "Tentacles", category: "mutation" }),
  createSkill({ id: "thick-skull", name: "Thick Skull", category: "strength", translations: [{ id: "es", translation: "Cabeza dura" }] }),
  createSkill({ id: "throw-team-mate", name: "Throw Team-mate", category: "trait", translations: [{ id: "es", translation: "Lanzar compañero" }] }),
  createSkill({ id: "timmm-ber", name: "Timmm-ber!", category: "trait", translations: [{ id: "es", translation: "¡Tronco va!" }] }),
  createSkill({ id: "titchy", name: "Titchy", category: "trait", translations: [{ id: "es", translation: "Canijo" }] }),
  createSkill({ id: "trickster", name: "Trickster", category: "trait", translations: [{ id: "es", translation: "Embustero" }] }),
  createSkill({ id: "troll-hatred", name: "Troll Hatred", category: "trait" }),
  createSkill({ id: "unchannelled-fury", name: "Unchannelled Fury", category: "trait", translations: [{ id: "es", translation: "Ira descontrolada" }] }),
  createSkill({ id: "wrestle", name: "Wrestle", category: "general", translations: [{ id: "es", translation: "Forcejear" }] }),
];

export type SkillId = (typeof SKILLS)[number]["id"];

const skillsById = new Map(SKILLS.map((skill) => [skill.id, skill]));

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
