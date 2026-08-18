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
  /** English rules description; defaults to the pending-review placeholder. */
  description?: string;
  /** Localized rules descriptions (Spanish OCR, cleaned), keyed by locale id. */
  descriptions?: readonly SkillDescriptionTranslation[];
  /** Élite skill (rulebook $ symbol); default false. */
  elite?: boolean;
  /** Mandatory skill (rulebook * marker); default false. */
  mandatory?: boolean;
}

function createSkill(def: RawSkillDef): SkillCatalogEntry {
  const translations: SkillTranslation[] = def.translations
    ? def.translations.map((translation) => ({ ...translation }))
    : [];
  const descriptions = new Map(
    (def.descriptions ?? []).map((entry) => [entry.id, entry.description]),
  );

  return {
    id: def.id as SkillId,
    name: def.name,
    category: def.category,
    translations,
    description: def.description ?? `${TODO_DESCRIPTION} (${def.name})`,
    descriptions: translations.map((translation) => ({
      id: translation.id,
      description:
        descriptions.get(translation.id) ??
        `${TODO_DESCRIPTION} (${translation.translation})`,
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
  { id: "block", name: "Block", category: "general", translations: [{ id: "es", translation: "Placar" }], elite: true },
  { id: "blood-lust-2-plus", name: "Blood Lust (2+)", category: "trait" },
  { id: "blood-lust-3-plus", name: "Blood Lust (3+)", category: "trait" },
  { id: "bombardier", name: "Bombardier", category: "trait" },
  {
    id: "bone-head",
    name: "Bone Head",
    category: "trait",
    translations: [{ id: "es", translation: "Estúpido" }],
    description:
      "Whenever this player is activated, just after declaring their Action, roll a D6. On a 2+, this player may perform the declared Action as normal. On a 1, this player instead becomes Distracted.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador sea activado, justo tras haber declarado su acción, tira 1D6. Con 2+, puede realizar la acción declarada de manera normal. Con un 1, en cambio, este jugador queda Distraído.",
      },
    ],
    mandatory: true,
  },
  { id: "brawler", name: "Brawler", category: "strength", translations: [{ id: "es", translation: "Luchador" }] },
  { id: "break-tackle", name: "Break Tackle", category: "strength" },
  { id: "bribery-and-corruption", name: "Bribery & Corruption", category: "trait" },
  { id: "catch", name: "Catch", category: "agility" },
  { id: "chainsaw", name: "Chainsaw", category: "trait" },
  {
    id: "cloud-burster",
    name: "Cloud Burster",
    category: "passing",
    translations: [{ id: "es", translation: "Partenubes" }],
    description:
      "When this player performs a Pass Action, opposing players may not attempt to intercept the ball.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador realiza una acción de Pase, los jugadores rivales no pueden intentar interceptar el balón.",
      },
    ],
  },
  { id: "claws", name: "Claws", category: "mutation" },
  { id: "dauntless", name: "Dauntless", category: "general" },
  { id: "decay", name: "Decay", category: "trait" },
  { id: "defensive", name: "Defensive", category: "agility" },
  { id: "dirty-player-plus-1", name: "Dirty Player (+1)", category: "devious" },
  { id: "disturbing-presence", name: "Disturbing Presence", category: "mutation", translations: [{ id: "es", translation: "Presencia perturbadora" }] },
  {
    id: "diving-catch",
    name: "Diving Catch",
    category: "agility",
    translations: [{ id: "es", translation: "Recepción heroica" }],
    description:
      "This player may attempt to catch the ball if it lands in a square of their Tackle Zone as a result of a Pass, Kick-off or Throw-in. This skill does not allow them to attempt to catch the ball if it bounces into a square of their Tackle Zone. Additionally, this player may apply a +1 modifier to their Agility Test when attempting to catch the ball as part of a Pass Action if they are in the target square.",
    descriptions: [
      {
        id: "es",
        description:
          "Este jugador puede intentar atrapar el balón si cae en una casilla de su zona de defensa debido a un pase, una patada inicial o una devolución. Esta habilidad no le permite intentar atrapar el balón si este rebota hasta una casilla de su zona de defensa. Además, este jugador puede aplicar un modificador de +1 a su chequeo de Agilidad al intentar atrapar el balón como parte de una acción de Pase si está en la casilla objetivo del mismo.",
      },
    ],
  },
  {
    id: "diving-tackle",
    name: "Diving Tackle",
    category: "agility",
    translations: [{ id: "es", translation: "Placaje heroico" }],
    description:
      "When an opposing player attempts to leave this player's Tackle Zone by Dodging, Leaping or Jumping, after their Agility Test is rolled and any modifiers and re-rolls have been applied, this player may use this skill. Immediately apply a -2 modifier to the opposing player's Agility Test and place this player Prone in the square the opposing player vacated. If a player attempts to leave the Tackle Zone of several players with this skill at the same time, only one of them may use it.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando un jugador rival intente salir de la zona de defensa de este jugador esquivando, saltando o brincando, tras hacer su chequeo de Agilidad y aplicarse todos los modificadores y repeticiones, este jugador puede usar esta habilidad. Se aplica de inmediato un modificador de -2 al chequeo de Agilidad del jugador rival y este jugador se coloca Tumbado boca arriba en la casilla que ha dejado vacante el rival. Si un jugador intenta salir de la zona de defensa de varios jugadores con esta habilidad a la vez, solo uno de ellos podrá utilizarla.",
      },
    ],
  },
  { id: "dodge", name: "Dodge", category: "agility", translations: [{ id: "es", translation: "Esquivar" }], elite: true },
  { id: "drunkard", name: "Drunkard", category: "trait" },
  { id: "dump-off", name: "Dump-off", category: "passing", translations: [{ id: "es", translation: "Pase precipitado" }] },
  { id: "fend", name: "Fend", category: "general" },
  { id: "fire-breathing", name: "Fire Breathing", category: "trait", translations: [{ id: "es", translation: "Exhalar fuego" }] },
  { id: "foul-appearance", name: "Foul Appearance", category: "mutation", mandatory: true },
  {
    id: "fumblerooski",
    name: "Fumblerooski",
    category: "devious",
    translations: [{ id: "es", translation: "Dejada" }],
    description:
      "When this player is in possession of the ball and performs a Move Action, they may choose to \"leave the ball\", placing it in any square they vacate during that Move Action. This does not cause a Turnover.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador sea el portador del balón y realice una acción de Movimiento, puede elegir \"dejar el balón\", colocándolo en cualquier casilla que abandone durante dicha acción de Movimiento. Esto no provoca un cambio de turno.",
      },
    ],
  },
  { id: "frenzy", name: "Frenzy", category: "general", translations: [{ id: "es", translation: "Furia" }, { id: "es-ocr", translation: "Furia asesina" }], mandatory: true },
  {
    id: "give-and-go",
    name: "Give and Go",
    category: "passing",
    translations: [{ id: "es", translation: "Pasar y seguir" }],
    description:
      "When this player performs a Pass Action that is a Quick Pass, or performs a Hand-off Action, so long as no Turnover is caused, their activation does not end once the Pass or Hand-off is resolved. Instead, this player may continue their Move Action using any movement they have remaining.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador realice una acción de Pase que sea un Pase rápido, o una acción de Entregar el balón, y no se produzca un cambio de turno, su activación no terminará tras resolver el pase o la entrega de balón. En su lugar, este jugador puede continuar su acción de Movimiento usando el movimiento que aún le quede.",
      },
    ],
  },
  { id: "grab", name: "Grab", category: "strength" },
  {
    id: "guard",
    name: "Guard",
    category: "strength",
    translations: [{ id: "es", translation: "Defensa" }],
    description:
      "This player can always provide both Offensive and Defensive Assists in Block actions, regardless of how many opposing players are Marking them.",
    descriptions: [
      {
        id: "es",
        description:
          "Este jugador siempre puede ofrecer apoyos tanto ofensivos como defensivos en las acciones de Placaje, sin importar por cuántos jugadores rivales esté siendo Marcado.",
      },
    ],
    elite: true,
  },
  {
    id: "hail-mary-pass",
    name: "Hail Mary Pass",
    category: "passing",
    translations: [{ id: "es", translation: "Pase a lo loco" }],
    description:
      "When this player performs a Pass Action or a Throw Bomb Special Action, they may declare any square on the pitch as the target square rather than using the Range Ruler. Make a Passing Ability Test as normal, treating the throw as a Long Bomb and treating any result of an Accurate Pass as an Inaccurate Pass. A Hail Mary Pass cannot be Intercepted.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador realice una acción de Pase o una acción especial de Lanzar una bomba, puede declarar cualquier casilla del campo como casilla objetivo en lugar de usar la regla de pases. Haz un chequeo de Pase de forma normal, tratando el lanzamiento como una Bomba larga y cualquier resultado de pase preciso como un pase impreciso. Un Pase a lo loco no puede interceptarse.",
      },
    ],
  },
  { id: "hit-and-run", name: "Hit and Run", category: "agility" },
  { id: "horns", name: "Horns", category: "mutation", translations: [{ id: "es", translation: "Cuernos" }] },
  { id: "hypnotic-gaze", name: "Hypnotic Gaze", category: "trait" },
  { id: "iron-hard-skin", name: "Iron Hard Skin", category: "mutation", translations: [{ id: "es", translation: "Piel férrea" }] },
  {
    id: "insignificant",
    name: "Insignificant",
    category: "trait",
    translations: [{ id: "es", translation: "Insignificante" }],
    description:
      "When creating a Team Draft List, you may not include more players with this trait than players without this trait.",
    descriptions: [
      {
        id: "es",
        description:
          "Al crear una Hoja de plantilla, no puedes incluir más jugadores con este rasgo que jugadores sin este rasgo.",
      },
    ],
    mandatory: true,
  },
  { id: "juggernaut", name: "Juggernaut", category: "strength" },
  { id: "jump-up", name: "Jump Up", category: "agility", translations: [{ id: "es", translation: "En pie de un salto" }] },
  { id: "kick", name: "Kick", category: "general", translations: [{ id: "es", translation: "Patada" }] },
  { id: "kick-team-mate", name: "Kick Team-mate", category: "trait", translations: [{ id: "es", translation: "Chutar compañero" }] },
  { id: "leap", name: "Leap", category: "agility" },
  { id: "loner-3-plus", name: "Loner (3+)", category: "trait" },
  { id: "loner-4-plus", name: "Loner (4+)", category: "trait", translations: [{ id: "es", translation: "Solitario (4+)" }] },
  { id: "low-blow", name: "Low Blow", category: "trait" },
  { id: "mighty-blow-plus-1", name: "Mighty Blow (+1)", category: "strength", translations: [{ id: "es", translation: "Golpe mortífero" }], elite: true },
  {
    id: "my-ball",
    name: "My Ball",
    category: "trait",
    translations: [{ id: "es", translation: "El balón es mío" }],
    description:
      "When this player is in possession of the ball, they may not willingly give it up. They therefore cannot declare Pass Actions or Hand-off Actions, nor use Skills or Traits that would make them relinquish possession of the ball. The only ways for this player to lose the ball are being Knocked Down, Placed Prone or Stunned, or by the effect of a Skill, Trait or special rule of an opposing player.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador es el portador del balón, no puede dejar de serlo voluntariamente. Por tanto, no puede declarar acciones de Pase o de Entregar el balón, ni usar habilidades o rasgos que le hagan renunciar a ser el portador del balón. Las únicas formas de que este jugador suelte el balón son que sea Derribado, colocado Tumbado o Aturdido, o por el efecto de una habilidad, rasgo o regla especial de un jugador rival.",
      },
    ],
    mandatory: true,
  },
  { id: "nerves-of-steel", name: "Nerves of Steel", category: "passing" },
  { id: "no-hands", name: "No Hands", category: "trait" },
  { id: "nurgling-infestation", name: "Nurgling Infestation", category: "trait" },
  { id: "on-the-ball", name: "On the Ball", category: "passing" },
  { id: "pass", name: "Pass", category: "passing" },
  {
    id: "pick-me-up",
    name: "Pick-me-up",
    category: "trait",
    translations: [{ id: "es", translation: "Levantar compañero" }],
    description:
      "At the end of each of the opposing team's Turns, roll a D6 for each Prone team-mate within 3 squares of a Standing player of your team with this trait. On a 5+, the Prone player may immediately stand up. If a player with this trait stands up as a result of a team-mate using this trait, they may not in turn use this trait during that same Turn.",
    descriptions: [
      {
        id: "es",
        description:
          "Al final de cada turno del equipo rival, tira 1D6 por cada jugador de tu equipo Tumbado boca arriba a 3 casillas o menos de algún jugador En pie de tu equipo con este rasgo. Con 5+, el jugador Tumbado boca arriba puede levantarse de inmediato. Si un jugador con este rasgo se levanta debido al uso de este rasgo por parte de un compañero, no puede a su vez usar este rasgo durante ese mismo turno.",
      },
    ],
  },
  {
    id: "plague-ridden",
    name: "Plague Ridden",
    category: "trait",
    translations: [{ id: "es", translation: "Infectado" }],
    description:
      "Once per game, when this player causes an opposing player to suffer a Casualty as a result of a Block Action, and the opposing player suffers a Dead result on their Casualty Roll that is not saved by an Apothecary, you may immediately add a new Lineman from your Team Roster to your Reserves Box. This may cause your team to have more than 16 players for the remainder of the game. During the Post-game Sequence, this new player may be hired permanently like any Journeyman. This trait cannot be used against Big Guy players, or against players with the Decay, Slippery or Regeneration traits.",
    descriptions: [
      {
        id: "es",
        description:
          "Una vez por partido, cuando este jugador cause una Lesión a un jugador rival debido a una acción de Placaje y, en la tirada de Lesiones, dicho jugador rival sufra un resultado de Muerte que no sea salvado por un Apotecario, puedes añadir de inmediato un nuevo jugador Línea de tu Lista de equipo a tu zona de Reservas. Esto puede hacer que tu equipo tenga más de 16 jugadores por el resto del partido. Durante la secuencia posterior al partido, este nuevo jugador puede ser fichado de forma permanente como si fuera un Sustituto. Este rasgo no puede utilizarse contra jugadores Grandullones, ni contra jugadores que tengan los rasgos Descomposición, Escurridizo o Regeneración.",
      },
    ],
  },
  { id: "pogo-stick", name: "Pogo Stick", category: "trait" },
  { id: "prehensile-tail", name: "Prehensile Tail", category: "mutation" },
  { id: "pro", name: "Pro", category: "general" },
  { id: "projectile-vomit", name: "Projectile Vomit", category: "trait" },
  {
    id: "punt",
    name: "Punt",
    category: "passing",
    translations: [{ id: "es", translation: "Patada de despeje" }],
    description:
      "This player may declare a Punt Special Action; only one player may declare a Punt Special Action each Turn. When a player declares this Special Action, they are first allowed to make a Move Action, though they cannot continue moving after the Punt Special Action has been resolved. If, after their Move Action, this player is in possession of the ball, they may Punt it. Position the Throw-in Template over them so it faces any End Zone or Sideline. Roll a D6 to determine the direction the ball is kicked, and then a second D6 to determine how many squares it travels in that direction. If this player has the Kick skill, they may re-roll either or both of these dice, though they must decide whether or not to re-roll the direction before rolling for the distance. If the ball lands in a square containing a player, that player must attempt to catch it; otherwise it will bounce. Performing a Punt Special Action does not cause a Turnover if the ball comes to rest on the ground; a Turnover is caused instead if the ball ends in the possession of an opposing player or goes into the crowd.",
    descriptions: [
      {
        id: "es",
        description:
          "Este jugador puede declarar una acción especial de Patada de despeje; solo un jugador puede declarar una acción especial de Patada de despeje por turno. Cuando un jugador declara esta acción especial, puede realizar antes una acción de Movimiento, pero no podrá seguir moviéndose tras resolver la Patada de despeje. Si, tras su acción de Movimiento, este jugador es el portador del balón, puede darle una Patada de despeje. Coloca la plantilla de devolución sobre él, encarada hacia cualquier zona de anotación o línea de banda. Tira 1D6 para determinar la dirección en la que se chuta el balón, y luego otro 1D6 para determinar cuántas casillas se desplaza en esa dirección. Si este jugador tiene la habilidad Patada, puede repetir una o dos de estas tiradas, pero debe decidir si repetir la dirección o no antes de tirar por la distancia desplazada. Si el balón aterriza en una casilla ocupada por un jugador, dicho jugador debe intentar atraparlo; de lo contrario, el balón rebota. Al realizar una acción especial de Patada de despeje no se produce un cambio de turno si el balón acaba en el suelo; en cambio, sí se produce un cambio de turno si el balón acaba en posesión de un jugador rival o si cae en el público.",
      },
    ],
  },
  { id: "really-stupid", name: "Really Stupid", category: "trait", translations: [{ id: "es", translation: "Estúpido" }] },
  { id: "regeneration", name: "Regeneration", category: "trait" },
  { id: "right-stuff", name: "Right Stuff", category: "trait", translations: [{ id: "es", translation: "Humanoide bala" }] },
  { id: "running-pass", name: "Running Pass", category: "passing" },
  { id: "runt-punter", name: "Runt Punter", category: "trait", translations: [{ id: "es", translation: "RP" }] },
  { id: "safe-pair-of-hands", name: "Safe Pair of Hands", category: "agility", translations: [{ id: "es", translation: "Manos seguras" }] },
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
  {
    id: "steady-footing",
    name: "Steady Footing",
    category: "general",
    translations: [{ id: "es", translation: "Equilibrio firme" }],
    description:
      "Whenever this player would be Knocked Down or Fall Over for any reason, roll a D6; on a result of 6, this player is not Knocked Down and does not Fall Over. If this happens during their activation, this player may continue their activation as normal and no Turnover is caused.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador vaya a ser Derribado o a Caerse por cualquier motivo, tira 1D6; con un resultado de 6, este jugador no es Derribado y no se Cae. Si esto ocurre durante su activación, este jugador puede seguir adelante con su activación de forma normal y no se produce un cambio de turno.",
      },
    ],
  },
  { id: "strip-ball", name: "Strip Ball", category: "general" },
  { id: "strong-arm", name: "Strong Arm", category: "strength", translations: [{ id: "es", translation: "Brazo fuerte" }] },
  { id: "stunty", name: "Stunty", category: "trait" },
  { id: "sure-feet", name: "Sure Feet", category: "agility", translations: [{ id: "es", translation: "Pies firmes" }] },
  { id: "sure-hands", name: "Sure Hands", category: "general" },
  { id: "swarming", name: "Swarming", category: "trait" },
  {
    id: "swoop",
    name: "Swoop",
    category: "trait",
    translations: [{ id: "es", translation: "Planear" }],
    description:
      "When this player is thrown as part of a Throw Team-mate Action, they may choose not to Scatter as normal before landing. If they do, position the Throw-in Template over this player so it faces any End Zone or Sideline. Roll a D6 to determine the direction they will move, and then a second D6 to determine how many squares they will Swoop in that direction. Additionally, if this player chooses not to Scatter as normal, they may re-roll the Agility Test when attempting to land.",
    descriptions: [
      {
        id: "es",
        description:
          "Cuando este jugador sea lanzado mediante la acción de Lanzar compañero, puede elegir no escorarse como es habitual antes de aterrizar. En tal caso, coloca la plantilla de devolución sobre este jugador, encarada hacia cualquier zona de anotación o línea de banda. Tira 1D6 para determinar en qué dirección se moverá, y luego un segundo 1D6 para determinar cuántas casillas planeará en esa dirección. Además, si este jugador decide no escorarse como es habitual, puede repetir el chequeo de Agilidad para intentar aterrizar.",
      },
    ],
  },
  { id: "tackle", name: "Tackle", category: "general", translations: [{ id: "es", translation: "Placaje defensivo" }] },
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