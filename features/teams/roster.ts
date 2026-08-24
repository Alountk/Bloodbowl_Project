import type { CoachingStaff, PlayerEntry, Race, Team } from "./types";
import { DEFAULT_LOCALE, t as translate, type Locale } from "@/lib/i18n/dictionaries";
import { isReadyToImprove } from "@/lib/rules/improvements";

export const STARTING_TREASURY = 1_000_000;
export const MIN_PLAYERS = 11;
export const MAX_PLAYERS = 16;

// Standard Blood Bowl 2025 coaching staff costs and limits (gold coins).
// Source: BP2025 core rulebook, "Drafting a Blood Bowl Team" (Sideline Staff / Dedicated Fans).
export const ASSISTANT_COACH_COST = 10_000;
export const ASSISTANT_COACH_MAX = 6;
export const CHEERLEADER_COST = 10_000;
export const CHEERLEADER_MAX = 6;
export const APOTHECARY_COST = 50_000;
export const MAX_REROLLS = 8;
export const DEDICATED_FANS_START = 1;
export const DEDICATED_FANS_MAX = 3;
export const DEDICATED_FAN_IMPROVEMENT_COST = 5_000;

export interface CoachingCostItem {
  /** Indexable field on CoachingStaff */
  key: "rerolls" | "dedicatedFans" | "assistantCoaches" | "cheerleaders";
  /** Unit cost in gold coins (per reroll / per staff member) */
  unitCost: number;
  /** Number currently purchased */
  quantity: number;
  /** Quantity * unitCost */
  total: number;
}

export function computeCoachingCostItems(race: Race, coaching: CoachingStaff): CoachingCostItem[] {
  const items: CoachingCostItem[] = [
    { key: "rerolls", unitCost: race.rerollCost, quantity: coaching.rerolls, total: 0 },
    { key: "dedicatedFans", unitCost: DEDICATED_FAN_IMPROVEMENT_COST, quantity: coaching.dedicatedFans, total: 0 },
    { key: "assistantCoaches", unitCost: ASSISTANT_COACH_COST, quantity: coaching.assistantCoaches, total: 0 },
    { key: "cheerleaders", unitCost: CHEERLEADER_COST, quantity: coaching.cheerleaders, total: 0 },
  ];
  for (const item of items) {
    // Dedicated Fans start at 1 automatically; only upgrades above the starting
    // characteristic cost gold (e.g. 1 -> 3 = two upgrades = 10k).
    const paid =
      item.key === "dedicatedFans" ? Math.max(0, item.quantity - DEDICATED_FANS_START) : item.quantity;
    item.total = paid * item.unitCost;
  }
  return items;
}

export function computeCoachingCost(race: Race, coaching: CoachingStaff): number {
  const items = computeCoachingCostItems(race, coaching);
  const staff = items.reduce((acc, item) => acc + item.total, 0);
  return staff + (coaching.apothecary ? APOTHECARY_COST : 0);
}

/** @deprecated Use computeRosterCostFromPlayers with PlayerEntry[] instead */
export type Quantities = Record<string, number>;

/** @deprecated Use computeRosterCostFromPlayers instead */
export function computeRosterCost(race: Race, quantities: Quantities): number {
  return race.positionals.reduce(
    (total, positional) =>
      total + (quantities[positional.key] ?? 0) * positional.cost,
    0,
  );
}

/** @deprecated Use countPlayersFromEntries instead */
export function countPlayers(quantities: Quantities): number {
  return Object.values(quantities).reduce((total, quantity) => total + quantity, 0);
}

/** @deprecated Use summarizeRosterFromEntries instead */
export function summarizeRoster(team: Team, races: Race[]): string {
  return summarizeRosterFromEntries(team, races);
}

// --- New PlayerEntry-based helpers ---

export function computeRosterCostFromPlayers(race: Race, players: PlayerEntry[]): number {
  return players.reduce((total, player) => {
    const positional = race.positionals.find((p) => p.key === player.positionalKey);
    return total + (positional?.cost ?? 0);
  }, 0);
}

/**
 * The roster cost of DRAFTED (non-hired) entries only. A journeyman hire
 * (RAU-52) pays the lineman cost in cash from the treasury and flags the entry
 * `hired: true`, so the spendable balance skips it to avoid charging twice;
 * CTV/wizard math (`computeRosterCostFromPlayers`) still counts every entry.
 */
export function computeDraftedRosterCost(race: Race, players: PlayerEntry[]): number {
  return computeRosterCostFromPlayers(
    race,
    players.filter((player) => !player.hired),
  );
}

/**
 * The team's CURRENT spendable gold: the drafting budget plus accumulated
 * winnings (`Team.treasury`), minus the current DRAFTED roster and coaching
 * costs.
 *
 * A RAU-11 hire lowers the balance automatically via the `rosterCost` growth
 * (the treasury is never touched). A journeyman hire (RAU-52) is paid IN CASH
 * from the treasury and flags the entry `hired: true` — the flag stops the
 * formula from counting that entry's cost AGAIN, so the balance drops exactly
 * once. Firing decrements the DB treasury by the fired player's cost (BB2025:
 * no refund), so this formula stays flat across a fire of a drafted player.
 */
export function computeSpendableBalance(
  team: Pick<Team, "startingTreasury" | "treasury" | "roster" | "coaching">,
  race: Race,
): number {
  return (
    // RAU-56: the base is the ruleset's starting treasury when the team was
    // created under one; legacy rows without the field fall back to 1M.
    (team.startingTreasury ?? STARTING_TREASURY) +
    team.treasury -
    computeDraftedRosterCost(race, team.roster) -
    computeCoachingCost(race, team.coaching)
  );
}

export function countPlayersFromEntries(players: PlayerEntry[]): number {
  return players.length;
}

/** The subset of progression a ready-to-improve check needs. */
interface ReadyProgressionSubset {
  pe: number;
  alive: boolean;
  improvements: number;
}

/**
 * Counts the roster players ready for their next improvement (alive with PE at
 * or above their next cheapest cost). Drives the card hint "X listos para
 * mejorar" — team-level, count only, never names individual players.
 */
export function countReadyToImprove(entries: readonly ReadyProgressionSubset[]): number {
  return entries.reduce(
    (total, entry) => total + (isReadyToImprove(entry) ? 1 : 0),
    0,
  );
}

export function summarizeRosterFromEntries(team: Team, races: Race[], locale: Locale = DEFAULT_LOCALE): string {
  const race = races.find((candidate) => candidate.id === team.raceId);
  const total = team.roster.length;

  if (total === 0) return translate(locale, "teams.summaryNone");

  // Count by positional key, preserving insertion order
  const counts = new Map<string, number>();
  for (const entry of team.roster) {
    counts.set(entry.positionalKey, (counts.get(entry.positionalKey) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [key, count] of counts) {
    const positional = race?.positionals.find((p) => p.key === key);
    parts.push(`${count}x ${positional?.name ?? key}`);
  }

  const countLabel = translate(locale, total === 1 ? "teams.summaryOne" : "teams.summaryMany", {
    count: total,
  });
  return `${countLabel}${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
}
