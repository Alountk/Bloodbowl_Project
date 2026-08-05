import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RACES, getRaceById, RULES_METADATA } from "./races";
import { getSkillById, getSkillByName } from "./skills";

/** Resolve a skill ref (catalog id or legacy name/alias) to its stable catalog id */
function skillRefToId(ref: string): string {
  return getSkillById(ref)?.id ?? getSkillByName(ref)?.id ?? ref;
}

describe("race dataset", () => {
  it("contains the 30 BB2025 races", () => {
    expect(RACES).toHaveLength(30);
  });

  it("uses unique race ids", () => {
    const ids = RACES.map((race) => race.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every race within the BB2025 positional limits", () => {
    for (const race of RACES) {
      expect(race.positionals.length, `${race.name} has positionals`).toBeGreaterThan(0);
      for (const positional of race.positionals) {
        expect(positional.max, `${race.name} ${positional.name} max`).toBeGreaterThan(0);
        expect(positional.max, `${race.name} ${positional.name} max`).toBeLessThanOrEqual(16);
        expect(positional.cost, `${race.name} ${positional.name} cost`).toBeGreaterThan(0);
        expect(positional.skills).toBeInstanceOf(Array);
      }
    }
  });

  it("stores known BB2025 values for the Human Lineman", () => {
    const human = getRaceById("human")!;
    const lineman = human.positionals.find((positional) => positional.key === "lineman")!;
    expect(lineman.cost).toBe(50_000);
    expect(lineman.ma).toBe(6);
    expect(lineman.st).toBe(3);
    expect(lineman.ag).toBe("3+");
    expect(lineman.pa).toBe("4+");
    expect(lineman.av).toBe("9+");
  });

  it("resolves a race by id", () => {
    const orc = getRaceById("orc");
    expect(orc?.name).toBe("Orc");
  });

  it("returns undefined for an unknown race id", () => {
    expect(getRaceById("nuffle")).toBeUndefined();
  });

  it("data integrity: every race has rerollCost > 0", () => {
    for (const race of RACES) {
      expect(race.rerollCost, `${race.name} rerollCost`).toBeGreaterThan(0);
    }
  });

  it("data integrity: every positional has a role string", () => {
    for (const race of RACES) {
      for (const positional of race.positionals) {
        expect(
          positional.role,
          `${race.name} → ${positional.name} must have a role`,
        ).toBeTruthy();
      }
    }
  });

  it("data integrity: positional keys are unique within each race", () => {
    for (const race of RACES) {
      const keys = race.positionals.map((p) => p.key);
      expect(
        new Set(keys).size,
        `${race.name} has duplicate positional keys`,
      ).toBe(keys.length);
    }
  });

  it("data integrity: AG/PA/AV match expected format", () => {
    const statPattern = /^\d+\+$|^—$/;
    for (const race of RACES) {
      for (const p of race.positionals) {
        expect(p.ag, `${race.name} ${p.name} ag`).toMatch(statPattern);
        expect(p.pa, `${race.name} ${p.name} pa`).toMatch(statPattern);
        expect(p.av, `${race.name} ${p.name} av`).toMatch(statPattern);
      }
    }
  });

  it("data integrity: MA and ST are numeric", () => {
    for (const race of RACES) {
      for (const p of race.positionals) {
        expect(typeof p.ma, `${race.name} ${p.name} ma`).toBe("number");
        expect(typeof p.st, `${race.name} ${p.name} st`).toBe("number");
      }
    }
  });
});

describe("RULES_METADATA", () => {
  it("version is BB2025", () => {
    expect(RULES_METADATA.version).toBe("BB2025");
  });
});

describe("BB2025 roster corrections", () => {
  it("high-elf roster exists in BB2025", () => {
    expect(getRaceById("high-elf")).toBeDefined();
  });

  it("bretonnian roster exists in BB2025", () => {
    const b = getRaceById("bretonnian");
    expect(b).toBeDefined();
    expect(b!.name).toBe("Bretonnian");
  });

  it("chaos-dwarf, gnome and ogre rosters exist in BB2025", () => {
    expect(getRaceById("chaos-dwarf")).toBeDefined();
    expect(getRaceById("gnome")).toBeDefined();
    expect(getRaceById("ogre")).toBeDefined();
  });

  it("chaos-chosen has no beastman-runner positional", () => {
    const cc = getRaceById("chaos-chosen")!;
    const keys = cc.positionals.map((p) => p.key);
    expect(keys).not.toContain("beastman-runner");
  });

  it("chaos-chosen contains lineman, chosen-blocker, chaos-troll, and minotaur", () => {
    const cc = getRaceById("chaos-chosen")!;
    const keys = cc.positionals.map((p) => p.key);
    expect(keys).toContain("lineman");
    expect(keys).toContain("chosen-blocker");
    expect(keys).toContain("chaos-troll");
    expect(keys).toContain("minotaur");
  });

  it("chaos-renegade has no renegade-beastman positional", () => {
    const cr = getRaceById("chaos-renegade")!;
    const keys = cr.positionals.map((p) => p.key);
    expect(keys).not.toContain("renegade-beastman");
  });

  it("chaos-renegade includes renegade-minotaur and renegade-rat-ogre", () => {
    const cr = getRaceById("chaos-renegade")!;
    const keys = cr.positionals.map((p) => p.key);
    expect(keys).toContain("renegade-minotaur");
    expect(keys).toContain("renegade-rat-ogre");
  });

  it("tomb-kings has no bone-giant positional", () => {
    const tk = getRaceById("tomb-kings")!;
    const keys = tk.positionals.map((p) => p.key);
    expect(keys).not.toContain("bone-giant");
  });

  it("vampire roster has vampire-runner, vampire-thrower, vampire-blitzer, vargheist positionals", () => {
    const v = getRaceById("vampire")!;
    const keys = v.positionals.map((p) => p.key);
    expect(keys).toContain("vampire-runner");
    expect(keys).toContain("vampire-thrower");
    expect(keys).toContain("vampire-blitzer");
    expect(keys).toContain("vargheist");
  });

  it("vampire roster has no generic vampire positional", () => {
    const v = getRaceById("vampire")!;
    const keys = v.positionals.map((p) => p.key);
    expect(keys).not.toContain("vampire");
  });
});

// ---------------------------------------------------------------------------
// REQ-RACE-01: Verified reference table availability
// ---------------------------------------------------------------------------
describe("REQ-RACE-01: BB2025 reference table availability", () => {
  function resolveChangeArtifactPath(relativeFilePath: string): string {
    const activeChangePath = resolve(
      __dirname,
      `../../../openspec/changes/bb2025-rules-migration/${relativeFilePath}`,
    );

    if (existsSync(activeChangePath)) {
      return activeChangePath;
    }

    const archiveRoot = resolve(__dirname, "../../../openspec/changes/archive");
    const archivedDir = existsSync(archiveRoot)
      ? readdirSync(archiveRoot)
          .filter((entry) => entry.endsWith("-bb2025-rules-migration"))
          .sort()
          .at(-1)
      : undefined;

    return archivedDir
      ? resolve(archiveRoot, archivedDir, relativeFilePath)
      : activeChangePath;
  }

  const TABLE_PATH = resolveChangeArtifactPath("bb2025-reference-table.md");

  it("reference table file exists at the expected openspec path", () => {
    expect(existsSync(TABLE_PATH), `Expected file at ${TABLE_PATH}`).toBe(true);
  });

  it("reference table is marked Verified (not Draft)", () => {
    const content = readFileSync(TABLE_PATH, "utf8");
    // The verification header row must contain "Verified" status, not "Draft"
    expect(content).toMatch(/Verification status \(Draft\/Verified\)\s*\|\s*Verified/);
  });
});

// ---------------------------------------------------------------------------
// REQ-RACE-02: Preserve Unlisted Keys — exact race ID set and positional key inventory
// ---------------------------------------------------------------------------
describe("REQ-RACE-02: Exact post-migration race ID set and positional key inventory", () => {
  // Authoritative BB2025 race ID list (30 races)
  const EXPECTED_RACE_IDS = new Set([
    "human", "orc", "dwarf", "elven-union", "skaven", "dark-elf",
    "shambling-undead", "chaos-chosen", "chaos-dwarf", "amazon", "chaos-renegade",
    "halfling", "high-elf", "bretonnian", "gnome", "imperial-nobility", "khorne", "lizardmen",
    "necromantic-horror", "norse", "nurgle", "old-world-alliance", "snotling",
    "ogre", "tomb-kings", "underworld-denizens", "vampire", "black-orc", "goblin", "wood-elf",
  ]);

  // Approved positional key inventory per race (approved delta applied)
  const EXPECTED_POSITIONAL_KEYS: Record<string, string[]> = {
    "human":               ["lineman", "thrower", "blitzer", "catcher", "ogre"],
    "orc":                 ["lineman", "thrower", "blitzer", "big-un-blocker", "goblin", "troll"],
    "dwarf":               ["lineman", "blitzer", "runner", "troll-slayer", "deathroller"],
    "elven-union":         ["lineman", "thrower", "catcher", "blitzer"],
    "skaven":              ["lineman", "thrower", "gutter-runner", "blitzer", "rat-ogre"],
    "dark-elf":            ["lineman", "blitzer", "runner", "assassin", "witch-elf"],
    "shambling-undead":    ["skeleton-lineman", "zombie-lineman", "ghoul-runner", "wight-blitzer", "mummy"],
    "chaos-chosen":        ["lineman", "chosen-blocker", "chaos-troll", "minotaur"],
    "chaos-dwarf":         ["hobgoblin-lineman", "sneaky-stabba", "chaos-dwarf-blocker", "flamesmith", "bull-centaur", "minotaur"],
    "amazon":              ["linewoman", "thrower", "catcher", "blitzer"],
    "chaos-renegade":      ["renegade-lineman", "renegade-orc-lineman", "renegade-goblin", "renegade-skaven",
                             "renegade-dark-elf", "chaos-ogre", "renegade-troll", "renegade-minotaur", "renegade-rat-ogre"],
    "halfling":            ["hopeful", "catcher", "hefty", "treeman"],
    "high-elf":            ["lineman", "thrower", "catcher", "blitzer"],
    "bretonnian":          ["peasant-lineman", "blitzer", "blocker", "ogre"],
    "gnome":               ["gnome-lineman", "woodland-fox", "gnome-illusionist", "gnome-beastmaster", "altern-forest-treeman"],
    "imperial-nobility":   ["lackey-lineman", "bodyguard", "thrower", "blitzer", "ogre"],
    "khorne":              ["marauder", "khorne-blocker", "bloodseeker", "juggernaut"],
    "lizardmen":           ["skink-runner", "saurus-blocker", "kroxigor"],
    "necromantic-horror":  ["zombie-lineman", "werewolf", "flesh-golem", "wraith", "ghoul-runner"],
    "norse":               ["lineman", "thrower", "berserker", "valkyrie", "ulfwerener", "snow-troll"],
    "nurgle":              ["rotter-lineman", "pestigor", "bloater", "rotspawn"],
    "ogre":                ["gnoblar-lineman", "ogre-blocker", "ogre-runt-punter"],
    "old-world-alliance":  ["human-lineman", "dwarf-lineman", "halfling-hopeful", "thrower", "blitzer", "ogre"],
    "snotling":            ["snotling", "fun-hoppa", "stilty-runna", "pump-wagon", "trained-troll"],
    "tomb-kings":          ["skeleton-lineman", "thro-ra", "blitz-ra", "tomb-guardian"],
    "underworld-denizens": ["underworld-goblin", "skaven-lineman", "skaven-thrower", "skaven-blitzer", "mutant-rat-ogre"],
    "vampire":             ["thrall-lineman", "vampire-runner", "vampire-thrower", "vampire-blitzer", "vargheist"],
    "black-orc":           ["goblin-bruiser", "black-orc-blocker", "trained-troll"],
    "goblin":              ["goblin-lineman", "fanatic", "loony", "pogoer", "bombardier", "trained-troll"],
    "wood-elf":            ["lineman", "thrower", "catcher", "wardancer", "treeman"],
  };

  it("exact post-migration race ID set equals the approved 30-race BB2025 roster", () => {
    const actualIds = new Set(RACES.map((r) => r.id));
    expect(actualIds).toEqual(EXPECTED_RACE_IDS);
  });

  it("high-elf is present", () => {
    expect(RACES.map((r) => r.id)).toContain("high-elf");
  });

  it("positional key inventory matches approved set for every race (no unlisted additions or removals)", () => {
    for (const race of RACES) {
      const actual = race.positionals.map((p) => p.key);
      const expected = EXPECTED_POSITIONAL_KEYS[race.id];
      expect(actual, `${race.id} positional keys`).toEqual(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// REQ-RACE-04: Exact reroll cost parity — one assertion per race from the verified table
// ---------------------------------------------------------------------------
describe("REQ-RACE-04: Exact reroll costs from verified BB2025 reference table", () => {
  // Values sourced from bb2025-reference-table.md (Reroll Cost column, per-race).
    // NOTE: chaos-dwarf, gnome and ogre values were OCR-extracted from the 2025 PDF.
  const EXPECTED_REROLL_COSTS: Record<string, number> = {
    "human":               50_000,
    "orc":                 60_000,
    "dwarf":               60_000,
    "elven-union":         50_000,
    "skaven":              50_000,
    "dark-elf":            50_000,
    "shambling-undead":    70_000,
    "chaos-chosen":        50_000,
    "chaos-dwarf":         70_000,
    "amazon":              60_000,
    "chaos-renegade":      70_000,
    "halfling":            60_000,
    "high-elf":            50_000,
    "bretonnian":          50_000,
    "gnome":               50_000,
    "imperial-nobility":   60_000,
    "khorne":              60_000,
    "lizardmen":           70_000,
    "necromantic-horror":  70_000,
    "norse":               60_000,
    "nurgle":              60_000,
    "ogre":                70_000,
    "old-world-alliance":  70_000,
    "snotling":            70_000,
    "tomb-kings":          60_000,
    "underworld-denizens": 70_000,
    "vampire":             60_000,
    "black-orc":           60_000,
    "goblin":              80_000,
    "wood-elf":            50_000,
  };

  for (const [raceId, expectedCost] of Object.entries(EXPECTED_REROLL_COSTS)) {
    it(`${raceId}: rerollCost === ${expectedCost.toLocaleString()}`, () => {
      const race = getRaceById(raceId);
      expect(race, `${raceId} not found`).toBeDefined();
      expect(race!.rerollCost, `${raceId} rerollCost`).toBe(expectedCost);
    });
  }
});

// ---------------------------------------------------------------------------
// REQ-RACE-06: Approved compatibility break is explicitly documented
// ---------------------------------------------------------------------------
describe("REQ-RACE-06: Compatibility break explicitly documented in design and tasks", () => {
  function resolveChangeArtifactPath(relativeFilePath: string): string {
    const activeChangePath = resolve(
      __dirname,
      `../../../openspec/changes/bb2025-rules-migration/${relativeFilePath}`,
    );

    if (existsSync(activeChangePath)) {
      return activeChangePath;
    }

    const archiveRoot = resolve(__dirname, "../../../openspec/changes/archive");
    const archivedDir = existsSync(archiveRoot)
      ? readdirSync(archiveRoot)
          .filter((entry) => entry.endsWith("-bb2025-rules-migration"))
          .sort()
          .at(-1)
      : undefined;

    return archivedDir
      ? resolve(archiveRoot, archivedDir, relativeFilePath)
      : activeChangePath;
  }

  const DESIGN_PATH = resolveChangeArtifactPath("design.md");
  const TASKS_PATH = resolveChangeArtifactPath("tasks.md");

  it("design.md mentions approved compatibility break for key/roster delta", () => {
    const content = readFileSync(DESIGN_PATH, "utf8");
    expect(content).toMatch(/compatibility.break/i);
  });

  it("tasks.md records the compatibility break as a deliberate user-approved decision", () => {
    const content = readFileSync(TASKS_PATH, "utf8");
    expect(content).toMatch(/compatibility.break/i);
  });

  it("design.md or tasks.md includes a follow-up note for persisted-team migration strategy", () => {
    const design = readFileSync(DESIGN_PATH, "utf8");
    const tasks = readFileSync(TASKS_PATH, "utf8");
    const combinedContent = design + tasks;
    // Must contain a follow-up note about migration or fallback for saved teams
    expect(combinedContent).toMatch(/follow.up|migration strategy|persisted.team|saved team/i);
  });
});

// ---------------------------------------------------------------------------
// REQ-RACE-04: Full-table positional stat/cost/skill parity against the
//              verified BB2025 reference table (runtime proof).
//
// Each row is sourced from bb2025-reference-table.md.
// N/A rows assert race or positional absence instead of stat values.
// Skills are normalized: trimmed, lowercased, sorted — order-insensitive.
// ---------------------------------------------------------------------------
describe("REQ-RACE-04: Full positional stat/cost/skill parity against verified reference table", () => {
  // Helper: normalize a skill list for comparison (ref->id, case/whitespace/order insensitive)
  function normalizeSkills(skills: string[]): string[] {
    return skills
      .map((s) => skillRefToId(s.trim()))
      .sort();
  }

  // Helper: find a positional by key, or undefined
  function findPositional(raceId: string, key: string) {
    return getRaceById(raceId)?.positionals.find((p) => p.key === key);
  }

  // ---- Human ---------------------------------------------------------------
  describe("human positional parity", () => {
    it("lineman: MA6 ST3 AG3+ PA4+ AV9+ cost50000 skills:none", () => {
      const p = findPositional("human", "lineman")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(50_000);
      expect(normalizeSkills(p.skills)).toEqual([]);
    });
    it("thrower: MA6 ST3 AG3+ PA3+ AV9+ cost75000 skills:sure hands,pass", () => {
      const p = findPositional("human", "thrower")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(75_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Sure Hands", "Pass"]));
    });
    it("blitzer: MA7 ST3 AG3+ PA4+ AV9+ cost85000 skills:defensive,block", () => {
      const p = findPositional("human", "blitzer")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Defensive", "Block"]));
    });
    it("catcher: MA8 ST3 AG3+ PA4+ AV8+ cost75000 skills:catch,dodge", () => {
      const p = findPositional("human", "catcher")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(75_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Catch", "Dodge"]));
    });
  });

  // ---- Bretonnian ----------------------------------------------------------
  describe("bretonnian positional parity", () => {
    it("race exists", () => expect(getRaceById("bretonnian")).toBeDefined());
    it("rerollCost 50000", () => expect(getRaceById("bretonnian")!.rerollCost).toBe(50_000));
    it("peasant-lineman: MA6 ST3 AG3+ PA4+ AV8+ cost40000 skills:bribery & corruption", () => {
      const p = findPositional("bretonnian", "peasant-lineman")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Bribery & Corruption"]));
    });
    it("blitzer: MA7 ST3 AG3+ PA4+ AV9+ cost85000 skills:defensive,block", () => {
      const p = findPositional("bretonnian", "blitzer")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Defensive", "Block"]));
    });
    it("blocker: MA5 ST3 AG4+ PA6+ AV9+ cost65000 skills:wrestle,thick skull", () => {
      const p = findPositional("bretonnian", "blocker")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+");
      expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(65_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Wrestle", "Thick Skull"]));
    });
    it("ogre: MA5 ST5 AG4+ PA5+ AV10+ cost140000 skills:thick skull,really stupid,mighty blow (+1),throw team-mate,loner (3+)", () => {
      const p = findPositional("bretonnian", "ogre")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+");
      expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
      expect(normalizeSkills(p.skills)).toEqual(
        normalizeSkills(["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"]),
      );
    });
  });

  // ---- High Elf ------------------------------------------------------------
  describe("high-elf parity", () => {
    it("high-elf race exists", () => {
      expect(getRaceById("high-elf")).toBeDefined();
    });
  });

  // ---- Chaos Renegade N/A row -------------------------------------------
  describe("chaos-renegade N/A positional parity", () => {
    it("renegade-beastman positional does not exist (N/A in reference table)", () => {
      const cr = getRaceById("chaos-renegade")!;
      expect(cr).toBeDefined();
      expect(cr.positionals.find((p) => p.key === "renegade-beastman")).toBeUndefined();
    });
  });

  // ---- Chaos Chosen N/A row ------------------------------------------------
  describe("chaos-chosen N/A positional parity", () => {
    it("beastman-runner positional does not exist (N/A in reference table)", () => {
      const cc = getRaceById("chaos-chosen")!;
      expect(cc).toBeDefined();
      expect(cc.positionals.find((p) => p.key === "beastman-runner")).toBeUndefined();
    });
  });

  // ---- Tomb Kings N/A row --------------------------------------------------
  describe("tomb-kings N/A positional parity", () => {
    it("bone-giant positional does not exist (N/A in reference table)", () => {
      const tk = getRaceById("tomb-kings")!;
      expect(tk).toBeDefined();
      expect(tk.positionals.find((p) => p.key === "bone-giant")).toBeUndefined();
    });
  });

  // ---- Vampire N/A row -----------------------------------------------------
  describe("vampire N/A positional parity", () => {
    it("generic vampire positional does not exist (N/A in reference table)", () => {
      const v = getRaceById("vampire")!;
      expect(v).toBeDefined();
      expect(v.positionals.find((p) => p.key === "vampire")).toBeUndefined();
    });
  });

  // ---- Spot-check a sample of other races for stat parity ------------------
  describe("spot-check stat parity: orc lineman", () => {
    it("orc lineman: MA5 ST3 AG3+ PA4+ AV10+ cost50000", () => {
      const p = findPositional("orc", "lineman")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(50_000);
    });
  });

  describe("spot-check stat parity: lizardmen skink-runner", () => {
    it("skink-runner: MA8 ST2 AG3+ PA4+ AV8+ cost60000 skills:dodge,right stuff", () => {
      const p = findPositional("lizardmen", "skink-runner")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(8); expect(p.st).toBe(2); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(60_000);
      expect(normalizeSkills(p.skills)).toEqual(normalizeSkills(["Dodge", "Right Stuff"]));
    });
  });

  describe("spot-check stat parity: necromantic-horror wraith (PA N/A field)", () => {
    it("wraith: MA6 ST3 AG3+ PA— AV9+ cost85000 skills:foul appearance,sidestep,no hands,block,regeneration", () => {
      const p = findPositional("necromantic-horror", "wraith")!;
      expect(p).toBeDefined();
      expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+");
      expect(p.pa).toBe("—"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
      expect(normalizeSkills(p.skills)).toEqual(
        normalizeSkills(["Foul Appearance", "Sidestep", "No Hands", "Block", "Regeneration"]),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// REQ-RACE-04: Exhaustive positional stat/cost/skill parity — remaining races
//
// Covers every race and every non-N/A positional row from bb2025-reference-table.md
// not already covered by the describe block above.
// N/A rows assert positional or race absence. Skills are normalized: trimmed,
// lowercased, sorted — order- and case-insensitive.
// Reference: openspec/changes/bb2025-rules-migration/bb2025-reference-table.md
// ---------------------------------------------------------------------------
describe("REQ-RACE-04: Exhaustive parity — orc positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("orc exists, rerollCost 60000", () => { const r = getRaceById("orc")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("orc thrower: MA6 ST3 AG3+ PA3+ AV9+ cost75000 skills:sure hands,pass", () => {
    const p = fp("orc", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Sure Hands", "Pass"]));
  });
  it("orc blitzer: MA6 ST3 AG3+ PA4+ AV10+ cost85000 skills:brawler,block", () => {
    const p = fp("orc", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Brawler", "Block"]));
  });
  it("orc big-un-blocker: MA5 ST4 AG4+ PA6+ AV10+ cost95000 skills:thick skull,mighty blow (+1),taunt,unchannelled fury", () => {
    const p = fp("orc", "big-un-blocker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(95_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Mighty Blow (+1)", "Taunt", "Unchannelled Fury"]));
  });
  it("orc goblin: MA6 ST2 AG3+ PA3+ AV8+ cost40000 skills:dodge,right stuff,stunty,titchy", () => {
    const p = fp("orc", "goblin")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Stunty", "Titchy"]));
  });
  it("orc troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("orc", "troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — dwarf positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("dwarf exists, rerollCost 60000", () => { const r = getRaceById("dwarf")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("dwarf lineman: MA4 ST3 AG4+ PA5+ AV10+ cost70000 skills:thick skull,block,tackle", () => {
    const p = fp("dwarf", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(70_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Block", "Tackle"]));
  });
  it("dwarf blitzer: MA5 ST3 AG4+ PA4+ AV10+ cost100000 skills:defensive,arm bar,block,thick skull", () => {
    const p = fp("dwarf", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(100_000);
    expect(norm(p.skills)).toEqual(norm(["Defensive", "Arm Bar", "Block", "Thick Skull"]));
  });
  it("dwarf runner: MA6 ST3 AG3+ PA4+ AV9+ cost80000 skills:thick skull,sprint,sure hands", () => {
    const p = fp("dwarf", "runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(80_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Sprint", "Sure Hands"]));
  });
  it("dwarf troll-slayer: MA5 ST3 AG4+ PA5+ AV9+ cost95000 skills:dauntless,thick skull,frenzy,block,troll hatred", () => {
    const p = fp("dwarf", "troll-slayer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(95_000);
    expect(norm(p.skills)).toEqual(norm(["Dauntless", "Thick Skull", "Frenzy", "Block", "Troll Hatred"]));
  });
  it("dwarf deathroller: MA5 ST7 AG5+ PA— AV11+ cost170000", () => {
    const p = fp("dwarf", "deathroller")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(7); expect(p.ag).toBe("5+"); expect(p.pa).toBe("—"); expect(p.av).toBe("11+"); expect(p.cost).toBe(170_000);
    expect(norm(p.skills)).toEqual(norm(["Break Tackle", "Secret Weapon", "No Hands", "Mighty Blow (+1)", "Juggernaut", "Dirty Player (+1)", "Stand Firm", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — elven-union positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("elven-union exists, rerollCost 50000", () => { const r = getRaceById("elven-union")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(50_000); });
  it("elven-union lineman: MA6 ST3 AG2+ PA3+ AV8+ cost65000 skills:dejada", () => {
    const p = fp("elven-union", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(65_000);
    expect(norm(p.skills)).toEqual(norm(["Dejada"]));
  });
  it("elven-union thrower: MA6 ST3 AG2+ PA2+ AV8+ cost75000 skills:pass,running pass", () => {
    const p = fp("elven-union", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Pass", "Running Pass"]));
  });
  it("elven-union catcher: MA8 ST3 AG2+ PA4+ AV8+ cost100000 skills:catch,nerves of steel,safe pair of hands", () => {
    const p = fp("elven-union", "catcher")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(100_000);
    expect(norm(p.skills)).toEqual(norm(["Catch", "Nerves of Steel", "Safe Pair of Hands"]));
  });
  it("elven-union blitzer: MA7 ST3 AG2+ PA3+ AV9+ cost115000 skills:sidestep,block", () => {
    const p = fp("elven-union", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Sidestep", "Block"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — skaven positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("skaven exists, rerollCost 50000", () => { const r = getRaceById("skaven")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(50_000); });
  it("skaven lineman: MA7 ST3 AG3+ PA4+ AV8+ cost50000 skills:none", () => {
    const p = fp("skaven", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual([]);
  });
  it("skaven thrower: MA7 ST3 AG3+ PA2+ AV8+ cost80000 skills:sure hands,pass", () => {
    const p = fp("skaven", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(80_000);
    expect(norm(p.skills)).toEqual(norm(["Sure Hands", "Pass"]));
  });
  it("skaven gutter-runner: MA9 ST2 AG2+ PA4+ AV8+ cost85000 skills:stab,dodge", () => {
    const p = fp("skaven", "gutter-runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(9); expect(p.st).toBe(2); expect(p.ag).toBe("2+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Stab", "Dodge"]));
  });
  it("skaven blitzer: MA8 ST3 AG3+ PA4+ AV9+ cost90000 skills:block,strip ball", () => {
    const p = fp("skaven", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Block", "Strip Ball"]));
  });
  it("skaven rat-ogre: MA6 ST5 AG4+ PA6+ AV9+ cost150000", () => {
    const p = fp("skaven", "rat-ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Prehensile Tail", "Animal Savagery", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — dark-elf positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("dark-elf exists, rerollCost 50000", () => { const r = getRaceById("dark-elf")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(50_000); });
  it("dark-elf lineman: MA6 ST3 AG2+ PA3+ AV9+ cost65000 skills:none", () => {
    const p = fp("dark-elf", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(65_000);
    expect(norm(p.skills)).toEqual([]);
  });
  it("dark-elf blitzer: MA7 ST3 AG2+ PA3+ AV9+ cost105000 skills:block", () => {
    const p = fp("dark-elf", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(105_000);
    expect(norm(p.skills)).toEqual(norm(["Block"]));
  });
  it("dark-elf runner: MA7 ST3 AG2+ PA3+ AV8+ cost80000", () => {
    const p = fp("dark-elf", "runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(80_000);
    // skills stored as Spanish OCR-derived strings matching implementation
    expect(norm(p.skills)).toEqual(norm(["Pase precipitado", "Patada de despeje"]));
  });
  it("dark-elf assassin: MA7 ST3 AG2+ PA4+ AV8+ cost90000 skills:stab,hit and run,shadowing", () => {
    const p = fp("dark-elf", "assassin")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Stab", "Hit and Run", "Shadowing"]));
  });
  it("dark-elf witch-elf: MA7 ST3 AG2+ PA4+ AV8+ cost110000 skills:jump up,dodge,frenzy", () => {
    const p = fp("dark-elf", "witch-elf")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Jump Up", "Dodge", "Frenzy"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — shambling-undead positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("shambling-undead exists, rerollCost 70000", () => { const r = getRaceById("shambling-undead")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("skeleton-lineman: MA5 ST3 AG4+ PA6+ AV8+ cost40000 skills:thick skull,regeneration", () => {
    const p = fp("shambling-undead", "skeleton-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Regeneration"]));
  });
  it("zombie-lineman: MA4 ST3 AG4+ PA6+ AV9+ cost40000 skills:low blow,regeneration,unchannelled fury", () => {
    const p = fp("shambling-undead", "zombie-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Low Blow", "Regeneration", "Unchannelled Fury"]));
  });
  it("ghoul-runner: MA7 ST3 AG3+ PA3+ AV8+ cost75000 skills:dodge,regeneration", () => {
    const p = fp("shambling-undead", "ghoul-runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Regeneration"]));
  });
  it("wight-blitzer: MA6 ST3 AG3+ PA5+ AV9+ cost95000 skills:thick skull,defensive,block,regeneration", () => {
    const p = fp("shambling-undead", "wight-blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(95_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Defensive", "Block", "Regeneration"]));
  });
  it("mummy: MA3 ST5 AG5+ PA6+ AV10+ cost125000 skills:mighty blow (+1),regeneration", () => {
    const p = fp("shambling-undead", "mummy")!; expect(p).toBeDefined();
    expect(p.ma).toBe(3); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(125_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Regeneration"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — chaos-chosen positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("chaos-chosen exists, rerollCost 50000", () => { const r = getRaceById("chaos-chosen")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(50_000); });
  it("chaos-chosen lineman: MA6 ST3 AG3+ PA3+ AV9+ cost55000 skills:thick skull,horns", () => {
    const p = fp("chaos-chosen", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(55_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Horns"]));
  });
  it("chosen-blocker: MA5 ST4 AG3+ PA5+ AV10+ cost100000", () => {
    const p = fp("chaos-chosen", "chosen-blocker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(4); expect(p.ag).toBe("3+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(100_000);
    // stored as Spanish OCR-derived string matching implementation
    expect(norm(p.skills)).toEqual(norm(["Llave de brazo"]));
  });
  it("chaos-troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("chaos-chosen", "chaos-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
  it("minotaur: MA5 ST5 AG4+ PA6+ AV9+ cost150000", () => {
    const p = fp("chaos-chosen", "minotaur")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Horns", "Frenzy", "Mighty Blow (+1)", "Unchannelled Fury", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — amazon positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("amazon exists, rerollCost 60000", () => { const r = getRaceById("amazon")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("linewoman: MA6 ST3 AG3+ PA4+ AV8+ cost50000 skills:dodge", () => {
    const p = fp("amazon", "linewoman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge"]));
  });
  it("amazon thrower: MA6 ST3 AG3+ PA3+ AV8+ cost80000 skills:on the ball,dodge,pass,safe pass", () => {
    const p = fp("amazon", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(80_000);
    expect(norm(p.skills)).toEqual(norm(["On the Ball", "Dodge", "Pass", "Safe Pass"]));
  });
  it("amazon catcher: MA7 ST3 AG3+ PA4+ AV8+ cost90000 skills:hit and run,jump up,dodge", () => {
    const p = fp("amazon", "catcher")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Hit and Run", "Jump Up", "Dodge"]));
  });
  it("amazon blitzer: MA6 ST4 AG3+ PA4+ AV9+ cost110000 skills:dodge,defensive", () => {
    const p = fp("amazon", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(4); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Defensive"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — chaos-renegade positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("chaos-renegade exists, rerollCost 70000", () => { const r = getRaceById("chaos-renegade")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("renegade-lineman: MA6 ST3 AG3+ PA4+ AV9+ cost50000 skills:animosity (all)", () => {
    const p = fp("chaos-renegade", "renegade-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (all)"]));
  });
  it("renegade-orc-lineman: MA5 ST3 AG3+ PA4+ AV10+ cost50000 skills:animosity (all)", () => {
    const p = fp("chaos-renegade", "renegade-orc-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (all)"]));
  });
  it("renegade-goblin: MA6 ST2 AG3+ PA4+ AV8+ cost40000 skills:animosity (all),dodge,right stuff,titchy", () => {
    const p = fp("chaos-renegade", "renegade-goblin")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (all)", "Dodge", "Right Stuff", "Titchy"]));
  });
  it("renegade-skaven: MA7 ST3 AG3+ PA4+ AV8+ cost50000 skills:animosity (all)", () => {
    const p = fp("chaos-renegade", "renegade-skaven")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (all)"]));
  });
  it("renegade-dark-elf: MA6 ST3 AG2+ PA3+ AV9+ cost65000 skills:animosity (all)", () => {
    const p = fp("chaos-renegade", "renegade-dark-elf")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(65_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (all)"]));
  });
  it("chaos-ogre: MA5 ST5 AG4+ PA5+ AV10+ cost140000", () => {
    const p = fp("chaos-renegade", "chaos-ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Really Stupid", "Throw Team-mate", "Loner (4+)"]));
  });
  it("renegade-troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("chaos-renegade", "renegade-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
  it("renegade-minotaur: MA5 ST5 AG4+ PA6+ AV9+ cost150000", () => {
    const p = fp("chaos-renegade", "renegade-minotaur")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Horns", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"]));
  });
  it("renegade-rat-ogre: MA6 ST5 AG4+ PA6+ AV9+ cost150000", () => {
    const p = fp("chaos-renegade", "renegade-rat-ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Prehensile Tail", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — halfling positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("halfling exists, rerollCost 60000", () => { const r = getRaceById("halfling")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("hopeful: MA5 ST2 AG3+ PA4+ AV7+ cost30000 skills:dodge,right stuff,titchy", () => {
    const p = fp("halfling", "hopeful")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("7+"); expect(p.cost).toBe(30_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Titchy"]));
  });
  it("halfling catcher: MA5 ST2 AG3+ PA4+ AV7+ cost55000 skills:catch,sprint,dodge,right stuff,titchy", () => {
    const p = fp("halfling", "catcher")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("7+"); expect(p.cost).toBe(55_000);
    expect(norm(p.skills)).toEqual(norm(["Catch", "Sprint", "Dodge", "Right Stuff", "Titchy"]));
  });
  it("hefty: MA5 ST2 AG3+ PA3+ AV8+ cost50000 skills:dodge,right stuff,sneaky git", () => {
    const p = fp("halfling", "hefty")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Sneaky Git"]));
  });
  it("treeman: MA2 ST6 AG5+ PA5+ AV11+ cost120000", () => {
    const p = fp("halfling", "treeman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(2); expect(p.st).toBe(6); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("11+"); expect(p.cost).toBe(120_000);
    expect(norm(p.skills)).toEqual(norm(["Strong Arm", "Thick Skull", "Take Root", "Mighty Blow (+1)", "Throw Team-mate", "Stand Firm", "Timmm-ber!"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — imperial-nobility positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("imperial-nobility exists, rerollCost 60000", () => { const r = getRaceById("imperial-nobility")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("lackey-lineman: MA6 ST3 AG3+ PA4+ AV8+ cost45000 skills:fend", () => {
    const p = fp("imperial-nobility", "lackey-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(45_000);
    expect(norm(p.skills)).toEqual(norm(["Fend"]));
  });
  it("bodyguard: MA5 ST3 AG3+ PA4+ AV9+ cost85000 skills:wrestle,stand firm", () => {
    const p = fp("imperial-nobility", "bodyguard")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Wrestle", "Stand Firm"]));
  });
  it("imperial-nobility thrower: MA6 ST3 AG3+ PA2+ AV9+ cost75000 skills:pass,running pass", () => {
    const p = fp("imperial-nobility", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Pass", "Running Pass"]));
  });
  it("imperial-nobility blitzer: MA7 ST3 AG3+ PA4+ AV9+ cost90000 skills:catch,block,pro", () => {
    const p = fp("imperial-nobility", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Catch", "Block", "Pro"]));
  });
  it("imperial-nobility ogre: MA5 ST5 AG4+ PA5+ AV10+ cost140000", () => {
    const p = fp("imperial-nobility", "ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — khorne positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("khorne exists, rerollCost 60000", () => { const r = getRaceById("khorne")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("marauder: MA6 ST3 AG3+ PA4+ AV8+ cost50000", () => {
    const p = fp("khorne", "marauder")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    // stored as Spanish OCR-derived string matching implementation
    expect(norm(p.skills)).toEqual(norm(["Furia asesina"]));
  });
  it("khorne-blocker: MA6 ST3 AG3+ PA4+ AV9+ cost70000 skills:thick skull,horns,jump up,juggernaut", () => {
    const p = fp("khorne", "khorne-blocker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(70_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Horns", "Jump Up", "Juggernaut"]));
  });
  it("bloodseeker: MA5 ST4 AG4+ PA6+ AV10+ cost105000", () => {
    const p = fp("khorne", "bloodseeker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(105_000);
    expect(norm(p.skills)).toEqual(norm(["Furia asesina"]));
  });
  it("juggernaut: MA5 ST5 AG4+ PA6+ AV9+ cost160000", () => {
    const p = fp("khorne", "juggernaut")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(160_000);
    expect(norm(p.skills)).toEqual(norm(["Frenzy", "Claws", "Mighty Blow (+1)", "Unchannelled Fury", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — lizardmen positionals (remaining)", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("lizardmen exists, rerollCost 70000", () => { const r = getRaceById("lizardmen")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("saurus-blocker: MA6 ST4 AG5+ PA6+ AV10+ cost90000 skills:juggernaut,unchannelled fury", () => {
    const p = fp("lizardmen", "saurus-blocker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(4); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Juggernaut", "Unchannelled Fury"]));
  });
  it("kroxigor: MA6 ST5 AG5+ PA6+ AV10+ cost140000", () => {
    const p = fp("lizardmen", "kroxigor")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Prehensile Tail", "Really Stupid", "Mighty Blow (+1)", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — necromantic-horror positionals (remaining)", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("necromantic-horror exists, rerollCost 70000", () => { const r = getRaceById("necromantic-horror")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("zombie-lineman: MA4 ST3 AG4+ PA6+ AV9+ cost40000 skills:low blow,regeneration,unchannelled fury", () => {
    const p = fp("necromantic-horror", "zombie-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Low Blow", "Regeneration", "Unchannelled Fury"]));
  });
  it("werewolf: MA8 ST3 AG3+ PA3+ AV9+ cost120000 skills:frenzy,claws,regeneration", () => {
    const p = fp("necromantic-horror", "werewolf")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(120_000);
    expect(norm(p.skills)).toEqual(norm(["Frenzy", "Claws", "Regeneration"]));
  });
  it("flesh-golem: MA4 ST4 AG4+ PA6+ AV10+ cost110000", () => {
    const p = fp("necromantic-horror", "flesh-golem")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Stand Firm", "Regeneration", "Unchannelled Fury"]));
  });
  it("ghoul-runner: MA7 ST3 AG3+ PA3+ AV8+ cost75000 skills:dodge,regeneration", () => {
    const p = fp("necromantic-horror", "ghoul-runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Regeneration"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — norse positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("norse exists, rerollCost 60000", () => { const r = getRaceById("norse")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("norse lineman: MA6 ST3 AG3+ PA4+ AV8+ cost50000 skills:drunkard,thick skull,block,unchannelled fury", () => {
    const p = fp("norse", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Drunkard", "Thick Skull", "Block", "Unchannelled Fury"]));
  });
  it("norse thrower: MA7 ST3 AG3+ PA3+ AV8+ cost95000", () => {
    const p = fp("norse", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(95_000);
    expect(norm(p.skills)).toEqual(norm(["Dauntless", "Catch", "Pass", "Strip Ball"]));
  });
  it("berserker: MA6 ST3 AG3+ PA5+ AV8+ cost90000 skills:jump up,frenzy,block", () => {
    const p = fp("norse", "berserker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Jump Up", "Frenzy", "Block"]));
  });
  it("valkyrie: MA7 ST3 AG3+ PA3+ AV8+ cost95000", () => {
    const p = fp("norse", "valkyrie")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(95_000);
    expect(norm(p.skills)).toEqual(norm(["Dauntless", "Catch", "Pass", "Strip Ball"]));
  });
  it("ulfwerener: MA6 ST4 AG4+ PA6+ AV9+ cost105000 skills:frenzy,unchannelled fury", () => {
    const p = fp("norse", "ulfwerener")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(105_000);
    expect(norm(p.skills)).toEqual(norm(["Frenzy", "Unchannelled Fury"]));
  });
  it("snow-troll: MA5 ST5 AG4+ PA6+ AV9+ cost140000", () => {
    const p = fp("norse", "snow-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Frenzy", "Claws", "Unchannelled Fury", "Disturbing Presence", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — nurgle positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("nurgle exists, rerollCost 60000", () => { const r = getRaceById("nurgle")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("rotter-lineman: MA5 ST3 AG4+ PA6+ AV9+ cost40000 skills:decay,nurgling infestation", () => {
    const p = fp("nurgle", "rotter-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Decay", "Nurgling Infestation"]));
  });
  it("pestigor: MA6 ST3 AG3+ PA4+ AV9+ cost70000 skills:thick skull,horns,sure feet,regeneration", () => {
    const p = fp("nurgle", "pestigor")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(70_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Horns", "Sure Feet", "Regeneration"]));
  });
  it("bloater: MA4 ST4 AG4+ PA6+ AV10+ cost110000", () => {
    const p = fp("nurgle", "bloater")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Foul Appearance", "Stand Firm", "Disturbing Presence", "Regeneration", "Unchannelled Fury"]));
  });
  it("rotspawn: MA4 ST5 AG5+ PA6+ AV10+ cost140000", () => {
    const p = fp("nurgle", "rotspawn")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Foul Appearance", "Mighty Blow (+1)", "Disturbing Presence", "Really Stupid", "Regeneration", "Tentacles", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — old-world-alliance positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("old-world-alliance exists, rerollCost 70000", () => { const r = getRaceById("old-world-alliance")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("human-lineman: MA6 ST3 AG3+ PA4+ AV9+ cost50000 skills:none", () => {
    const p = fp("old-world-alliance", "human-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual([]);
  });
  it("dwarf-lineman: MA4 ST3 AG4+ PA5+ AV10+ cost70000 skills:thick skull,block,tackle", () => {
    const p = fp("old-world-alliance", "dwarf-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(70_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Block", "Tackle"]));
  });
  it("halfling-hopeful: MA5 ST2 AG3+ PA4+ AV7+ cost30000 skills:dodge,right stuff,titchy", () => {
    const p = fp("old-world-alliance", "halfling-hopeful")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("7+"); expect(p.cost).toBe(30_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Titchy"]));
  });
  it("old-world-alliance thrower: MA6 ST3 AG3+ PA3+ AV9+ cost75000 skills:sure hands,pass", () => {
    const p = fp("old-world-alliance", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Sure Hands", "Pass"]));
  });
  it("old-world-alliance blitzer: MA7 ST3 AG3+ PA4+ AV9+ cost85000 skills:defensive,block", () => {
    const p = fp("old-world-alliance", "blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Defensive", "Block"]));
  });
  it("old-world-alliance ogre: MA5 ST5 AG4+ PA5+ AV10+ cost140000", () => {
    const p = fp("old-world-alliance", "ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — snotling positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("snotling exists, rerollCost 70000", () => { const r = getRaceById("snotling")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("snotling lineman: MA5 ST1 AG3+ PA4+ AV6+ cost15000 skills:dodge,right stuff,side step,titchy,swarming", () => {
    const p = fp("snotling", "snotling")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(1); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("6+"); expect(p.cost).toBe(15_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Side Step", "Titchy", "Swarming"]));
  });
  it("fun-hoppa: MA6 ST1 AG3+ PA4+ AV6+ cost20000 skills:side step,dodge,right stuff,pogo stick", () => {
    const p = fp("snotling", "fun-hoppa")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(1); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("6+"); expect(p.cost).toBe(20_000);
    expect(norm(p.skills)).toEqual(norm(["Side Step", "Dodge", "Right Stuff", "Pogo Stick"]));
  });
  it("stilty-runna: MA6 ST1 AG3+ PA4+ AV6+ cost20000 skills:side step,sprint,dodge,right stuff", () => {
    const p = fp("snotling", "stilty-runna")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(1); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("6+"); expect(p.cost).toBe(20_000);
    expect(norm(p.skills)).toEqual(norm(["Side Step", "Sprint", "Dodge", "Right Stuff"]));
  });
  it("pump-wagon: MA5 ST5 AG5+ PA6+ AV9+ cost100000", () => {
    const p = fp("snotling", "pump-wagon")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(100_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Juggernaut", "Dirty Player (+1)", "Stand Firm"]));
  });
  it("snotling trained-troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("snotling", "trained-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — tomb-kings positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("tomb-kings exists, rerollCost 60000", () => { const r = getRaceById("tomb-kings")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("skeleton-lineman: MA5 ST3 AG4+ PA6+ AV8+ cost40000 skills:thick skull,regeneration", () => {
    const p = fp("tomb-kings", "skeleton-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Regeneration"]));
  });
  it("thro-ra: MA6 ST3 AG4+ PA3+ AV9+ cost65000 skills:thick skull,sure hands,pass,regeneration", () => {
    const p = fp("tomb-kings", "thro-ra")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(65_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Sure Hands", "Pass", "Regeneration"]));
  });
  it("blitz-ra: MA6 ST3 AG4+ PA5+ AV9+ cost85000 skills:thick skull,block,regeneration", () => {
    const p = fp("tomb-kings", "blitz-ra")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Block", "Regeneration"]));
  });
  it("tomb-guardian: MA4 ST5 AG5+ PA6+ AV10+ cost115000 skills:decay,brawler,regeneration", () => {
    const p = fp("tomb-kings", "tomb-guardian")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Decay", "Brawler", "Regeneration"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — underworld-denizens positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("underworld-denizens exists, rerollCost 70000", () => { const r = getRaceById("underworld-denizens")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(70_000); });
  it("underworld-goblin: MA6 ST2 AG3+ PA4+ AV8+ cost40000 skills:dodge,right stuff,stunty,titchy", () => {
    const p = fp("underworld-denizens", "underworld-goblin")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Stunty", "Titchy"]));
  });
  it("skaven-lineman: MA7 ST3 AG3+ PA4+ AV8+ cost50000 skills:animosity (goblin)", () => {
    const p = fp("underworld-denizens", "skaven-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(50_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (Goblin)"]));
  });
  it("skaven-thrower: MA7 ST3 AG3+ PA2+ AV8+ cost80000 skills:animosity (goblin),sure hands,pass", () => {
    const p = fp("underworld-denizens", "skaven-thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(80_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (Goblin)", "Sure Hands", "Pass"]));
  });
  it("skaven-blitzer: MA8 ST3 AG3+ PA4+ AV9+ cost90000 skills:animosity (goblin),block,strip ball", () => {
    const p = fp("underworld-denizens", "skaven-blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Animosity (Goblin)", "Block", "Strip Ball"]));
  });
  it("mutant-rat-ogre: MA6 ST5 AG4+ PA6+ AV9+ cost150000", () => {
    const p = fp("underworld-denizens", "mutant-rat-ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Prehensile Tail", "Animal Savagery", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — vampire positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("vampire exists, rerollCost 60000", () => { const r = getRaceById("vampire")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("thrall-lineman: MA6 ST3 AG3+ PA4+ AV8+ cost40000 skills:none", () => {
    const p = fp("vampire", "thrall-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(3); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual([]);
  });
  it("vampire-runner: MA8 ST3 AG2+ PA3+ AV8+ cost100000 skills:hypnotic gaze,regeneration,blood lust (2+)", () => {
    const p = fp("vampire", "vampire-runner")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(100_000);
    expect(norm(p.skills)).toEqual(norm(["Hypnotic Gaze", "Regeneration", "Blood Lust (2+)"]));
  });
  it("vampire-thrower: MA6 ST4 AG2+ PA2+ AV9+ cost110000 skills:hypnotic gaze,pass,regeneration,blood lust (2+)", () => {
    const p = fp("vampire", "vampire-thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(4); expect(p.ag).toBe("2+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Hypnotic Gaze", "Pass", "Regeneration", "Blood Lust (2+)"]));
  });
  it("vampire-blitzer: MA6 ST4 AG2+ PA4+ AV9+ cost110000 skills:juggernaut,hypnotic gaze,regeneration,blood lust (3+)", () => {
    const p = fp("vampire", "vampire-blitzer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(4); expect(p.ag).toBe("2+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("9+"); expect(p.cost).toBe(110_000);
    expect(norm(p.skills)).toEqual(norm(["Juggernaut", "Hypnotic Gaze", "Regeneration", "Blood Lust (3+)"]));
  });
  it("vargheist: MA5 ST5 AG4+ PA6+ AV10+ cost150000", () => {
    const p = fp("vampire", "vargheist")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("6+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(150_000);
    expect(norm(p.skills)).toEqual(norm(["Frenzy", "Claws", "Regeneration", "Blood Lust (3+)", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — black-orc positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("black-orc exists, rerollCost 60000", () => { const r = getRaceById("black-orc")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(60_000); });
  it("goblin-bruiser: MA6 ST2 AG3+ PA4+ AV8+ cost45000 skills:thick skull,right stuff,dodge,titchy", () => {
    const p = fp("black-orc", "goblin-bruiser")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(45_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Right Stuff", "Dodge", "Titchy"]));
  });
  it("black-orc-blocker: MA4 ST4 AG4+ PA5+ AV10+ cost90000 skills:grab,brawler", () => {
    const p = fp("black-orc", "black-orc-blocker")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(4); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Grab", "Brawler"]));
  });
  it("black-orc trained-troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("black-orc", "trained-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — goblin positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("goblin exists, rerollCost 80000", () => { const r = getRaceById("goblin")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(80_000); });
  it("goblin-lineman: MA6 ST2 AG3+ PA4+ AV8+ cost40000 skills:dodge,right stuff,stunty,titchy", () => {
    const p = fp("goblin", "goblin-lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Stunty", "Titchy"]));
  });
  it("fanatic: MA3 ST7 AG3+ PA— AV8+ cost70000 skills:secret weapon,ball & chain,no hands,stunty", () => {
    const p = fp("goblin", "fanatic")!; expect(p).toBeDefined();
    expect(p.ma).toBe(3); expect(p.st).toBe(7); expect(p.ag).toBe("3+"); expect(p.pa).toBe("—"); expect(p.av).toBe("8+"); expect(p.cost).toBe(70_000);
    expect(norm(p.skills)).toEqual(norm(["Secret Weapon", "Ball & Chain", "No Hands", "Stunty"]));
  });
  it("loony: MA6 ST2 AG3+ PA— AV8+ cost40000 skills:secret weapon,stunty,no hands,chainsaw", () => {
    const p = fp("goblin", "loony")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("—"); expect(p.av).toBe("8+"); expect(p.cost).toBe(40_000);
    expect(norm(p.skills)).toEqual(norm(["Secret Weapon", "Stunty", "No Hands", "Chainsaw"]));
  });
  it("pogoer: MA7 ST2 AG3+ PA4+ AV8+ cost75000 skills:dodge,right stuff,pogo stick", () => {
    const p = fp("goblin", "pogoer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(75_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Right Stuff", "Pogo Stick"]));
  });
  it("bombardier: MA6 ST2 AG3+ PA4+ AV8+ cost45000 skills:secret weapon,bombardier,stunty,dodge", () => {
    const p = fp("goblin", "bombardier")!; expect(p).toBeDefined();
    expect(p.ma).toBe(6); expect(p.st).toBe(2); expect(p.ag).toBe("3+"); expect(p.pa).toBe("4+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(45_000);
    expect(norm(p.skills)).toEqual(norm(["Secret Weapon", "Bombardier", "Stunty", "Dodge"]));
  });
  it("goblin trained-troll: MA4 ST5 AG5+ PA5+ AV10+ cost115000", () => {
    const p = fp("goblin", "trained-troll")!; expect(p).toBeDefined();
    expect(p.ma).toBe(4); expect(p.st).toBe(5); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(115_000);
    expect(norm(p.skills)).toEqual(norm(["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — wood-elf positionals", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("wood-elf exists, rerollCost 50000", () => { const r = getRaceById("wood-elf")!; expect(r).toBeDefined(); expect(r.rerollCost).toBe(50_000); });
  it("wood-elf lineman: MA7 ST3 AG2+ PA3+ AV8+ cost65000 skills:none", () => {
    const p = fp("wood-elf", "lineman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(65_000);
    expect(norm(p.skills)).toEqual([]);
  });
  it("wood-elf thrower: MA7 ST3 AG2+ PA2+ AV8+ cost85000 skills:pass,pro", () => {
    const p = fp("wood-elf", "thrower")!; expect(p).toBeDefined();
    expect(p.ma).toBe(7); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("2+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(85_000);
    expect(norm(p.skills)).toEqual(norm(["Pass", "Pro"]));
  });
  it("wood-elf catcher: MA8 ST2 AG2+ PA3+ AV8+ cost90000 skills:catch,sprint,dodge", () => {
    const p = fp("wood-elf", "catcher")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(2); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(90_000);
    expect(norm(p.skills)).toEqual(norm(["Catch", "Sprint", "Dodge"]));
  });
  it("wardancer: MA8 ST3 AG2+ PA3+ AV8+ cost130000 skills:dodge,block,leap", () => {
    const p = fp("wood-elf", "wardancer")!; expect(p).toBeDefined();
    expect(p.ma).toBe(8); expect(p.st).toBe(3); expect(p.ag).toBe("2+"); expect(p.pa).toBe("3+"); expect(p.av).toBe("8+"); expect(p.cost).toBe(130_000);
    expect(norm(p.skills)).toEqual(norm(["Dodge", "Block", "Leap"]));
  });
  it("wood-elf treeman: MA2 ST6 AG5+ PA5+ AV11+ cost120000", () => {
    const p = fp("wood-elf", "treeman")!; expect(p).toBeDefined();
    expect(p.ma).toBe(2); expect(p.st).toBe(6); expect(p.ag).toBe("5+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("11+"); expect(p.cost).toBe(120_000);
    expect(norm(p.skills)).toEqual(norm(["Strong Arm", "Thick Skull", "Take Root", "Mighty Blow (+1)", "Throw Team-mate", "Stand Firm", "Loner (4+)"]));
  });
});

describe("REQ-RACE-04: Exhaustive parity — human ogre (completing human coverage)", () => {
  function norm(s: string[]): string[] { return s.map(x => skillRefToId(x.trim())).sort(); }
  function fp(raceId: string, key: string) { return getRaceById(raceId)?.positionals.find(p => p.key === key); }

  it("human ogre: MA5 ST5 AG4+ PA5+ AV10+ cost140000", () => {
    const p = fp("human", "ogre")!; expect(p).toBeDefined();
    expect(p.ma).toBe(5); expect(p.st).toBe(5); expect(p.ag).toBe("4+"); expect(p.pa).toBe("5+"); expect(p.av).toBe("10+"); expect(p.cost).toBe(140_000);
    expect(norm(p.skills)).toEqual(norm(["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"]));
  });
});
