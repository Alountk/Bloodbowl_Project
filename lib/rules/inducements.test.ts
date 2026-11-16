import { describe, expect, it } from "vitest";
import {
  COMMON_INDUCEMENTS,
  PRAYERS_OF_NUFFLE,
  RACE_SPECIAL_RULES,
  activePrayersFromRolls,
  budgetForSide,
  cartCost,
  crowdSppException,
  effectiveCost,
  foulSppException,
  getInducement,
  inducementBudgetOf,
  inducementByDisplayName,
  isEligible,
  listInducements,
  maxAllowed,
  raceRules,
  resolvePrayerRoll,
  validateCart,
  type ActivePrayers,
  type InducementCartItem,
} from "./inducements";

/**
 * Pure-module tests for the BB2025 COMMON inducement catalog + rules
 * (IND-1/IND-2/IND-3/IND-5). The catalog is the single source of truth: no
 * cost is duplicated elsewhere and every cost below comes from the IND-1 table.
 */

/** The 15 PURCHASABLE entries (mercenaries is reserved, never purchasable). */
const PURCHASABLE_IDS = [
  "prayers-to-nuffle",
  "temporary-cheerleaders",
  "assistant-coaches",
  "team-mascot",
  "weather-mage",
  "bloodweiser-kegs",
  "bribes",
  "extra-training",
  "wandering-apothecary",
  "mortuary-assistant",
  "plague-doctor",
  "fierce-innocents",
  "halfling-master-chef",
  "wizard",
  "biased-referee",
];

describe("COMMON_INDUCEMENTS catalog (IND-1)", () => {
  it("exposes the 16 BB2025 common inducement entries of the IND-1 table", () => {
    expect(COMMON_INDUCEMENTS).toHaveLength(16);
    const ids = COMMON_INDUCEMENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps `mercenaries` reserved — present in the catalog, flagged dynamic, never purchasable", () => {
    const mercenaries = getInducement("mercenaries");
    expect(mercenaries).toBeDefined();
    expect(mercenaries?.dynamicCost).toBe(true);
    // The purchasable list is the catalog minus the reserved dynamic entry.
    const purchasable = listInducements();
    expect(purchasable).toHaveLength(PURCHASABLE_IDS.length);
    expect(purchasable.map((e) => e.id).sort()).toEqual([...PURCHASABLE_IDS].sort());
    expect(purchasable.some((e) => e.id === "mercenaries")).toBe(false);
  });

  it("looks a valid entry up by id with its displayName, costGp and maxPerMatch", () => {
    const bribes = getInducement("bribes");
    expect(bribes?.displayName).toBe("Sobornos");
    expect(bribes?.costGp).toBe(100_000);
    expect(bribes?.maxPerMatch).toBe(3);
    expect(getInducement("wizard")?.displayName).toBe("Mago");
    expect(getInducement("wizard")?.costGp).toBe(150_000);
  });

  it("returns undefined for an unknown id without throwing", () => {
    expect(getInducement("star-player-griff-oberwald")).toBeUndefined();
    expect(getInducement("cheese")).toBeUndefined();
  });

  it("marks the rule-gated entries with their eligibility rule", () => {
    expect(getInducement("wandering-apothecary")?.eligibility).toBe("apothecary-eligible");
    expect(getInducement("mortuary-assistant")?.eligibility).toBe("masters-of-undeath");
    expect(getInducement("plague-doctor")?.eligibility).toBe("favoured-of-nurgle");
    expect(getInducement("fierce-innocents")?.eligibility).toBe("low-cost-linemen");
    expect(getInducement("bribes")?.eligibility).toBeUndefined();
  });

  it("keeps the maxPerMatch limits of the IND-1 table", () => {
    expect(getInducement("prayers-to-nuffle")?.maxPerMatch).toBe(3);
    expect(getInducement("temporary-cheerleaders")?.maxPerMatch).toBe(5);
    expect(getInducement("bloodweiser-kegs")?.maxPerMatch).toBe(2);
    expect(getInducement("extra-training")?.maxPerMatch).toBe(8);
    expect(getInducement("halfling-master-chef")?.maxPerMatch).toBe(1);
  });
});

