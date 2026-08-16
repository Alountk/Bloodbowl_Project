/**
 * Pure kickoff-events module (LM-21/LM-22/LM-23): the pre-match "Expensive
 * Mistake" resolution against the full rulebook 6×6 matrix and the centered
 * fan-factor event. Everything is deterministic given server-owned dice
 * (lib/random.ts), so the module is zero-mock testable and the route never
 * trusts a client-supplied roll. `buildKickoffEvents` returns the three events
 * AND the treasury deltas in ONE resolution so the store can commit them in a
 * single transaction (LM-23 atomicity).
 */

export type KickoffBracket =
  | "100k-195k"
  | "200k-295k"
  | "300k-395k"
  | "400k-495k"
  | "500k-595k"
  | "600k+";

export type KickoffOutcome =
  | "crisis-evaded"
  | "minor-incident"
  | "serious-incident"
  | "catastrophe";

/** Maps a D6 roll to a D3 (1-2→1, 3-4→2, 5-6→3) for the fan factor and minor deductions. */
export function d6ToD3(roll: number): number {
  if (roll <= 2) return 1;
  if (roll <= 4) return 2;
  return 3;
}

/** Rounds DOWN to the nearest 5,000 (serious-incident treasury deduction). */
export function roundDownTo5k(n: number): number {
  return Math.floor(n / 5000) * 5000;
}

const BRACKET_ORDER: KickoffBracket[] = [
  "100k-195k",
  "200k-295k",
  "300k-395k",
  "400k-495k",
  "500k-595k",
  "600k+",
];

function bracketIndex(bracket: KickoffBracket): number {
  return BRACKET_ORDER.indexOf(bracket);
}

/**
 * The full rulebook Expensive-Mistake matrix: rows are the 1D6 roll, columns are
 * the treasury bracket (100k-195k … 600k+). Mapping per the product owner (LM-23):
 *   roll 1 → m m g g c c ; roll 2 → e m m g g c ; roll 3 → e e m m g g ;
 *   roll 4 → e e e m m g ; roll 5 → e e e e m m ; roll 6 → e e e e e m
 * (e = crisis-evaded, m = minor-incident, g = serious-incident, c = catastrophe)
 */
