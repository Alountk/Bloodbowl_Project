/**
 * BB2025 block dice engine (T15 — S4 Combate, step 1 · S10.1).
 *
 * The real block die has six faces with their real weights — Attacker Down,
 * Both Down, Push ×2, Defender Stumbles, Defender Down (POW). Number of dice
 * comes from the Strength comparison: standard BB rules give the roller 2 dice
 * when attacker ST >= defender ST and 1 die when attacker ST < defender ST.
 * This step caps at 2 dice — skill modifiers (Two-Handed, Juggernaut, …) are
 * S4 step 2+ concerns and are deliberately NOT modelled here.
 *
 * Seeded injection (lib/random.ts, PR #404): `blockDie`/`blockDice` take an
 * optional trailing `Rng` — tests inject `createRng(seed)`, runtime omits it
 * and stays on `Math.random`. `chooseBlockFace` is pure (no rng): the ROLLER's
 * side always picks the result face (1-die blocks are forced).
 *
 * Content-filter mitigation: this module never touches the injury table.
 */
import { rollD6, type Rng } from "../random";

/** The five distinct block-die faces (Push appears twice on the physical die). */
export type BlockDieFace =
  | "attackerDown"
  | "bothDown"
  | "push"
  | "defenderStumbles"
  | "defenderDown";

/**
 * The physical die in order, 6 entries with the duplicated Push — index 0..5
 * maps directly to a D6 roll (rollD6 − 1).
 */
export const BLOCK_DIE_FACES: readonly BlockDieFace[] = [
  "attackerDown",
  "bothDown",
  "push",
  "push",
  "defenderStumbles",
  "defenderDown",
];

/** Roll one block-die face (uniform 1/6 per entry — Push = 2/6). */
export function blockDie(rng?: Rng): BlockDieFace {
  return BLOCK_DIE_FACES[rollD6(rng) - 1];
}

/**
 * Roll the block dice for a block: 2 dice when attacker ST >= defender ST,
 * 1 die when attacker ST < defender ST (standard BB — capped at 2, no skills).
 */
export function blockDice(attackerSt: number, defenderSt: number, rng?: Rng): BlockDieFace[] {
  const dice = attackerSt >= defenderSt ? 2 : 1;
  return Array.from({ length: dice }, () => blockDie(rng));
}

/**
 * Pure selection: the ROLLER's side picks the kept face from the rolled dice.
 * Attacker order: Defender Down > Defender Stumbles > Push > Both Down >
 * Attacker Down; defender order is the exact reverse. Duplicate faces (the
 * doubled Push) tie safely. Throws on an empty list — there is nothing to pick.
 */
export function chooseBlockFace(
  faces: BlockDieFace[],
  chooser: "attacker" | "defender",
): BlockDieFace {
  if (faces.length === 0) throw new Error("chooseBlockFace: no block dice to choose from");
  const order: BlockDieFace[] =
    chooser === "attacker"
      ? ["defenderDown", "defenderStumbles", "push", "bothDown", "attackerDown"]
      : ["attackerDown", "bothDown", "push", "defenderStumbles", "defenderDown"];
  return faces.reduce((best, face) => (order.indexOf(face) < order.indexOf(best) ? face : best));
}