describe("price/max display fields (T3 — acta sheet)", () => {
  it("carries `price` and `max` on every catalog id", () => {
    for (const entry of COMMON_INDUCEMENTS) {
      expect(typeof entry.price).toBe("number");
      expect(typeof entry.max).toBe("number");
    }
    // getInducement returns them alongside displayName.
    const bribes = getInducement("bribes");
    expect(bribes?.displayName).toBe("Sobornos");
    expect(bribes?.price).toBe(100_000);
    expect(bribes?.max).toBe(3);
  });

  it("matches the INCENTIVOS COMUNES digest values (PDF p.150 / printed p.142)", () => {
    /** price/max per the digest table. The three «precio variable» entries
     * (Mago, Árbitro, mercenarios) keep the catalog's pinned standard prices;
     * their CAPS are digest values. */
    const digest: Record<string, [number, number]> = {
      "prayers-to-nuffle": [10_000, 3],
      "temporary-cheerleaders": [5_000, 5],
      "assistant-coaches": [20_000, 5],
      "team-mascot": [25_000, 1],
      "weather-mage": [25_000, 1],
      "bloodweiser-kegs": [50_000, 2],
      bribes: [100_000, 3],
      "extra-training": [100_000, 8],
      "wandering-apothecary": [100_000, 2],
      "mortuary-assistant": [100_000, 1],
      "plague-doctor": [100_000, 1],
      "fierce-innocents": [150_000, 1],
      "halfling-master-chef": [300_000, 1],
      wizard: [150_000, 1],
      "biased-referee": [120_000, 1],
      mercenaries: [30_000, 3],
    };
    for (const entry of COMMON_INDUCEMENTS) {
      expect([entry.price, entry.max]).toEqual(digest[entry.id]);
    }
    // T3 spot values.
    expect([getInducement("bribes")?.price, getInducement("bribes")?.max]).toEqual([100_000, 3]);
    expect([getInducement("bloodweiser-kegs")?.price, getInducement("bloodweiser-kegs")?.max]).toEqual([50_000, 2]);
    expect([getInducement("weather-mage")?.price, getInducement("weather-mage")?.max]).toEqual([25_000, 1]);
    expect([getInducement("prayers-to-nuffle")?.price, getInducement("prayers-to-nuffle")?.max]).toEqual([10_000, 3]);
  });

  it("resolves an entry by its display name (the acta header receives names, not ids)", () => {
    expect(inducementByDisplayName("Sobornos")?.id).toBe("bribes");
    expect(inducementByDisplayName("Barriles de Bloodweiser")?.price).toBe(50_000);
    expect(inducementByDisplayName("Mago del Clima")?.max).toBe(1);
    expect(inducementByDisplayName("Queso con moho")).toBeUndefined();
  });
});

describe("race special rules (IND-5)", () => {
  it("maps each race to its inducement special rules", () => {
    expect(raceRules("goblin")).toEqual(
      expect.arrayContaining(["bribery-and-corruption", "low-cost-linemen"]),
    );
    expect(raceRules("snotling")).toEqual(["bribery-and-corruption"]);
    expect(raceRules("underworld-denizens")).toEqual(["bribery-and-corruption"]);
    expect(raceRules("halfling")).toEqual(
      expect.arrayContaining(["low-cost-linemen", "halfling-chef"]),
    );
    expect(raceRules("ogre")).toEqual(["low-cost-linemen"]);
    expect(raceRules("nurgle")).toEqual(["favoured-of-nurgle"]);
    expect(raceRules("shambling-undead")).toEqual(["masters-of-undeath"]);
    expect(raceRules("necromantic-horror")).toEqual(["masters-of-undeath"]);
  });

  it("returns an empty rule set for a race without inducement special rules", () => {
    expect(raceRules("orc")).toEqual([]);
    expect(raceRules("human")).toEqual([]);
  });

  it("shares the vocabulary with the catalog via RACE_SPECIAL_RULES", () => {
    const races = Object.keys(RACE_SPECIAL_RULES);
    for (const race of races) {
      for (const rule of RACE_SPECIAL_RULES[race]) {
        expect(
          COMMON_INDUCEMENTS.some((e) => e.eligibility === rule || e.costOverrides?.[rule] !== undefined),
        ).toBe(true);
      }
    }
  });
});

describe("effectiveCost (IND-1 costOverrides)", () => {
  it("applies the bribery-and-corruption override to bribes for goblins", () => {
    expect(effectiveCost(getInducement("bribes")!, "goblin")).toBe(50_000);
  });

  it("keeps the base cost when the race has no matching rule", () => {
    expect(effectiveCost(getInducement("bribes")!, "orc")).toBe(100_000);
  });

  it("applies the bribery-and-corruption override to the biased referee for snotlings", () => {
    expect(effectiveCost(getInducement("biased-referee")!, "snotling")).toBe(80_000);
    expect(effectiveCost(getInducement("biased-referee")!, "orc")).toBe(120_000);
  });

  it("applies the halfling-chef override only to halflings", () => {
    expect(effectiveCost(getInducement("halfling-master-chef")!, "halfling")).toBe(100_000);
    expect(effectiveCost(getInducement("halfling-master-chef")!, "orc")).toBe(300_000);
  });

  it("returns the base cost for entries without overrides on any race", () => {
    for (const race of ["orc", "goblin", "nurgle", "halfling"]) {
      expect(effectiveCost(getInducement("wizard")!, race)).toBe(150_000);
      expect(effectiveCost(getInducement("extra-training")!, race)).toBe(100_000);
    }
  });
});

