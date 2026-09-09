/**
 * BB2025 COMMON inducement catalog + rules (IND-1/IND-2/IND-3/IND-5) — a pure,
 * client-safe module mirroring `lib/rules/winnings.ts` (no DB imports, no side
 * effects). It is the SINGLE source of truth for:
 *
 *  - the 16-entry common-inducement catalog (prices/limits from the IND-1
 *    table — never duplicated anywhere else);
 *  - the `raceId → special-rule[]` vocabulary (IND-5) that gates eligibility
 *    and cost overrides;
 *  - effective cost, eligibility, the lower-TV budget split (IND-2) and cart
 *    validation (IND-3).
 *
 * Deferred (follow-ups): Star Players (the `star-player-*` id namespace is
 * reserved); the per-race `wizard` type variants and the definitive
 * `no-apothecary` race set (IND-5 verification debt — see NO_APOTHECARY_RACES).
 */

import { getRaceById } from "@/features/teams/data/races";
import { computeCoachingCost, computeRosterCostFromPlayers } from "@/features/teams/roster";
import {
  DEFAULT_COACHING,
  isCoachingStaff,
  type PlayerEntry,
} from "@/features/teams/types";

/** A special rule id from the BB2025 inducement vocabulary (IND-5).
 * `apothecary-eligible` is implicit ("eligible unless the race carries
 * no-apothecary" — see NO_APOTHECARY_RACES); `wizard-type` is the reserved
 * marker for the DEFERRED per-race wizard variants (the base 150k wizard is
 * purchasable by every race today). */
export type RuleId =
  | "bribery-and-corruption"
  | "low-cost-linemen"
  | "favoured-of-nurgle"
  | "masters-of-undeath"
  | "halfling-chef"
  | "apothecary-eligible"
  | "wizard-type";

/** Stable kebab-case catalog ids (IND-1). `mercenaries` is RESERVED: the entry
 * exists so lookup/list are complete, but it is never purchasable (dynamic
 * cost — follow-up). Star players reserve the `star-player-*` namespace. */
export type InducementId =
  | "prayers-to-nuffle"
  | "temporary-cheerleaders"
  | "assistant-coaches"
  | "team-mascot"
  | "weather-mage"
  | "bloodweiser-kegs"
  | "bribes"
  | "extra-training"
  | "wandering-apothecary"
  | "mortuary-assistant"
  | "plague-doctor"
  | "fierce-innocents"
  | "halfling-master-chef"
  | "wizard"
  | "biased-referee"
  | "mercenaries";

/** One purchasable (or reserved) inducement entry (IND-1). */
export interface InducementEntry {
  id: InducementId;
  /** Spanish display name (IND-4 resolves snapshots from here at close time). */
  displayName: string;
  /** Standard base cost in gold. */
  costGp: number;
  /** Purchase limit per match. */
  maxPerMatch: number;
  /** Rule gate; absent = any race may buy the entry. */
  eligibility?: RuleId;
  /** Per-rule price overrides keyed by special-rule id (IND-1/IND-5). */
  costOverrides?: Partial<Record<RuleId, number>>;
  /** TRUE for mercenaries ONLY: the price is dynamic (base player cost + 30k
   * surcharge + optional 50k skill) and the entry is EXCLUDED from purchase
   * (reserved id, follow-up). */
  dynamicCost?: boolean;
}

/** One cart line: a catalog id + how many of it. */
export interface InducementCartItem {
  id: string;
  count: number;
}

/** The persisted/DTO per-side cart shape (`LiveMatch.inducements`, LM-30). */
export interface PersistedInducements {
  home: InducementCartItem[];
  away: InducementCartItem[];
}

/** The catalog — all 16 common-inducement entries of the IND-1 table. Prices
 * and limits are pinned to that table; do not invent new values here. */
