import { describe, expect, it } from "vitest";
import {
  RANDOM_SKILL_TABLE,
  SKILL_COLUMNS,
  randomSkill,
  rollTwoSkills,
  resolveRollOutcome,
  MANDATORY_SKILLS,
  isMandatorySkill,
  skillCellIndex,
  cellIndexToSkill,
  MAX_CELL_INDEX,
} from "./skills";

describe("random skill table (bb2025-rules R3)", () => {
  it("exposes all six access-letter columns", () => {
    expect(SKILL_COLUMNS).toEqual(["A", "F", "G", "M", "P", "T"]);
  });

  it("encodes every cell of the user-validated 6-column table exactly", () => {
    expect(RANDOM_SKILL_TABLE).toEqual({
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
    });
  });

  it("looks up a single random skill by 2D6 block/row", () => {
    // 1st die 1 (block 1-3), 2nd die 4, column T → Falta rápida
    expect(randomSkill(1, 4, "T")).toBe("Falta rápida");
    // 1st die 6 (block 4-6), 2nd die 2, column G → Placar
    expect(randomSkill(6, 2, "G")).toBe("Placar");
    // 1st die 3 (block 1-3), 2nd die 6, column P → Pasar
    expect(randomSkill(3, 6, "P")).toBe("Pasar");
  });

  it("rolls two independent skills from two 2D6 rolls", () => {
    // Roll A: (1,1) T → Agresor discreto; Roll B: (6,1) T → Jugar sucio
    expect(rollTwoSkills("T", [1, 1, 6, 1])).toEqual(["Agresor discreto", "Jugar sucio"]);
  });

  it("resolves duplicate rolls to the single skill", () => {
    const outcome = resolveRollOutcome("G", [2, 5, 2, 5], []);
    expect(outcome.skills).toEqual(["Manos seguras"]);
    expect(outcome.reroll).toBe(false);
  });

  it("flags a re-roll when the only rolled skills are already owned", () => {
    const outcome = resolveRollOutcome("T", [1, 4, 6, 6], ["Falta rápida", "Vuelo letal"]);
    expect(outcome.reroll).toBe(true);
    expect(outcome.skills).toEqual([]);
  });

  it("drops owned skills from the pickable set but keeps a rerollable one", () => {
    const outcome = resolveRollOutcome("T", [1, 4, 6, 1], ["Falta rápida"]);
    expect(outcome.reroll).toBe(false);
    expect(outcome.skills).toEqual(["Jugar sucio"]);
  });

  it("marks the asterisked skills as mandatory (not élite)", () => {
    expect(MANDATORY_SKILLS).toEqual(["Apariencia asquerosa", "Furia"]);
    expect(isMandatorySkill("Apariencia asquerosa")).toBe(true);
    expect(isMandatorySkill("Furia")).toBe(true);
    expect(isMandatorySkill("Placar")).toBe(false);
  });
});

describe("pending-roll cell encoding (random-pick candidate validation)", () => {
  it("encodes each of the 12 cells per column to a reversible flat index", () => {
    expect(MAX_CELL_INDEX).toBe(11);
    // Block 1-3 (first D6), rows 1..6 → indexes 0..5.
    expect(skillCellIndex("T", "Agresor discreto")).toBe(0);
    expect(skillCellIndex("T", "Crujir")).toBe(1);
    expect(skillCellIndex("T", "Dejada")).toBe(2);
    expect(skillCellIndex("T", "Falta rápida")).toBe(3);
    expect(skillCellIndex("T", "Furtivo")).toBe(4);
    expect(skillCellIndex("T", "Innovador violento")).toBe(5);
    // Block 4-6, rows 1..6 → indexes 6..11.
    expect(skillCellIndex("T", "Jugar sucio")).toBe(6);
    expect(skillCellIndex("T", "Vuelo letal")).toBe(11);
  });

  it("round-trips every cell back to the exact skill name", () => {
    for (const column of SKILL_COLUMNS) {
      for (let index = 0; index <= MAX_CELL_INDEX; index++) {
        const name = cellIndexToSkill(column, index);
        expect(skillCellIndex(column, name)).toBe(index);
      }
    }
  });

  it("returns the null index for a skill not in a column", () => {
    expect(skillCellIndex("G", "Esquivar")).toBeNull();
  });
});