describe("isEligible (IND-5)", () => {
  it("allows a rule-gated entry only for races carrying that rule", () => {
    const plagueDoctor = getInducement("plague-doctor")!;
    expect(isEligible(plagueDoctor, "nurgle")).toBe(true);
    expect(isEligible(plagueDoctor, "orc")).toBe(false);
    const mortuaryAssistant = getInducement("mortuary-assistant")!;
    expect(isEligible(mortuaryAssistant, "shambling-undead")).toBe(true);
    expect(isEligible(mortuaryAssistant, "necromantic-horror")).toBe(true);
    expect(isEligible(mortuaryAssistant, "orc")).toBe(false);
    const innocents = getInducement("fierce-innocents")!;
    expect(isEligible(innocents, "halfling")).toBe(true);
    expect(isEligible(innocents, "goblin")).toBe(true);
    expect(isEligible(innocents, "ogre")).toBe(true);
    expect(isEligible(innocents, "orc")).toBe(false);
  });

  it("allows un-gated entries for every race", () => {
    const wizard = getInducement("wizard")!;
    for (const race of ["orc", "goblin", "nurgle", "human"]) {
      expect(isEligible(wizard, race)).toBe(true);
    }
  });

  it("models apothecary-eligible as eligible unless the race carries no-apothecary", () => {
    // The definitive NO_APOTHECARY_RACES set is verification debt (IND-5): it
    // is EMPTY today, so the wandering apothecary is eligible for every race.
    const apothecary = getInducement("wandering-apothecary")!;
    for (const race of ["orc", "human", "shambling-undead", "necromantic-horror"]) {
      expect(isEligible(apothecary, race)).toBe(true);
    }
  });
});

describe("budgetForSide (IND-2)", () => {
  it("awards the budget to the lower-TV side (|ΔTV|)", () => {
    expect(budgetForSide(1_200_000, 1_050_000)).toEqual({ side: "away", budget: 150_000 });
    expect(budgetForSide(950_000, 1_100_000)).toEqual({ side: "home", budget: 150_000 });
  });

  it("gives equal-TV matches a zero budget for both sides", () => {
    expect(budgetForSide(1_050_000, 1_050_000)).toEqual({ side: null, budget: 0 });
  });
});

