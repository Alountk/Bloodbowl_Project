/**
 * BB2025 block dice engine tests (T15 — S4 Combate, step 1 · S10.1).
 *
 * Seeded deterministic tests only: every random assertion injects a seeded
 * `createRng` stream through the optional trailing `Rng` parameter
 * (lib/random.ts, engine shipped in PR #404). Golden counts are pinned from
 * the canonical mulberry32 sequence for seed 2025, so any change to the
 * seeded stream or the face mapping is caught immediately.
 *
 * Content-filter mitigation: this suite (and blocks.ts) NEVER touches the
 * injury table — no injuries.ts import anywhere.
 */
import { describe, expect, it } from "vitest";

import { createRng } from "../random";
import {
  BLOCK_DIE_FACES,
  blockDice,
  blockDie,
  chooseBlockFace,
  type BlockDieFace,
} from "./blocks";

describe("BLOCK_DIE_FACES — the real BB2025 block die (6 faces)", () => {
  it("holds exactly 6 faces in die order, with Push appearing twice", () => {
    expect(BLOCK_DIE_FACES).toHaveLength(6);
    expect([...BLOCK_DIE_FACES]).toEqual([
      "attackerDown",
      "bothDown",
      "push",
      "push",
      "defenderStumbles",
      "defenderDown",
    ]);
  });

  it("every entry is a valid BlockDieFace and Push carries 2/6 weight", () => {
    const valid: BlockDieFace[] = [
      "attackerDown",
      "bothDown",
      "push",
      "defenderStumbles",
      "defenderDown",
    ];
    for (const face of BLOCK_DIE_FACES) expect(valid).toContain(face);
    expect(BLOCK_DIE_FACES.filter((f) => f === "push")).toHaveLength(2);
  });
});

describe("blockDie — one face from the seeded engine", () => {
  it("stays inside the face union (range) over a long seeded run", () => {
    const rng = createRng("blocks-range");
    for (let i = 0; i < 6000; i++) {
      expect(BLOCK_DIE_FACES).toContain(blockDie(rng));
    }
  });

  it("produces every face over a long seeded run (no face missing)", () => {
    const rng = createRng(2025);
    const seen = new Set<BlockDieFace>();
    for (let i = 0; i < 6000; i++) seen.add(blockDie(rng));
    expect(seen.size).toBe(5);
  });

  it("replays the same sequence for the same seed (deterministic)", () => {
    const a = createRng(2025);
    const b = createRng(2025);
    for (let i = 0; i < 100; i++) {
      expect(blockDie(a)).toBe(blockDie(b));
    }
  });

  it("returns a valid face when no rng is passed (default random)", () => {
    expect(BLOCK_DIE_FACES).toContain(blockDie());
  });
});

describe("blockDie distribution — seeded golden counts (each face 1/6, Push 2/6)", () => {
  /** Pinned from the canonical mulberry32 stream for seed 2025, 6000 rolls. */
  const GOLDEN = {
    attackerDown: 1047,
    bothDown: 991,
    push: 2061,
    defenderStumbles: 954,
    defenderDown: 947,
  };

  it("matches the golden counts exactly for seed 2025 over 6000 rolls", () => {
    const rng = createRng(2025);
    const counts: Record<BlockDieFace, number> = {
      attackerDown: 0,
      bothDown: 0,
      push: 0,
      defenderStumbles: 0,
      defenderDown: 0,
    };
    for (let i = 0; i < 6000; i++) counts[blockDie(rng)]++;
    expect(counts).toEqual(GOLDEN);
  });

  it("keeps the real weights: every single face ≈ 1/6, Push ≈ 2/6", () => {
    const rng = createRng(2025);
    const counts: Record<BlockDieFace, number> = {
      attackerDown: 0,
      bothDown: 0,
      push: 0,
      defenderStumbles: 0,
      defenderDown: 0,
    };
    for (let i = 0; i < 6000; i++) counts[blockDie(rng)]++;
    for (const face of ["attackerDown", "bothDown", "defenderStumbles", "defenderDown"] as const) {
      expect(counts[face]).toBeGreaterThan(900); // ~1000 ± 10%
      expect(counts[face]).toBeLessThan(1100);
    }
    expect(counts.push).toBeGreaterThan(1800); // ~2000 ± 10%
    expect(counts.push).toBeLessThan(2200);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(6000);
  });
});

