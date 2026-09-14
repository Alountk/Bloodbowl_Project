import { resolveInjury, type InjuryOutcomeKind } from "@/lib/rules/injuries";
import type { ActaActionLine, ActaState, ActaTeamDraft } from "./actaState";
import { casualtiesFromActions, type ActaCasualtyEntry } from "./deriveCasualties";

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
 * Pure: re-aligns the positional `injuryRoll` / `permanentRoll` arrays when the
 * Step-2 action lines change (s3d corrective). A recorded roll FOLLOWS its
 * VICTIM by identity — victim team + roster id + occurrence — instead of keeping
 * its array position, so deleting, inserting, or reordering a casualty line can
 * never rebind a roll to a different player.
 *
 * `permanentRoll` is COMPRESSED to the permanent-band victims, so it is rebuilt
 * from the re-aligned 1D16 list: each permanent victim carries its own 1D6 by
 * the same identity key. Victims with no previous match start UNSET (an
 * `undefined` hole, so the route's `?? rollD16()` fallback applies); victims that
 * disappeared have their rolls dropped. Trailing holes are trimmed, so a fully
 * cleared side serializes to `[]`.
 */
export function reconcileRolls(
  previous: Pick<ActaTeamDraft, "actions" | "injuryRoll" | "permanentRoll">,
  nextActions: readonly ActaActionLine[],
): Pick<ActaTeamDraft, "injuryRoll" | "permanentRoll"> {
  const previousKeys = victimIdentityKeys(casualtiesFromActions(previous.actions));

  const injuryByKey = new Map<string, number>();
  previousKeys.forEach((key, index) => {
    const roll = previous.injuryRoll[index];
    if (roll != null) injuryByKey.set(key, roll);
  });

  // The 1D6 list is compressed: walk the previous victims in order and bind each
  // permanent victim's roll to its identity key, advancing the cursor only on a
  // permanent band (mirrors `planSide`).
  const permanentByKey = new Map<string, number>();
  let previousPermanentIndex = 0;
  previousKeys.forEach((key, index) => {
    const roll = previous.injuryRoll[index];
    if (roll == null || resolveInjury(roll, 0).kind !== "permanent") return;
    const permanentRoll = previous.permanentRoll[previousPermanentIndex];
    if (permanentRoll != null) permanentByKey.set(key, permanentRoll);
    previousPermanentIndex += 1;
  });

  const nextKeys = victimIdentityKeys(casualtiesFromActions(nextActions));
  const injuryRoll = nextKeys.map((key) => injuryByKey.get(key));
  const permanentRoll: (number | undefined)[] = [];
  nextKeys.forEach((key, index) => {
    const roll = injuryRoll[index];
    if (roll == null || resolveInjury(roll, 0).kind !== "permanent") return;
    permanentRoll.push(permanentByKey.get(key));
  });

  return {
    injuryRoll: trimTrailingHoles(injuryRoll),
    permanentRoll: trimTrailingHoles(permanentRoll),
  };
}

/**
 * Pure: the victim-identity key for each casualty, combining the victim's team
 * and roster id with its OCCURRENCE among that victim's casualties (the 1st,
 * 2nd, … injury). Occurrence disambiguates a player injured twice, so each roll
 * stays on its own casualty instead of collapsing onto the victim id.
 */
function victimIdentityKeys(victims: readonly ActaCasualtyEntry[]): string[] {
  const seen = new Map<string, number>();
  return victims.map((victim) => {
    const base = `${victim.team}:${victim.rosterPlayerId}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}#${occurrence}`;
  });
}

/**
 * Immutably sets one slot, using an `undefined` hole to mean "unset" so the
 * route's `?? rollD16()` fallback rolls it instead of reading a false 0.
 * Trailing holes are trimmed, so clearing every roll leaves a clean `[]`.
 */
function withIndex(values: readonly number[], index: number, value: number | null): number[] {
  const next: (number | undefined)[] = [...values];
  if (value == null) {
    if (index < next.length) next[index] = undefined;
  } else {
    next[index] = value;
  }
  return trimTrailingHoles(next);
}

/**
 * Pure: drops trailing unset slots so a side with no recorded rolls serializes
 * to a clean `[]`. Holes in the middle are preserved so the route's
 * `?? rollD16()` fallback still rolls them.
 */
function trimTrailingHoles(values: readonly (number | undefined)[]): number[] {
  const next = [...values];
  while (next.length > 0 && next[next.length - 1] == null) next.pop();
  return next as number[];
}