export const COMMON_INDUCEMENTS: readonly InducementEntry[] = [
  { id: "prayers-to-nuffle", displayName: "Plegarias a Nuffle", costGp: 10_000, maxPerMatch: 3 },
  { id: "temporary-cheerleaders", displayName: "Animadoras temporales", costGp: 5_000, maxPerMatch: 5 },
  { id: "assistant-coaches", displayName: "Ayudantes de Entrenador", costGp: 20_000, maxPerMatch: 5 },
  { id: "team-mascot", displayName: "Mascota del Equipo", costGp: 25_000, maxPerMatch: 1 },
  { id: "weather-mage", displayName: "Mago del Clima", costGp: 25_000, maxPerMatch: 1 },
  { id: "bloodweiser-kegs", displayName: "Barriles de Bloodweiser", costGp: 50_000, maxPerMatch: 2 },
  {
    id: "bribes",
    displayName: "Sobornos",
    costGp: 100_000,
    maxPerMatch: 3,
    costOverrides: { "bribery-and-corruption": 50_000 },
  },
  { id: "extra-training", displayName: "Entrenamiento Adicional", costGp: 100_000, maxPerMatch: 8 },
  {
    id: "wandering-apothecary",
    displayName: "Apotecario Ambulante",
    costGp: 100_000,
    maxPerMatch: 2,
    eligibility: "apothecary-eligible",
  },
  {
    id: "mortuary-assistant",
    displayName: "Asistente de Morgue",
    costGp: 100_000,
    maxPerMatch: 1,
    eligibility: "masters-of-undeath",
  },
  {
    id: "plague-doctor",
    displayName: "Médico de la Peste",
    costGp: 100_000,
    maxPerMatch: 1,
    eligibility: "favoured-of-nurgle",
  },
  {
    id: "fierce-innocents",
    displayName: "Novatos Embravecidos",
    costGp: 150_000,
    maxPerMatch: 1,
    eligibility: "low-cost-linemen",
  },
  {
    id: "halfling-master-chef",
    displayName: "Chef Master Halfling",
    costGp: 300_000,
    maxPerMatch: 1,
    costOverrides: { "halfling-chef": 100_000 },
  },
  {
    id: "wizard",
    displayName: "Mago",
    costGp: 150_000,
    maxPerMatch: 1,
    // IND-5 verification debt: the per-race wizard TYPE variants are deferred.
    // Today the base 150k wizard is purchasable by every race; the reserved
    // `wizard-type` rule id marks where the per-race variants will gate.
  },
  {
    id: "biased-referee",
    displayName: "Árbitro Sobornado",
    costGp: 120_000,
    maxPerMatch: 1,
    costOverrides: { "bribery-and-corruption": 80_000 },
  },
  {
    id: "mercenaries",
    displayName: "Mercenarios",
    // The 30k surcharge on top of the hired player's base cost. RESERVED: the
    // dynamic price breaks the costOverrides model, so mercenaries are never
    // purchasable in this catalog (follow-up change).
    costGp: 30_000,
    maxPerMatch: 3,
    dynamicCost: true,
  },
];

/** The `raceId → special-rule[]` map (IND-5) — the single source of truth the
 * IND-1 eligibility + costOverrides resolve against. The roster catalog does
 * NOT model inducement rules; this map owns the vocabulary. */
export const RACE_SPECIAL_RULES: Readonly<Record<string, readonly RuleId[]>> = {
  goblin: ["bribery-and-corruption", "low-cost-linemen"],
  snotling: ["bribery-and-corruption"],
  "underworld-denizens": ["bribery-and-corruption"],
  halfling: ["low-cost-linemen", "halfling-chef"],
  ogre: ["low-cost-linemen"],
  nurgle: ["favoured-of-nurgle"],
  "shambling-undead": ["masters-of-undeath"],
  "necromantic-horror": ["masters-of-undeath"],
};

/** Races whose roster cannot include an apothecary → the WANDERING apothecary
 * inducement is ineligible for them (IND-5: "eligible unless no-apothecary").
 * IND-5 VERIFICATION DEBT: the definitive BB2025 set is PENDING rules
 * confirmation — empty today (every race eligible), MUST be finalised before
 * the purchase UI ships. */
export const NO_APOTHECARY_RACES: ReadonlySet<string> = new Set<string>();

/** The special rules a race carries (IND-5); an unknown/rule-less race yields
 * an empty list. Implicit rules (apothecary-eligible / wizard-type) are NOT in
 * the map — see isEligible. */
