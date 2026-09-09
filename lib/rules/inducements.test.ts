import { describe, expect, it } from "vitest";
import {
  COMMON_INDUCEMENTS,
  RACE_SPECIAL_RULES,
  budgetForSide,
  cartCost,
  effectiveCost,
  getInducement,
  inducementBudgetOf,
  isEligible,
  listInducements,
  maxAllowed,
  raceRules,
  validateCart,
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
    // human: no overrides → bribes 100k + wizard 150k = 250k.
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
