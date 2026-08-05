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

export interface Team {
  id: string;
  name: string;
  raceId: string;
  roster: PlayerEntry[];
}
