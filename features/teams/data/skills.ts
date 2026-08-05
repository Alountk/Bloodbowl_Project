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
  translations: SkillTranslation[];
  description: string;
  descriptions: SkillDescriptionTranslation[];
}

const TODO_DESCRIPTION = "TODO: Official BB2025 rules text is still pending.";

function createSkill(params: {
  id: string;
  name: string;
  translations?: SkillTranslation[];
}): SkillCatalogEntry {
  const translations = params.translations ?? [];

  return {
    id: params.id,
    name: params.name,
    translations,
    description: `${TODO_DESCRIPTION} (${params.name})`,
    descriptions: translations.map((translation) => ({
      id: translation.id,
      description: `${TODO_DESCRIPTION} (${translation.translation})`,
    })),
  };
}

export const SKILLS: SkillCatalogEntry[] = [
  createSkill({ id: "always-hungry", name: "Always Hungry" }),
  createSkill({ id: "animal-savagery", name: "Animal Savagery" }),
  createSkill({ id: "animosity-all", name: "Animosity (all)" }),
  createSkill({ id: "animosity-goblin", name: "Animosity (Goblin)" }),
  createSkill({ id: "arm-bar", name: "Arm Bar", translations: [{ id: "es", translation: "Llave de brazo" }] }),
  createSkill({ id: "ball-and-chain", name: "Ball & Chain" }),
  createSkill({ id: "block", name: "Block" }),
  createSkill({ id: "blood-lust-2-plus", name: "Blood Lust (2+)" }),
  createSkill({ id: "blood-lust-3-plus", name: "Blood Lust (3+)" }),
  createSkill({ id: "bombardier", name: "Bombardier" }),
  createSkill({ id: "brawler", name: "Brawler", translations: [{ id: "es", translation: "Luchador" }] }),
  createSkill({ id: "break-tackle", name: "Break Tackle" }),
  createSkill({ id: "bribery-and-corruption", name: "Bribery & Corruption" }),
  createSkill({ id: "catch", name: "Catch" }),
  createSkill({ id: "chainsaw", name: "Chainsaw" }),
  createSkill({ id: "claws", name: "Claws" }),
  createSkill({ id: "dauntless", name: "Dauntless" }),
  createSkill({ id: "decay", name: "Decay" }),
  createSkill({ id: "defensive", name: "Defensive", translations: [{ id: "es", translation: "Defensa" }] }),
  createSkill({ id: "dirty-player-plus-1", name: "Dirty Player (+1)" }),
  createSkill({ id: "disturbing-presence", name: "Disturbing Presence", translations: [{ id: "es", translation: "Presencia perturbadora" }] }),
  createSkill({ id: "dodge", name: "Dodge", translations: [{ id: "es", translation: "Esquivar" }] }),
  createSkill({ id: "drunkard", name: "Drunkard" }),
  createSkill({ id: "dump-off", name: "Dump-off", translations: [{ id: "es", translation: "Dejada" }] }),
  createSkill({ id: "fend", name: "Fend" }),
  createSkill({ id: "fire-breathing", name: "Fire Breathing", translations: [{ id: "es", translation: "Exhalar fuego" }] }),
  createSkill({ id: "foul-appearance", name: "Foul Appearance" }),
  createSkill({ id: "frenzy", name: "Frenzy", translations: [{ id: "es", translation: "Furia" }, { id: "es-ocr", translation: "Furia asesina" }] }),
  createSkill({ id: "grab", name: "Grab" }),
  createSkill({ id: "hit-and-run", name: "Hit and Run" }),
  createSkill({ id: "horns", name: "Horns", translations: [{ id: "es", translation: "Cuernos" }] }),
  createSkill({ id: "hypnotic-gaze", name: "Hypnotic Gaze" }),
  createSkill({ id: "iron-hard-skin", name: "Iron Hard Skin", translations: [{ id: "es", translation: "Piel férrea" }] }),
  createSkill({ id: "juggernaut", name: "Juggernaut" }),
  createSkill({ id: "jump-up", name: "Jump Up", translations: [{ id: "es", translation: "En pie de un salto" }] }),
  createSkill({ id: "kick", name: "Kick", translations: [{ id: "es", translation: "Patada de despeje" }] }),
  createSkill({ id: "kick-team-mate", name: "Kick Team-mate", translations: [{ id: "es", translation: "Chutar compañero" }] }),
  createSkill({ id: "leap", name: "Leap" }),
  createSkill({ id: "loner-3-plus", name: "Loner (3+)" }),
  createSkill({ id: "loner-4-plus", name: "Loner (4+)", translations: [{ id: "es", translation: "Solitario (4+)" }] }),
  createSkill({ id: "low-blow", name: "Low Blow" }),
  createSkill({ id: "mighty-blow-plus-1", name: "Mighty Blow (+1)", translations: [{ id: "es", translation: "Golpe mortífero" }] }),
  createSkill({ id: "nerves-of-steel", name: "Nerves of Steel" }),
  createSkill({ id: "no-hands", name: "No Hands" }),
  createSkill({ id: "nurgling-infestation", name: "Nurgling Infestation" }),
  createSkill({ id: "on-the-ball", name: "On the Ball" }),
  createSkill({ id: "pass", name: "Pass" }),
  createSkill({ id: "pogo-stick", name: "Pogo Stick" }),
  createSkill({ id: "prehensile-tail", name: "Prehensile Tail" }),
  createSkill({ id: "pro", name: "Pro" }),
  createSkill({ id: "projectile-vomit", name: "Projectile Vomit" }),
  createSkill({ id: "really-stupid", name: "Really Stupid", translations: [{ id: "es", translation: "Estúpido" }] }),
  createSkill({ id: "regeneration", name: "Regeneration" }),
  createSkill({ id: "right-stuff", name: "Right Stuff", translations: [{ id: "es", translation: "Humanoide bala" }] }),
  createSkill({ id: "running-pass", name: "Running Pass", translations: [{ id: "es", translation: "Pase precipitado" }] }),
  createSkill({ id: "runt-punter", name: "Runt Punter", translations: [{ id: "es", translation: "RP" }] }),
  createSkill({ id: "safe-pair-of-hands", name: "Safe Pair of Hands", translations: [{ id: "es", translation: "El balón es mío" }] }),
  createSkill({ id: "safe-pass", name: "Safe Pass" }),
  createSkill({ id: "secret-weapon", name: "Secret Weapon" }),
  createSkill({ id: "shadowing", name: "Shadowing", translations: [{ id: "es", translation: "Perseguir" }] }),
  createSkill({ id: "shakey", name: "Shakey", translations: [{ id: "es", translation: "Tembloroso" }] }),
  createSkill({ id: "side-step", name: "Side Step", translations: [{ id: "en-alt", translation: "Sidestep" }, { id: "es", translation: "Echarse a un lado" }] }),
  createSkill({ id: "slippery", name: "Slippery", translations: [{ id: "es", translation: "Escurridizo" }] }),
  createSkill({ id: "sneaky-git", name: "Sneaky Git" }),
  createSkill({ id: "sprint", name: "Sprint", translations: [{ id: "es", translation: "Esprintar" }] }),
  createSkill({ id: "stab", name: "Stab", translations: [{ id: "es", translation: "Apuñalar" }] }),
  createSkill({ id: "stand-firm", name: "Stand Firm", translations: [{ id: "es", translation: "Mantenerse firme" }] }),
  createSkill({ id: "strip-ball", name: "Strip Ball" }),
  createSkill({ id: "strong-arm", name: "Strong Arm", translations: [{ id: "es", translation: "Brazo fuerte" }] }),
  createSkill({ id: "stunty", name: "Stunty" }),
  createSkill({ id: "sure-feet", name: "Sure Feet", translations: [{ id: "es", translation: "Pies firmes" }] }),
  createSkill({ id: "sure-hands", name: "Sure Hands" }),
  createSkill({ id: "swarming", name: "Swarming" }),
  createSkill({ id: "tackle", name: "Tackle", translations: [{ id: "es", translation: "Placar" }] }),
  createSkill({ id: "take-root", name: "Take Root", translations: [{ id: "es", translation: "Echar raíces" }] }),
  createSkill({ id: "taunt", name: "Taunt" }),
  createSkill({ id: "tentacles", name: "Tentacles" }),
  createSkill({ id: "thick-skull", name: "Thick Skull", translations: [{ id: "es", translation: "Cabeza dura" }] }),
  createSkill({ id: "throw-team-mate", name: "Throw Team-mate", translations: [{ id: "es", translation: "Lanzar compañero" }] }),
  createSkill({ id: "timmm-ber", name: "Timmm-ber!", translations: [{ id: "es", translation: "¡Tronco va!" }] }),
  createSkill({ id: "titchy", name: "Titchy", translations: [{ id: "es", translation: "Canijo" }] }),
  createSkill({ id: "trickster", name: "Trickster", translations: [{ id: "es", translation: "Embustero" }] }),
  createSkill({ id: "troll-hatred", name: "Troll Hatred" }),
  createSkill({ id: "unchannelled-fury", name: "Unchannelled Fury", translations: [{ id: "es", translation: "Ira descontrolada" }] }),
  createSkill({ id: "wrestle", name: "Wrestle", translations: [{ id: "es", translation: "Forcejear" }] }),
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
