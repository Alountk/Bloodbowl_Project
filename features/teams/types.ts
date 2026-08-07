import type { SkillId } from "./data/skills";

export interface Positional {
  /** Unique within a race, e.g. "lineman" */
  key: string;
  /** Display name, e.g. "Lineman" */
  name: string;
  /** Role for UI grouping, e.g. "Lineman", "Blitzer", "Thrower" */
  role?: string;
  /** Cost in gold coins */
  cost: number;
  /** Maximum quantity allowed on a roster */
  max: number;
  /** Minimum roster quantity; defaults to 0 when absent; must never exceed max. */
  min?: number;
  /** Primary skill-access letters ⊆ {G,A,P,S,M,F}; [] renders "—". */
  accessPrimary: string[];
  /** Secondary skill-access letters ⊆ {G,A,P,S,M,F}; [] renders "—". */
  accessSecondary: string[];
  /** Movement Allowance (numeric) */
  ma: number;
  /** Strength (numeric) */
  st: number;
  /** Agility (roll target, "3+" style) */
  ag: string;
  /** Passing (roll target, "4+" style, "—" if unavailable) */
  pa: string;
  /** Armour Value ("8+" style) */
  av: string;
  /** Stable catalog ids of starting skills (see features/teams/data/skills.ts) */
  skills: SkillId[];
}

export interface Race {
  id: string;
  name: string;
  rerollCost: number;
  positionals: Positional[];
}

/** @deprecated Use PlayerEntry[] instead */
export interface RosterEntry {
  positionalKey: string;
  quantity: number;
}

export interface PlayerEntry {
  id: string;
  name: string;
  positionalKey: string;
}

export interface CoachingStaff {
  rerolls: number;
  dedicatedFans: number;
  assistantCoaches: number;
  cheerleaders: number;
  apothecary: boolean;
}

export const DEFAULT_COACHING: CoachingStaff = {
  rerolls: 0,
  // BB2025: a team always begins with a Dedicated Fans characteristic of 1.
  dedicatedFans: 1,
  assistantCoaches: 0,
  cheerleaders: 0,
  apothecary: false,
};

export type TeamLeagueType = "exhibition" | "open";
export const LEAGUE_TYPES: TeamLeagueType[] = ["exhibition", "open"];
export const DEFAULT_LEAGUE_TYPE: TeamLeagueType = "open";

export function isCoachingStaff(value: unknown): value is CoachingStaff {
  if (typeof value !== "object" || value === null) return false;
  const staff = value as Record<string, unknown>;
  return (
    typeof staff.rerolls === "number" &&
    typeof staff.dedicatedFans === "number" &&
    typeof staff.assistantCoaches === "number" &&
    typeof staff.cheerleaders === "number" &&
    typeof staff.apothecary === "boolean"
  );
}

export interface Team {
  id: string;
  name: string;
  raceId: string;
  roster: PlayerEntry[];
  coaching: CoachingStaff;
  leagueType: TeamLeagueType;
}