describe("inducementBudgetOf (S2 — server-derived eligible side for the ready purchase UI)", () => {
  /** A team row shaped like the fixture GET / store load: raceId + roster
   * (PlayerEntry[]) + coaching JSON + players (value bonuses). */
  const rosterEntry = (id: string, positionalKey: string) => ({ id, name: id, positionalKey });
  const teamRow = (
    raceId: string,
    positionalKeys: string[],
    coaching: Record<string, unknown>,
    valueBonus = 0,
  ) => ({
    raceId,
    roster: positionalKeys.map((key, i) => rosterEntry(`p${i}`, key)),
    coaching,
    players: [{ valueBonus }],
  });

  it("returns the lower-TV side with the |ΔTV| budget when away has the cheaper roster", () => {
    // Home: 4 dwarf blitzers (100k each) = 400k roster + 2×60k rerolls = 520k.
    const home = teamRow("dwarf", ["blitzer", "blitzer", "blitzer", "blitzer"], {
      rerolls: 2, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    // Away: 4 human linemen (50k each) = 200k roster + 0 staff → ΔTV 320k.
    const away = teamRow("human", ["lineman", "lineman", "lineman", "lineman"], {
      rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    expect(inducementBudgetOf(home, away)).toEqual({ side: "away", budget: 320_000 });
  });

  it("returns the home side when away is the richer team", () => {
    const home = teamRow("human", ["lineman", "lineman", "lineman", "lineman"], {
      rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    const away = teamRow("dwarf", ["blitzer", "blitzer", "blitzer", "blitzer"], {
      rerolls: 2, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    expect(inducementBudgetOf(home, away)).toEqual({ side: "home", budget: 320_000 });
  });

  it("counts coaching staff and value bonuses into the team value", () => {
    // Same roster both sides; away adds 3 assistant coaches (30k) + a +20k
    // value bonus → away is richer by 50k → home receives the budget.
    const base = ["lineman", "lineman", "lineman", "lineman"];
    const home = teamRow("human", base, {
      rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    const away = teamRow("human", base, {
      rerolls: 0, dedicatedFans: 1, assistantCoaches: 3, cheerleaders: 0, apothecary: false,
    }, 20_000);
    expect(inducementBudgetOf(home, away)).toEqual({ side: "home", budget: 50_000 });
  });

  it("returns a zero-budget null side when both teams are equal", () => {
    const both = teamRow("human", ["lineman", "lineman", "lineman", "lineman"], {
      rerolls: 1, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false,
    });
    expect(inducementBudgetOf(both, both)).toEqual({ side: null, budget: 0 });
  });
});

describe("maxAllowed (IND-1 limits)", () => {
  it("respects the entry's maxPerMatch for any race", () => {
    expect(maxAllowed(getInducement("bribes")!, "goblin")).toBe(3);
    expect(maxAllowed(getInducement("temporary-cheerleaders")!, "human")).toBe(5);
    expect(maxAllowed(getInducement("team-mascot")!, "orc")).toBe(1);
  });
});

describe("cartCost (S2 — display-side Σ of the ready purchase cart)", () => {
  const item = (id: string, count: number): InducementCartItem => ({ id, count });

  it("sums effective cost × count per line", () => {
    // human: no overrides → 2× bribes (100k each) + wizard 150k = 350k.
    expect(cartCost([item("bribes", 2), item("wizard", 1)], "human")).toBe(350_000);
  });

  it("uses the race's EFFECTIVE cost (rule override) not the base cost", () => {
    // goblin carries bribery-and-corruption → bribes cost 50k each, not 100k.
    expect(cartCost([item("bribes", 2)], "goblin")).toBe(100_000);
  });

  it("skips unknown or reserved ids defensively", () => {
    expect(cartCost([item("not-an-inducement", 1), item("mercenaries", 1)], "human")).toBe(0);
  });
});

describe("validateCart (IND-3)", () => {
  const item = (id: string, count: number): InducementCartItem => ({ id, count });

  it("accepts an eligible cart whose effective cost fits the budget", () => {
    const result = validateCart({
      items: [item("bribes", 3)],
      raceId: "goblin",
      budget: 150_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cart).toEqual([item("bribes", 3)]);
    }
  });

  it("accepts an empty cart (a purchase is replace-cart, so empty clears)", () => {
    expect(validateCart({ items: [], raceId: "orc", budget: 150_000 }).ok).toBe(true);
    expect(validateCart({ items: [], raceId: "orc", budget: 0 }).ok).toBe(true);
  });

  it("accepts a cart exactly at the budget boundary", () => {
    // wizard 150k over a goblin (B&C) budget of exactly 150k → at the boundary.
    const result = validateCart({ items: [item("wizard", 1)], raceId: "goblin", budget: 150_000 });
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown id with no mutation", () => {
    const result = validateCart({ items: [item("star-player-griff-oberwald", 1)], raceId: "orc", budget: 1_000_000 });
    expect(result.ok).toBe(false);
  });

  it("rejects the reserved dynamic-cost entry (mercenaries) as not purchasable", () => {
    const result = validateCart({ items: [item("mercenaries", 1)], raceId: "orc", budget: 1_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("mercenaries");
  });

  it("rejects a count above maxPerMatch", () => {
    expect(validateCart({ items: [item("bribes", 4)], raceId: "goblin", budget: 1_000_000 }).ok).toBe(false);
    expect(
      validateCart({ items: [item("temporary-cheerleaders", 6)], raceId: "orc", budget: 1_000_000 }).ok,
    ).toBe(false);
  });

  it("rejects a non-positive or fractional count", () => {
    expect(validateCart({ items: [item("bribes", 0)], raceId: "goblin", budget: 1_000_000 }).ok).toBe(false);
    expect(validateCart({ items: [item("bribes", -1)], raceId: "goblin", budget: 1_000_000 }).ok).toBe(false);
    expect(validateCart({ items: [item("bribes", 2.5)], raceId: "goblin", budget: 1_000_000 }).ok).toBe(false);
  });

  it("rejects a rule-gated entry for an ineligible race", () => {
    const result = validateCart({ items: [item("plague-doctor", 1)], raceId: "orc", budget: 1_000_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not eligible|race/i);
  });

  it("accepts the same rule-gated entry for an eligible race", () => {
    expect(validateCart({ items: [item("plague-doctor", 1)], raceId: "nurgle", budget: 150_000 }).ok).toBe(true);
  });

  it("rejects a cart whose Σ effective cost exceeds the budget", () => {
    // 2× extra-training at 100k each = 200k over a 150k budget (both within the
    // max-8 limit, so the budget check is the one that fires).
    const result = validateCart({ items: [item("extra-training", 2)], raceId: "orc", budget: 150_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/budget/i);
  });

  it("uses the EFFECTIVE (rule-discounted) cost against the budget", () => {
    // 3× bribes at the goblin 50k rate = 150k → fits; the base 100k would not.
    expect(validateCart({ items: [item("bribes", 3)], raceId: "goblin", budget: 150_000 }).ok).toBe(true);
    expect(validateCart({ items: [item("bribes", 3)], raceId: "orc", budget: 150_000 }).ok).toBe(false);
  });
});

/**
 * T25 (PR #415 follow-up): «Plegarias a Nuffle» (Prayers of Nuffle) — the
 * CONFIRMED SPP-affecting blessings extracted from the rulebook's Prayers of
 * Nuffle table (the OCR quotes are the authority): 10 «Pase perfecto», 11
 * «Recepciones deslumbrantes», 12 «Apoyo del público», 13 «¡Con faltas y a lo
 * loco!». The inducement is bought pre-match (10 000 GP, 0-3); ONE 1D16 roll
 * per prayer bought determines WHICH blessing (no repeats) and the effect
 * lasts the whole match. Only these four faces are confirmed — the rest of the
 * table was NOT extracted and must never be invented.
 */
describe("T25 · Prayers of Nuffle — the 1D16 blessing rows («Plegarias a Nuffle»)", () => {
  it("models exactly the four CONFIRMED rows, names verbatim from the rulebook table", () => {
    expect(PRAYERS_OF_NUFFLE.map((b) => [b.roll, b.id, b.displayName])).toEqual([
      [10, "perfect-pass", "Pase perfecto"],
      [11, "dazzling-catches", "Recepciones deslumbrantes"],
      [12, "crowd-support", "Apoyo del público"],
      [13, "foul-and-frenzy", "¡Con faltas y a lo loco!"],
    ]);
  });

  it("resolves the blessing keyed by the D16 result — and NOTHING for the unmodeled faces (never invents rows)", () => {
    for (const blessing of PRAYERS_OF_NUFFLE) {
      expect(resolvePrayerRoll(blessing.roll)).toBe(blessing);
    }
    for (const roll of [1, 2, 5, 9, 14, 15, 16, 0, 17, -1, 10.5]) {
      expect(resolvePrayerRoll(roll)).toBeNull();
    }
  });

  it("activePrayersFromRolls is ADDITIVE — every bought prayer's roll ADDS its blessing (the set is a list, never a single slot)", () => {
    expect(activePrayersFromRolls([10])).toEqual(["perfect-pass"]);
    expect(activePrayersFromRolls([10, 13])).toEqual(["perfect-pass", "foul-and-frenzy"]);
    // Stable table order whatever the roll order (all three blessings at once).
    expect(activePrayersFromRolls([13, 11, 12])).toEqual([
      "dazzling-catches",
      "crowd-support",
      "foul-and-frenzy",
    ]);
  });

  it("…deduplicates repeats (one roll per prayer bought, «sin repetidos») and ignores unmodeled faces", () => {
    expect(activePrayersFromRolls([11, 11, 10])).toEqual(["perfect-pass", "dazzling-catches"]);
    expect(activePrayersFromRolls([3, 9, 16])).toEqual([]);
    expect(activePrayersFromRolls([])).toEqual([]);
  });

  it("foulSppException is TRUE only for prayer 13 — the foul=0 default needs the blessing (skill-based foul SPP is NOT modeled: clean seam)", () => {
    const otherSets: ActivePrayers[] = [[], ["perfect-pass"], ["dazzling-catches"], ["crowd-support"]];
    expect(foulSppException(["foul-and-frenzy"])).toBe(true);
    expect(foulSppException(["foul-and-frenzy", "perfect-pass"])).toBe(true);
    for (const prayers of otherSets) {
      expect(foulSppException(prayers)).toBe(false);
    }
  });

  it("crowdSppException is TRUE only for prayer 12 («Apoyo del público») — the crowd=0 default needs the blessing", () => {
    const otherSets: ActivePrayers[] = [[], ["perfect-pass"], ["dazzling-catches"], ["foul-and-frenzy"]];
    expect(crowdSppException(["crowd-support"])).toBe(true);
    expect(crowdSppException(["crowd-support", "foul-and-frenzy"])).toBe(true);
    for (const prayers of otherSets) {
      expect(crowdSppException(prayers)).toBe(false);
    }
  });
});