const EXPENSIVE_MISTAKE_MATRIX: KickoffOutcome[][] = [
  ["minor-incident", "minor-incident", "serious-incident", "serious-incident", "catastrophe", "catastrophe"],
  ["crisis-evaded", "minor-incident", "minor-incident", "serious-incident", "serious-incident", "catastrophe"],
  ["crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident", "serious-incident", "serious-incident"],
  ["crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident", "serious-incident"],
  ["crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident", "minor-incident"],
  ["crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "crisis-evaded", "minor-incident"],
];

/** The treasury bracket for a team's current treasury; <100k clamps to the first. */
export function bracketFor(treasury: number): KickoffBracket {
  if (treasury < 100000) return "100k-195k";
  if (treasury < 200000) return "100k-195k";
  if (treasury < 300000) return "200k-295k";
  if (treasury < 400000) return "300k-395k";
  if (treasury < 500000) return "400k-495k";
  if (treasury < 600000) return "500k-595k";
  return "600k+";
}

export interface ResolveExpensiveMistakeInput {
  roll: number;
  /** Server-rolled 1D3 for a minor deduction (fallback d6ToD3(roll)). */
  rollD3?: number;
  /** Server-rolled 2D6 keep pair for a catastrophe (fallback d6ToD3(roll)×2). */
  keep?: [number, number];
  treasury: number;
}

export interface ResolvedExpensiveMistake {
  bracket: KickoffBracket;
  outcome: KickoffOutcome;
  amountLost: number;
  treasuryAfter: number;
}

/**
 * Resolves one team's Expensive Mistake (LM-23): a 1D6 roll against the full
 * rulebook matrix, with the three deduction rules:
 *   crisis-evaded  → 0
 *   minor-incident → −1D3×10k
 *   serious-incident → −half the treasury rounded DOWN to the nearest 5k
 *   catastrophe    → treasury reduced to the kept 2D6×10k
 */
export function resolveExpensiveMistake(input: ResolveExpensiveMistakeInput): ResolvedExpensiveMistake {
  const bracket = bracketFor(input.treasury);
  const outcome = EXPENSIVE_MISTAKE_MATRIX[input.roll - 1]?.[bracketIndex(bracket)] ?? "crisis-evaded";

  let amountLost: number;
  switch (outcome) {
    case "crisis-evaded":
      amountLost = 0;
      break;
    case "minor-incident": {
      const d3 = input.rollD3 ?? d6ToD3(input.roll);
      amountLost = d3 * 10000;
      break;
    }
    case "serious-incident":
      amountLost = roundDownTo5k(Math.floor(input.treasury / 2));
      break;
    case "catastrophe": {
      const keepA = input.keep?.[0] ?? d6ToD3(input.roll);
      const keepB = input.keep?.[1] ?? d6ToD3(input.roll);
      amountLost = input.treasury - (keepA + keepB) * 10000;
      break;
    }
  }

  // R3-001 fix: the deduction can never exceed the team's actual treasury nor go
  // negative. Without this floor a low-treasury minor incident (d3×10k > balance)
  // would persist a negative treasury, and a catastrophe whose kept 2D6×10k
  // exceeds the balance would produce a payload/DB mismatch (the amountLost>0
  // guard would drop the update while the payload claimed a lower treasuryAfter).
  amountLost = Math.max(0, Math.min(amountLost, input.treasury));

  return {
    bracket,
    outcome,
    amountLost,
    treasuryAfter: input.treasury - amountLost,
  };
}

export interface KickoffTeamInput {
  teamId: string;
  treasury: number;
  dedicatedFans: number;
}

export interface KickoffDiceInput {
  /** Server 1D6 for the Expensive Mistake roll. */
  em: number;
  /** Server 1D3 for a minor deduction. */
  d3: number;
  /** Server 2D6 keep pair for a catastrophe. */
  keep: [number, number];
  /** Server 1D6 for the fan factor (mapped to a D3). */
  fan: number;
}

export interface BuildKickoffEventsInput {
  now: number;
  half: number;
  turnNumber: number;
  home: KickoffTeamInput;
  away: KickoffTeamInput;
  dice: { home: KickoffDiceInput; away: KickoffDiceInput };
}

export interface TreasuryUpdate {
  teamId: string;
  amountLost: number;
}

/**
 * Builds the three kickoff events in seq order — em(home), em(away), fan_factor
 * (LM-21) — plus the treasury deltas to commit atomically (LM-23). The fan
 * factor (LM-22) carries `side: null` and per-team {base, dice, total}. `at` is
 * `now` for all three so the feed renders them at minute 0′.
 */
export function buildKickoffEvents(
  input: BuildKickoffEventsInput,
): { events: KickoffResolvedEvent[]; treasuryUpdates: TreasuryUpdate[] } {
  const { now, half, turnNumber } = input;
  const treasuryUpdates: TreasuryUpdate[] = [];

  const teamEvent = (
    side: "home" | "away",
    team: KickoffTeamInput,
    dice: KickoffDiceInput,
  ): KickoffResolvedEvent => {
    const resolved = resolveExpensiveMistake({ roll: dice.em, rollD3: dice.d3, keep: dice.keep, treasury: team.treasury });
    const event: KickoffResolvedEvent = {
      kind: "expensive_mistake",
      side,
      playerRosterId: null,
      half,
      turnNumber,
      payload: {
        side,
        roll: dice.em,
        bracket: resolved.bracket,
        outcome: resolved.outcome,
        amountLost: resolved.amountLost,
        treasuryBefore: team.treasury,
        treasuryAfter: resolved.treasuryAfter,
      },
      at: now,
    };
    if (resolved.amountLost > 0) {
      treasuryUpdates.push({ teamId: team.teamId, amountLost: resolved.amountLost });
    }
    return event;
  };

  const fanFactor = (side: "home" | "away", team: KickoffTeamInput, dice: KickoffDiceInput) => {
    const diceRolled = d6ToD3(dice.fan);
    return { base: team.dedicatedFans, dice: diceRolled, total: team.dedicatedFans + diceRolled };
  };

  return {
    events: [
      teamEvent("home", input.home, input.dice.home),
      teamEvent("away", input.away, input.dice.away),
      {
        kind: "fan_factor",
        side: null,
        playerRosterId: null,
        half,
        turnNumber,
        payload: {
          home: fanFactor("home", input.home, input.dice.home),
          away: fanFactor("away", input.away, input.dice.away),
        },
        at: now,
      },
    ],
    treasuryUpdates,
  };
}

/** A kickoff event without its row `seq` (assigned by `beginMatch`). */
export interface KickoffResolvedEvent {
  kind: "expensive_mistake" | "fan_factor";
  side: "home" | "away" | null;
  playerRosterId: null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  at: number;
}