export function raceRules(raceId: string): readonly RuleId[] {
  return RACE_SPECIAL_RULES[raceId] ?? [];
}

/** Looks an entry up by id; undefined for an id absent from the catalog. The
 * reserved `mercenaries` entry IS returned (it exists in the catalog) — use
 * `validateCart` to enforce the purchasable-only rule. */
export function getInducement(id: string): InducementEntry | undefined {
  return COMMON_INDUCEMENTS.find((entry) => entry.id === id);
}

/** The PURCHASABLE catalog (excludes the reserved dynamic-cost mercenaries) —
 * what the purchase UI offers and the store validates against. */
export function listInducements(): readonly InducementEntry[] {
  return COMMON_INDUCEMENTS.filter((entry) => !entry.dynamicCost);
}

/** The entry's effective cost for a race: the per-rule override when the race
 * carries that rule, else the base cost (IND-1 costOverrides). */
export function effectiveCost(entry: InducementEntry, raceId: string): number {
  if (entry.costOverrides) {
    const rules = raceRules(raceId);
    for (const [ruleId, cost] of Object.entries(entry.costOverrides) as [RuleId, number][]) {
      if (rules.includes(ruleId)) return cost;
    }
  }
  return entry.costGp;
}

/** Whether the race may buy the entry. Rule-gated entries require the race to
 * carry the rule (IND-5); `apothecary-eligible` is the implicit "eligible
 * unless the race carries no-apothecary" rule (NO_APOTHECARY_RACES, pending). */
export function isEligible(entry: InducementEntry, raceId: string): boolean {
  if (!entry.eligibility) return true;
  if (entry.eligibility === "apothecary-eligible") {
    return !NO_APOTHECARY_RACES.has(raceId);
  }
  return raceRules(raceId).includes(entry.eligibility);
}

/** Reserved per-race purchase-limit overrides (e.g. a future B&C-style higher
 * bribe cap). EMPTY today — the catalog's `maxPerMatch` is authoritative
 * (IND-1); the map reserves the seam for a follow-up that adds per-race caps. */
const RACE_MAX_OVERRIDES: Readonly<Record<string, Partial<Record<InducementId, number>>>> = {};

/** The max copies of an entry a race may buy (IND-1 maxPerMatch, unless a
 * per-race override exists — none do in the initial catalog). */
export function maxAllowed(entry: InducementEntry, raceId: string): number {
  return RACE_MAX_OVERRIDES[raceId]?.[entry.id] ?? entry.maxPerMatch;
}

/** The inducement budget split (IND-2): the |ΔTV| budget belongs to the
 * lower-TV side ONLY; equal TVs give both sides 0. */
export function budgetForSide(homeTv: number, awayTv: number):
  | { side: "home"; budget: number }
  | { side: "away"; budget: number }
  | { side: null; budget: 0 } {
  if (homeTv === awayTv) return { side: null, budget: 0 };
  if (homeTv > awayTv) return { side: "away", budget: homeTv - awayTv };
  return { side: "home", budget: awayTv - homeTv };
}

/** Validates a purchase cart (IND-3): every id exists and is purchasable, no
 * count exceeds maxPerMatch, rule-gated ids are race-eligible and the Σ
 * effective cost fits the budget. Replace-cart semantics — `ok:true` echoes the
 * normalized cart lines (an EMPTY list is valid: it clears the side's cart). */
export function validateCart(input: {
  items: readonly InducementCartItem[];
  raceId: string;
  budget: number;
}): { ok: true; cart: InducementCartItem[] } | { ok: false; error: string } {
  const entries = new Map<string, InducementCartItem>();
  for (const item of input.items) {
    const existing = entries.get(item.id);
    if (existing) {
      entries.set(item.id, { id: item.id, count: existing.count + item.count });
    } else {
      entries.set(item.id, item);
    }
  }

  let total = 0;
  for (const item of entries.values()) {
    const entry = getInducement(item.id);
    if (!entry) return { ok: false, error: `unknown inducement: ${item.id}` };
    if (entry.dynamicCost) {
      return { ok: false, error: `${item.id} is not purchasable (dynamic cost)` };
    }
    if (!Number.isInteger(item.count) || item.count < 1) {
      return { ok: false, error: `invalid count for ${item.id}` };
    }
    if (item.count > entry.maxPerMatch) {
      return { ok: false, error: `${item.id} exceeds the max ${entry.maxPerMatch} per match` };
    }
    if (!isEligible(entry, input.raceId)) {
      return { ok: false, error: `${item.id} is not eligible for race ${input.raceId}` };
    }
    total += effectiveCost(entry, input.raceId) * item.count;
  }
  if (total > input.budget) {
    return { ok: false, error: `cart costs ${total} over the ${input.budget} budget` };
  }
  return { ok: true, cart: Array.from(entries.values()) };
}