describe("blockDice — die count from the ST matchup (standard BB, capped at 2)", () => {
  it("rolls 2 dice when attacker ST equals defender ST", () => {
    expect(blockDice(3, 3, createRng(1))).toHaveLength(2);
    expect(blockDice(7, 7, createRng(1))).toHaveLength(2);
  });

  it("rolls 2 dice when attacker ST is higher than defender ST", () => {
    expect(blockDice(4, 3, createRng(1))).toHaveLength(2);
    expect(blockDice(5, 1, createRng(1))).toHaveLength(2);
  });

  it("rolls 1 die when attacker ST is lower than defender ST", () => {
    expect(blockDice(3, 4, createRng(1))).toHaveLength(1);
    expect(blockDice(1, 5, createRng(1))).toHaveLength(1);
  });

  it("caps at 2 dice even for huge ST gaps (no skill modifiers in this step)", () => {
    expect(blockDice(10, 1, createRng(1))).toHaveLength(2);
    expect(blockDice(1, 10, createRng(1))).toHaveLength(1);
  });

  it("draws every face from the die and is deterministic per seed", () => {
    const faces = blockDice(3, 3, createRng(2025));
    const replay = blockDice(3, 3, createRng(2025));
    expect(faces).toEqual(replay);
    for (const face of faces) expect(BLOCK_DIE_FACES).toContain(face);
  });
});

describe("chooseBlockFace — pure selection by the roller's side", () => {
  it("attacker ranks Defender Down > Defender Stumbles > Push > Both Down > Attacker Down", () => {
    expect(chooseBlockFace(["attackerDown"], "attacker")).toBe("attackerDown");
    expect(chooseBlockFace(["attackerDown", "bothDown"], "attacker")).toBe("bothDown");
    expect(chooseBlockFace(["attackerDown", "bothDown", "push"], "attacker")).toBe("push");
    expect(
      chooseBlockFace(["attackerDown", "bothDown", "push", "defenderStumbles"], "attacker"),
    ).toBe("defenderStumbles");
    expect(
      chooseBlockFace(
        ["attackerDown", "bothDown", "push", "defenderStumbles", "defenderDown"],
        "attacker",
      ),
    ).toBe("defenderDown");
  });

  it("defender ranks the reverse: Attacker Down > Both Down > Push > Defender Stumbles > Defender Down", () => {
    expect(chooseBlockFace(["defenderDown"], "defender")).toBe("defenderDown");
    expect(chooseBlockFace(["defenderDown", "defenderStumbles"], "defender")).toBe(
      "defenderStumbles",
    );
    expect(chooseBlockFace(["defenderDown", "defenderStumbles", "push"], "defender")).toBe("push");
    expect(
      chooseBlockFace(["defenderDown", "defenderStumbles", "push", "bothDown"], "defender"),
    ).toBe("bothDown");
    expect(
      chooseBlockFace(
        ["defenderDown", "defenderStumbles", "push", "bothDown", "attackerDown"],
        "defender",
      ),
    ).toBe("attackerDown");
  });

  it("duplicate Push faces tie safely — both choosers get Push", () => {
    expect(chooseBlockFace(["push", "push"], "attacker")).toBe("push");
    expect(chooseBlockFace(["push", "push"], "defender")).toBe("push");
  });

  it("a duplicated top face wins regardless of order", () => {
    expect(chooseBlockFace(["push", "defenderDown", "defenderDown"], "attacker")).toBe(
      "defenderDown",
    );
    expect(chooseBlockFace(["attackerDown", "attackerDown", "push"], "defender")).toBe(
      "attackerDown",
    );
    // defender prefers Push over Defender Stumbles (reverse order) — ties safe
    expect(chooseBlockFace(["defenderStumbles", "push", "defenderStumbles"], "defender")).toBe(
      "push",
    );
    expect(chooseBlockFace(["push", "defenderStumbles", "defenderStumbles"], "defender")).toBe(
      "push",
    );
  });

  it("is pure and deterministic — same input, same output, input untouched", () => {
    const faces: BlockDieFace[] = ["push", "attackerDown", "defenderStumbles"];
    const snapshot = [...faces];
    const first = chooseBlockFace(faces, "attacker");
    const second = chooseBlockFace(faces, "attacker");
    expect(first).toBe(second);
    expect(faces).toEqual(snapshot);
  });

  it("throws on an empty face list (nothing to choose)", () => {
    expect(() => chooseBlockFace([], "attacker")).toThrow();
    expect(() => chooseBlockFace([], "defender")).toThrow();
  });
});
