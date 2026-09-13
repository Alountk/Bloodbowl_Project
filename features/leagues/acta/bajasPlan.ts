import { resolveInjury, type InjuryOutcomeKind } from "@/lib/rules/injuries";
import type { ActaState, ActaTeamDraft } from "./actaState";
import { casualtiesFromActions } from "./deriveCasualties";

/**
 * s3b (RAU-122) — the pure Bajas planner (MAW-6).
 *
 * The result payload's `injuryRoll` / `permanentRoll` arrays live on the
 * CAUSING team's draft (`state.home` / `state.away`), while
 * `deriveCasualtyEntries` tags every victim with the VICTIM's team. Iterating
 * the combined victim list would therefore bind rolls to the WRONG draft. This
 * module is the explicit bridge: it groups each derived casualty under the team
 * that caused it, so StepBajas renders the read-only list and writes every roll
 * against the correct side.
 *
 * Roll alignment mirrors the route (`resolveReportedCasualties`):
 *   - `injuryRoll[i]` aligns with the causing team's i-th derived casualty;
 *   - `permanentRoll` is COMPRESSED to the permanent-band victims only, in order.
 */

/** A team side, used for both the causing and the victim draft. */
export type ActaSide = "home" | "away";

/** One derived casualty plus its roll slots, bound to the causing team. */
export interface BajasCasualty {
  /** Position within the causing team's derived list; the index its
   *  `injuryRoll` entry is aligned against. */
  index: number;
  /** The team that CAUSED the casualty — the draft the rolls bind to. */
  causingTeam: ActaSide;
  /** The team the victim belongs to (where the Player row lives). */
  victimTeam: ActaSide;
  victimRosterPlayerId: string;
  /** The raw 1D16 injury roll recorded for this casualty (null until entered). */
  injuryRoll: number | null;
  /** The rulebook band the 1D16 resolves to (null until a roll is entered). */
  band: InjuryOutcomeKind | null;
  /** True only when the resolved band is `permanent`. */
  permanent: boolean;
  /** Index into the causing draft's `permanentRoll` array (null when not
   *  permanent), so the UI can write the 1D6 to the exact slot. */
  permanentIndex: number | null;
  /** The 1D6 permanent-attribute roll (null when not permanent / unset). */
  permanentRoll: number | null;
}

/** The derived casualties for the whole match, split by causing team. */
export interface BajasPlan {
  /** Casualties caused by home (their rolls bind to `state.home`). */
  home: BajasCasualty[];
  /** Casualties caused by away (their rolls bind to `state.away`). */
  away: BajasCasualty[];
}

/**
 * Pure: plans the Bajas step from the wizard state. Reuses `casualtiesFromActions`
 * (the SAME mapping the payload emits), so the rendered list can never drift from
 * Step 2's recorded casualties, and binds each roll slot to the causing draft.
 */
export function planBajas(state: {
  home: ActaTeamDraft;
  away: ActaTeamDraft;
}): BajasPlan {
  return {
    home: planSide("home", state.home),
    away: planSide("away", state.away),
  };
}

function planSide(causingTeam: ActaSide, draft: ActaTeamDraft): BajasCasualty[] {
  const victims = casualtiesFromActions(draft.actions);
  // The 1D6 list is compressed to permanent-band victims, so it needs its own
  // cursor advanced only when a victim's resolved band is `permanent`.
  let permanentIndex = 0;
  return victims.map((victim, index) => {
    const injuryRoll = draft.injuryRoll[index] ?? null;
    const band = injuryRoll == null ? null : resolveInjury(injuryRoll, 0).kind;
    const permanent = band === "permanent";
    const permanentSlot = permanent ? permanentIndex : null;
    if (permanent) permanentIndex += 1;
    return {
      index,
      causingTeam,
      victimTeam: victim.team,
      victimRosterPlayerId: victim.rosterPlayerId,
      injuryRoll,
      band,
      permanent,
      permanentIndex: permanentSlot,
      permanentRoll: permanentSlot == null ? null : draft.permanentRoll[permanentSlot] ?? null,
    };
  });
}

/**
 * Writes a casualty's 1D16 injury roll into the CORRECT (causing) draft. `null`
 * clears the slot to a hole, which serializes to `null` in the payload so the
 * route's `?? rollD16()` fallback rolls it instead of reading a false 0.
 */
export function setInjuryRoll(
  state: ActaState,
  causingTeam: ActaSide,
  index: number,
  roll: number | null,
): ActaState {
  const draft = state[causingTeam];
  return {
    ...state,
    [causingTeam]: { ...draft, injuryRoll: withIndex(draft.injuryRoll, index, roll) },
  };
}

/**
 * Writes a casualty's 1D6 permanent-attribute roll into the CORRECT (causing)
 * draft, at the compressed `permanentIndex` the plan exposes.
 */
export function setPermanentRoll(
  state: ActaState,
  causingTeam: ActaSide,
  index: number,
  roll: number | null,
): ActaState {
  const draft = state[causingTeam];
  return {
    ...state,
    [causingTeam]: { ...draft, permanentRoll: withIndex(draft.permanentRoll, index, roll) },
  };
}

/**
 * Immutably sets one slot, using an `undefined` hole to mean "unset" so the
 * route's `?? rollD16()` fallback rolls it instead of reading a false 0.
 * Trailing holes are trimmed, so clearing every roll leaves a clean `[]`.
 */
function withIndex(values: readonly number[], index: number, value: number | null): number[] {
  const next = [...values];
  if (value == null) {
    if (index >= next.length) return next;
    next[index] = undefined as unknown as number;
  } else {
    next[index] = value;
  }
  while (next.length > 0 && next[next.length - 1] == null) next.pop();
  return next;
}