/** Defensively parses a persisted `LiveMatch.inducements` JSON value (LM-30):
 * malformed/foreign shapes collapse to null (never crash); a well-formed value
 * always yields both sides' arrays (empty when a side never purchased). */
export function parsePersistedInducements(value: unknown): PersistedInducements | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const side = (candidate: unknown): InducementCartItem[] | null => {
    if (!Array.isArray(candidate)) return null;
    const items: InducementCartItem[] = [];
    for (const item of candidate) {
      if (typeof item !== "object" || item === null) return null;
      const line = item as Record<string, unknown>;
      if (typeof line.id !== "string" || typeof line.count !== "number") return null;
      items.push({ id: line.id, count: line.count });
    }
    return items;
  };
  const home = side(raw.home);
  const away = side(raw.away);
  if (home === null || away === null) return null;
  return { home, away };
}

/** The default (empty) persisted shape — no cart on either side. */
export function emptyPersistedInducements(): PersistedInducements {
  return { home: [], away: [] };
}

/** The Σ effective cost of a cart for a race (IND-3): every line's effective
 * cost × count. Unknown/reserved (dynamic-cost) ids are skipped defensively —
 * the catalog never offers them and the purchase command rejects them; this is
 * a display-side total over purchasable entries only. */
export function cartCost(items: readonly InducementCartItem[], raceId: string): number {
  return items.reduce((total, item) => {
    const entry = getInducement(item.id);
    return total + (entry && !entry.dynamicCost ? effectiveCost(entry, raceId) * item.count : 0);
  }, 0);
}

/**
 * The raw team-row surface the server TV derivation reads (IND-2): the race,
 * the roster JSON, the coaching JSON and the players' value bonuses. Shared by
 * the purchase command (`lib/liveStore.ts`) and the fixture-GET budget
 * derivation (`inducementBudgetOf`) so both derive the SAME team values.
 */
export interface InducementTeamRow {
  raceId: string;
  roster: unknown;
  coaching: unknown;
  players: readonly { valueBonus: number }[];
}

/**
 * The |ΔTV| purchase-budget split for a pair of teams (IND-2): which side is
 * the LOWER-TV side (the only one that may buy) and what budget it receives.
 * Exposed on the ready-phase view so the purchase UI can gate/show the step
 * without trusting client-supplied TV (the command re-derives and enforces it).
 */
export type InducementBudget =
  | { side: "home"; budget: number }
  | { side: "away"; budget: number }
  | { side: null; budget: 0 };

/**
 * Server-derived eligible-side + budget for the ready-phase purchase step.
 * Mirrors the store's `raceTvParts` + `computeTeamTv` + `budgetForSide`
 * derivation over the PERSISTED team rows (never client input, IND-2): roster
 * base cost via the race positionals, coaching-staff cost, and the tracked
 * skill value bonuses. Unknown/missing race data yields zero parts.
 */
export function inducementBudgetOf(
  home: InducementTeamRow,
  away: InducementTeamRow,
): InducementBudget {
  const tvOf = (team: InducementTeamRow): number => {
    const race = getRaceById(team.raceId);
    const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
    const valueBonus = (team.players ?? []).reduce((total, p) => total + (p.valueBonus ?? 0), 0);
    if (!race) return valueBonus;
    const coaching = isCoachingStaff(team.coaching) ? team.coaching : DEFAULT_COACHING;
    return (
      computeRosterCostFromPlayers(race, roster) +
      computeCoachingCost(race, coaching) +
      valueBonus
    );
  };
  return budgetForSide(tvOf(home), tvOf(away));
}
