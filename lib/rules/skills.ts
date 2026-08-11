/**
 * BB2025 random skill table — user-validated full 6-column table (bb2025-rules R3,
 * rulebook p.121). The columns map one-to-one to access letters:
 * A=Agilidad, F=Fuerza, G=Generales, M=Mutación, P=Pase, T=Triquiñuelas.
 * Skills marked `*` (Apariencia asquerosa, Furia) are MANDATORY skills, NOT élite.
 */

export type SkillColumn = "A" | "F" | "G" | "M" | "P" | "T";

export const SKILL_COLUMNS: readonly SkillColumn[] = ["A", "F", "G", "M", "P", "T"];

export type SkillBlock = "1-3" | "4-6";
export type SkillRow = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Verbatim 6-column table. `block` is selected by the 1st D6 (1-3 or 4-6),
 * `row` by the 2nd D6 (1-6). Values are the user-validated Spanish names.
 */
export const RANDOM_SKILL_TABLE: Record<SkillBlock, Record<SkillRow, Record<SkillColumn, string>>> = {
  "1-3": {
    1: { A: "Atrapar", F: "Abrirse paso", G: "Agallas", M: "Apariencia asquerosa*", P: "Atento al balón", T: "Agresor discreto" },
    2: { A: "Echarse a un lado", F: "Apartar", G: "Equilibrio firme", M: "Boca monstruosa", P: "Cañonero", T: "Crujir" },
    3: { A: "En pie de un salto", F: "Brazo fuerte", G: "Forcejear", M: "Brazos adicionales", P: "Líder", T: "Dejada" },
    4: { A: "Esprintar", F: "Cabeza dura", G: "Furia*", M: "Cola prensil", P: "Nervios de acero", T: "Falta rápida" },
    5: { A: "Esquivar", F: "Defensa", G: "Manos seguras", M: "Cuernos", P: "Partenubes", T: "Furtivo" },
    6: { A: "Golpe a la carrera", F: "Golpe mortífero", G: "Patada", M: "Dos cabezas", P: "Pasar", T: "Innovador violento" },
  },
  "4-6": {
    1: { A: "Pies firmes", F: "Imparable", G: "Placaje defensivo", M: "Garras", P: "Pasar y seguir", T: "Jugar sucio" },
    2: { A: "Placaje heroico", F: "Llave de brazo", G: "Placar", M: "Mano grande", P: "Pase a lo loco", T: "Meter la bota" },
    3: { A: "Proteger el cuero", F: "Luchador", G: "Profesional", M: "Piel férrea", P: "Pase precipitado", T: "Perseguir" },
    4: { A: "Recepción heroica", F: "Mantenerse firmes", G: "Provocar", M: "Piernas muy largas", P: "Pase seguro", T: "Piquete de ojos" },
    5: { A: "Romper defensas", F: "Ojo de halcón", G: "Robar balón", M: "Presencia perturbadora", P: "Patada de despeje", T: "Saboteador" },
    6: { A: "Saltar", F: "Placaje múltiple", G: "Zafarse", M: "Tentáculos", P: "Precisión", T: "Vuelo letal" },
  },
};

/** Skills carrying the rulebook `*` marker: MANDATORY (must be used), not élite. */
const MANDATORY_MARKED = ["Apariencia asquerosa", "Furia"] as const;

export const MANDATORY_SKILLS: readonly string[] = MANDATORY_MARKED;

export function isMandatorySkill(skill: string): boolean {
  return (MANDATORY_MARKED as readonly string[]).includes(skill);
}

function blockForDie(dieA: number): SkillBlock {
  return dieA <= 3 ? "1-3" : "4-6";
}

/** Looks up the skill at `dieA` (block) and `dieB` (row) for a column. */
export function randomSkill(dieA: number, dieB: number, column: SkillColumn): string {
  return RANDOM_SKILL_TABLE[blockForDie(dieA)][dieB as SkillRow][column];
}

/** Two independent 2D6 rolls (dieA1,dieB1,dieA2,dieB2) → two skill outcomes. */
export function rollTwoSkills(
  column: SkillColumn,
  dice4: [number, number, number, number],
): [string, string] {
  const [dieA1, dieB1, dieA2, dieB2] = dice4;
  return [randomSkill(dieA1, dieB1, column), randomSkill(dieA2, dieB2, column)];
}

/** Highest pending-roll cell index within one column (12 cells: 2 blocks × 6 rows). */
export const MAX_CELL_INDEX = 11;

/** Flattens a (block, row) cell into its 0..11 index within a column. */
function cellIndex(block: SkillBlock, row: SkillRow): number {
  return (block === "4-6" ? 6 : 0) + (row - 1);
}

/**
 * Reverses a cell index (0..11) to the concrete skill name at that cell for a
 * column. `kind` rows: index 0..5 = 1ºD6 1-3, index 6..11 = 1ºD6 4-6.
 */
export function cellIndexToSkill(column: SkillColumn, index: number): string {
  const block: SkillBlock = index >= 6 ? "4-6" : "1-3";
  const row = (index % 6) + 1 as SkillRow;
  return RANDOM_SKILL_TABLE[block][row][column];
}

/**
 * Maps a skill name to its unique 0..11 cell index within a column, or null
 * when the skill does not appear in that column. Within a column every name is
 * unique, so the mapping is injective — used to store two candidate skills in
 * the `PlayerPendingRoll.roll1/roll2` integer columns without a schema change.
 */
export function skillCellIndex(column: SkillColumn, name: string): number | null {
  for (const block of ["1-3", "4-6"] as const) {
    for (const row of [1, 2, 3, 4, 5, 6] as const) {
      if (RANDOM_SKILL_TABLE[block][row][column] === name) {
        return cellIndex(block, row);
      }
    }
  }
  return null;
}

export interface RollOutcome {
  /** Skills the player may pick from, after dedup and dropping owned skills. */
  skills: string[];
  /** True when every rolled outcome is already owned / unusable → re-roll. */
  reroll: boolean;
}

/**
 * Resolves a random-skill roll: picks one outcome for each 2D6 (duplicate rolls
 * collapse to the single skill), drops skills the player already owns, and flags
 * a re-roll when no outcome is eligible.
 */
export function resolveRollOutcome(column: SkillColumn, dice4: [number, number, number, number], ownedSkills: readonly string[]): RollOutcome {
  const [first, second] = rollTwoSkills(column, dice4);
  const rolled = first === second ? [first] : [first, second];
  const eligible = rolled.filter((skill) => !ownedSkills.includes(skill));
  if (eligible.length > 0) {
    return { skills: eligible, reroll: false };
  }
  return { skills: [], reroll: true };
}
