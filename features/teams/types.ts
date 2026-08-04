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
  /** Display names of starting skills */
  skills: string[];
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
  id: number;
  name: string;
  raceId: string;
  roster: PlayerEntry[];
}
