import { MAX_ATTENDANCE_FAN_FACTOR, MIN_ATTENDANCE_FAN_FACTOR } from "@/lib/rules";
import { isJourneymanId } from "@/lib/journeymen";
import type { RosterPlayerRef } from "../MatchResolveModal";
import {
  ACTA_WEATHER_OPTIONS,
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";
import {
  planBajas,
  reconcileRolls,
  setInjuryRoll,
  setPermanentRoll,
  type ActaSide,
  type BajasCasualty,
} from "./bajasPlan";

/**
 * T6 · G1 (Slice G) — the acta DRAFT layer: per-fixture localStorage autosave
 * for the two client-side acta forms (the 7-step `MatchActaWizard` and the V2
 * `ActaClosure`), so a refresh mid-flow never loses typed input (S3's "se hace
 * bastante arduo … no autosave" pain point).
 *
 * Contract:
 *  - A draft holds ONLY user-entered form input — the fields that DIFFER from
 *    the seed the form mounted with. Business state is never cached: the server
 *    stays authoritative on submit and the derived acta parts re-derive on
 *    every mount (the closure's captured events, scores and rolls come from
 *    `buildResultPrefill`, never from the draft).
 *  - Restore is validity-filtered ("still asked"): a drafted value for a field
 *    that no longer exists (a vanished victim, a vanished roster player, an
 *    option that left the vocabulary, an impossible number) is dropped silently.
 *    Closure rolls additionally restore only into UNSET (still-asked) slots, so
 *    a roll captured live meanwhile is never overridden.
 *  - Degradation is total: storage disabled / private mode (any access throws),
 *    corrupted JSON, or an unexpected envelope → the form simply starts from
 *    the seed and keeps working in memory. Nothing here ever throws at callers.
 *
 * The wizard's actions array is persisted as one unit when edited (it is the
 * form's own editable list); everything else is field-level (changed-only).
 */

/** Envelope version — bumped when the draft shape changes (stale → discarded). */
const DRAFT_VERSION = 1;

const KEY_NAMESPACE = "bb-acta-draft";

/** Sanity caps so a hostile/corrupt entry can never bloat the form state. */
const MAX_ACTION_LINES = 200;
const MAX_ROLL_ENTRIES = 100;

export type ActaDraftForm = "acta" | "cierre";
export type ActaDraftMode = "load" | "correct";

/** One team's recorded user inputs (changed-only; see `teamInputsOf`). */
export interface ActaTeamInputsDraft {
  score?: number;
  neverHeld?: boolean;
  inducements?: number;
  ff?: number;
  mvpGrantee?: string;
  fanRoll?: number;
  actions?: ActaActionLine[];
}

/**
 * One recorded roll edit, bound to its VICTIM by identity (+ an occurrence
 * counter for repeat victims), never to a positional slot: arrays re-align when
 * the derived casualty list changes and a positional draft would re-bind a roll
 * to a different player.
 */
export interface ActaRollInputDraft {
  victimTeam: ActaSide;
  victimRosterPlayerId: string;
  occurrence: number;
  injuryRoll?: number;
  permanentRoll?: number;
}

/** The persisted draft envelope (form input only, JSON-safe). */
export interface ActaInputsDraft {
  v: typeof DRAFT_VERSION;
  form: ActaDraftForm;
  /** Wizard drafts carry the mode so a load draft never restores in correct. */
  mode?: ActaDraftMode;
  weather?: string;
  duration?: number;
  home?: ActaTeamInputsDraft;
  away?: ActaTeamInputsDraft;
  rolls: ActaRollInputDraft[];
}

/** The per-side rosters used to validate restored players (MVP + action lines). */
export interface ActaDraftRosters {
  home: readonly RosterPlayerRef[];
  away: readonly RosterPlayerRef[];
}

/** The draft key for one fixture + surface, namespaced per fixture. */
export function actaDraftKey(form: ActaDraftForm, fixtureId: string): string {
  return `${KEY_NAMESPACE}:${form}:${fixtureId}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage itself can throw (privacy modes).
    return null;
  }
}

/**
 * Removes a draft. Missing keys and denied storage are silent no-ops.
 */
export function clearActaDraft(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Storage disabled: nothing to clear, nothing to crash on.
  }
}

/**
 * Persists a draft. A draft that records NO user input clears the key instead,
 * so abandoned/reverted edits never restore anything stale.
 */
export function writeActaDraft(key: string, draft: ActaInputsDraft): void {
  if (!hasRecordedInputs(draft)) {
    clearActaDraft(key);
    return;
  }
  try {
    storage()?.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota / disabled storage: the form keeps working in memory.
  }
}

function hasRecordedInputs(draft: ActaInputsDraft): boolean {
  if (draft.weather !== undefined || draft.duration !== undefined) return true;
  if (draft.rolls.length > 0) return true;
  return hasTeamInputs(draft.home) || hasTeamInputs(draft.away);
}

function hasTeamInputs(input: ActaTeamInputsDraft | undefined): boolean {
  return input != null && Object.keys(input).length > 0;
}

/**
 * Reads a draft. Corrupted JSON or an unexpected/stale envelope is discarded
 * silently (the key is removed) and `null` starts the form fresh.
 */
export function readActaDraft(
  key: string,
  form: ActaDraftForm,
  mode?: ActaDraftMode,
): ActaInputsDraft | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearActaDraft(key);
    return null;
  }
  const draft = sanitizeDraft(parsed, form, mode);
  if (draft == null) {
    clearActaDraft(key);
    return null;
  }
  return draft;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function isSide(value: unknown): value is ActaSide {
  return value === "home" || value === "away";
}

function isWeatherOption(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ACTA_WEATHER_OPTIONS.some((option) => option === value)
  );
}

const ACTION_KINDS = new Set([
  "td",
  "casualty",
  "completion",
  "interception",
  "foul",
  "throwTeamMate",
  "landedSafe",
]);

/** Validates the envelope and keeps ONLY the fields each surface may restore. */
function sanitizeDraft(
  parsed: unknown,
  form: ActaDraftForm,
  mode?: ActaDraftMode,
): ActaInputsDraft | null {
  if (!isRecord(parsed)) return null;
  if (parsed.v !== DRAFT_VERSION || parsed.form !== form) return null;
  if (form === "acta" && parsed.mode !== mode) return null;

  const draft: ActaInputsDraft = { v: DRAFT_VERSION, form, rolls: [] };
  if (form === "acta" && mode !== undefined) draft.mode = mode;
  if (isWeatherOption(parsed.weather)) {
    draft.weather = parsed.weather;
  }
  if (form === "acta" && isInt(parsed.duration, 1, 10000)) draft.duration = parsed.duration;
  if (form === "acta") {
    const home = sanitizeTeam(parsed.home, true);
    if (home) draft.home = home;
    const away = sanitizeTeam(parsed.away, true);
    if (away) draft.away = away;
  } else {
    const home = sanitizeTeam(parsed.home, false);
    if (home) draft.home = home;
    const away = sanitizeTeam(parsed.away, false);
    if (away) draft.away = away;
  }
  if (Array.isArray(parsed.rolls)) {
    for (const entry of parsed.rolls.slice(0, MAX_ROLL_ENTRIES)) {
      const roll = sanitizeRoll(entry);
      if (roll) draft.rolls.push(roll);
    }
  }
  return draft;
}

function sanitizeTeam(value: unknown, full: boolean): ActaTeamInputsDraft | undefined {
  if (!isRecord(value)) return undefined;
  const out: ActaTeamInputsDraft = {};
  if (full) {
    if (isInt(value.score, 0, 999)) out.score = value.score;
    if (typeof value.neverHeld === "boolean") out.neverHeld = value.neverHeld;
    if (isInt(value.inducements, 0, 1000000)) out.inducements = value.inducements;
    if (Array.isArray(value.actions)) {
      out.actions = value.actions
        .slice(0, MAX_ACTION_LINES)
        .filter((line): line is ActaActionLine => sanitizeLine(line) != null)
        .map((line) => sanitizeLine(line) as ActaActionLine);
    }
  }
  if (isInt(value.ff, MIN_ATTENDANCE_FAN_FACTOR, MAX_ATTENDANCE_FAN_FACTOR)) out.ff = value.ff;
  if (typeof value.mvpGrantee === "string") out.mvpGrantee = value.mvpGrantee;
  if (isInt(value.fanRoll, 1, 6)) out.fanRoll = value.fanRoll;
  return hasTeamInputs(out) ? out : undefined;
}

function sanitizeLine(value: unknown): ActaActionLine | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.rosterPlayerId !== "string") return null;
  if (typeof value.kind !== "string" || !ACTION_KINDS.has(value.kind)) return null;
  if (!isInt(value.quantity, 0, 99)) return null;
  if (value.victimTeam !== undefined && !isSide(value.victimTeam)) return null;
  if (value.victimRosterPlayerId !== undefined && typeof value.victimRosterPlayerId !== "string") {
    return null;
  }
  return {
    id: value.id,
    rosterPlayerId: value.rosterPlayerId,
    kind: value.kind as ActaActionLine["kind"],
    quantity: value.quantity,
    ...(isSide(value.victimTeam) ? { victimTeam: value.victimTeam } : {}),
    ...(typeof value.victimRosterPlayerId === "string"
      ? { victimRosterPlayerId: value.victimRosterPlayerId }
      : {}),
  };
}

function sanitizeRoll(value: unknown): ActaRollInputDraft | null {
  if (!isRecord(value)) return null;
  if (!isSide(value.victimTeam)) return null;
  if (typeof value.victimRosterPlayerId !== "string" || value.victimRosterPlayerId.length === 0) {
    return null;
  }
  if (!isInt(value.occurrence, 0, 999)) return null;
  const injuryRoll = isInt(value.injuryRoll, 1, 16) ? value.injuryRoll : undefined;
  const permanentRoll = isInt(value.permanentRoll, 1, 6) ? value.permanentRoll : undefined;
  if (injuryRoll === undefined && permanentRoll === undefined) return null;
  return {
    victimTeam: value.victimTeam,
    victimRosterPlayerId: value.victimRosterPlayerId,
    occurrence: value.occurrence,
    ...(injuryRoll !== undefined ? { injuryRoll } : {}),
    ...(permanentRoll !== undefined ? { permanentRoll } : {}),
  };
}

// ---------------------------------------------------------------------------
// Collect: seed-vs-current diff — ONLY genuine user edits enter the draft.
// ---------------------------------------------------------------------------

/**
 * Records the wizard form's user edits (every wizard field is asked/editable).
 */
export function collectActaInputs(
  seed: ActaState,
  current: ActaState,
  mode: ActaDraftMode,
): ActaInputsDraft {
  return collectInputs(seed, current, "acta", mode);
}

/**
 * Records the closure's ASKED inputs only (pending rolls, MVP, FF + fan 1D6) —
 * derived acta parts never enter the draft.
 */
export function collectClosureInputs(seed: ActaState, current: ActaState): ActaInputsDraft {
  return collectInputs(seed, current, "cierre");
}

function collectInputs(
  seed: ActaState,
  current: ActaState,
  form: ActaDraftForm,
  mode?: ActaDraftMode,
): ActaInputsDraft {
  const full = form === "acta";
  const draft: ActaInputsDraft = {
    v: DRAFT_VERSION,
    form,
    rolls: rollInputsOf(seed, current),
  };
  if (mode !== undefined) draft.mode = mode;
  if (full) {
    if (current.weather !== seed.weather) draft.weather = current.weather;
    if (current.duration !== undefined && current.duration !== seed.duration) {
      draft.duration = current.duration;
    }
  }
  const home = teamInputsOf(seed.home, current.home, full);
  if (home) draft.home = home;
  const away = teamInputsOf(seed.away, current.away, full);
  if (away) draft.away = away;
  return draft;
}

function teamInputsOf(
  seed: ActaTeamDraft,
  current: ActaTeamDraft,
  full: boolean,
): ActaTeamInputsDraft | undefined {
  const out: ActaTeamInputsDraft = {};
  if (full) {
    if (current.score !== seed.score) out.score = current.score;
    if (current.neverHeld !== seed.neverHeld) out.neverHeld = current.neverHeld;
    if (current.inducements !== seed.inducements) out.inducements = current.inducements;
    if (!sameActions(seed.actions, current.actions)) out.actions = current.actions;
  }
  if (current.ff !== undefined && current.ff !== seed.ff) out.ff = current.ff;
  if (current.mvpGrantee !== seed.mvpGrantee) out.mvpGrantee = current.mvpGrantee;
  if (current.fanRoll != null && current.fanRoll !== seed.fanRoll) out.fanRoll = current.fanRoll;
  return hasTeamInputs(out) ? out : undefined;
}

function sameActions(a: readonly ActaActionLine[], b: readonly ActaActionLine[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The combined casualty plan in a stable order (home-caused, then away-caused). */
function combinedPlan(state: { home: ActaTeamDraft; away: ActaTeamDraft }): BajasCasualty[] {
  const plan = planBajas(state);
  return [...plan.home, ...plan.away];
}

interface RollSlot {
  key: string;
  occurrence: number;
  casualty: BajasCasualty;
}

/** Victim-identity roll slots (`<team>:<player>#<occurrence>`) in plan order. */
function rollSlotsOf(state: { home: ActaTeamDraft; away: ActaTeamDraft }): RollSlot[] {
  const seen = new Map<string, number>();
  return combinedPlan(state).map((casualty) => {
    const base = `${casualty.victimTeam}:${casualty.victimRosterPlayerId}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { key: `${base}#${occurrence}`, occurrence, casualty };
  });
}

function rollInputsOf(seed: ActaState, current: ActaState): ActaRollInputDraft[] {
  const seedSlots = new Map<string, BajasCasualty>();
  for (const slot of rollSlotsOf(seed)) seedSlots.set(slot.key, slot.casualty);
  const out: ActaRollInputDraft[] = [];
  for (const slot of rollSlotsOf(current)) {
    const casualty = slot.casualty;
    const previous = seedSlots.get(slot.key);
    const injuryEdit =
      casualty.injuryRoll != null && casualty.injuryRoll !== (previous?.injuryRoll ?? null);
    const permanentEdit =
      casualty.permanentRoll != null && casualty.permanentRoll !== (previous?.permanentRoll ?? null);
    if (!injuryEdit && !permanentEdit) continue;
    out.push({
      victimTeam: casualty.victimTeam,
      victimRosterPlayerId: casualty.victimRosterPlayerId,
      occurrence: slot.occurrence,
      ...(injuryEdit ? { injuryRoll: casualty.injuryRoll as number } : {}),
      ...(permanentEdit ? { permanentRoll: casualty.permanentRoll as number } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Restore: seed + validity-filtered user edits ("still asked" semantics).
// ---------------------------------------------------------------------------

/**
 * Restores the wizard's recorded edits over a freshly derived seed. Every
 * wizard field is asked input, so a recorded edit wins over the seed value;
 * anything stale (vanished player/victim, impossible value, unknown option) is
 * dropped so it can never leak into the form.
 */
export function restoreActaInputs(
  draft: ActaInputsDraft | null,
  seed: ActaState,
  rosters: ActaDraftRosters,
): ActaState {
  if (!draft) return seed;
  let next: ActaState = { ...seed };
  if (isWeatherOption(draft.weather)) {
    next = { ...next, weather: draft.weather };
  }
  if (draft.duration !== undefined && isInt(draft.duration, 1, 10000)) {
    next = { ...next, duration: draft.duration };
  }
  next = {
    ...next,
    home: restoreTeam(seed.home, draft.home, "home", rosters, true),
    away: restoreTeam(seed.away, draft.away, "away", rosters, true),
  };
  return applyRollInputs(next, draft.rolls, false);
}

/**
 * Restores the closure's ASKED inputs over the freshly derived acta: pending
 * rolls (only into still-unset slots), the direct MVPs and the fan inputs. The
 * derived parts (captured events, scores, captured rolls) always re-derive.
 */
export function restoreClosureInputs(
  draft: ActaInputsDraft | null,
  seed: ActaState,
  mvpRosters: ActaDraftRosters,
): ActaState {
  if (!draft) return seed;
  let next: ActaState = {
    ...seed,
    home: restoreTeam(seed.home, draft.home, "home", mvpRosters, false),
    away: restoreTeam(seed.away, draft.away, "away", mvpRosters, false),
  };
  next = applyRollInputs(next, draft.rolls, true);
  return next;
}

function restoreTeam(
  seed: ActaTeamDraft,
  input: ActaTeamInputsDraft | undefined,
  side: ActaSide,
  rosters: ActaDraftRosters,
  full: boolean,
): ActaTeamDraft {
  if (!input) return seed;
  let next: ActaTeamDraft = { ...seed };
  if (full) {
    if (isInt(input.score, 0, 999)) next.score = input.score;
    if (typeof input.neverHeld === "boolean") next.neverHeld = input.neverHeld;
    if (isInt(input.inducements, 0, 1000000)) next.inducements = input.inducements;
    if (input.actions !== undefined) {
      const own = rosters[side];
      const rival = rosters[side === "home" ? "away" : "home"];
      const valid = input.actions.filter((line) => isLineValid(line, own, rival));
      // An explicit [] is a deliberate clear; a non-empty edit that filters to
      // nothing is all-stale → the re-derived lines stay untouched.
      if (input.actions.length === 0 || valid.length > 0) {
        // The seeded rolls follow their casualty lines by line id onto the
        // restored list (existing s3d machinery), so recorded rolls stay bound.
        const rebound = reconcileRolls(seed, valid);
        next = {
          ...next,
          actions: valid,
          injuryRoll: rebound.injuryRoll,
          permanentRoll: rebound.permanentRoll,
        };
      }
    }
  }
  if (isInt(input.ff, MIN_ATTENDANCE_FAN_FACTOR, MAX_ATTENDANCE_FAN_FACTOR)) next.ff = input.ff;
  if (typeof input.mvpGrantee === "string" && isValidGrantee(input.mvpGrantee, rosters[side])) {
    next.mvpGrantee = input.mvpGrantee;
  }
  if (isInt(input.fanRoll, 1, 6)) next.fanRoll = input.fanRoll;
  return next;
}

function isLineValid(
  line: ActaActionLine,
  own: readonly RosterPlayerRef[],
  rival: readonly RosterPlayerRef[],
): boolean {
  if (line.id.length === 0) return false;
  if (line.rosterPlayerId !== "" && !own.some((player) => player.id === line.rosterPlayerId)) {
    return false;
  }
  if (!ACTION_KINDS.has(line.kind)) return false;
  if (!isInt(line.quantity, 0, 99)) return false;
  if (line.victimTeam !== undefined && !isSide(line.victimTeam)) return false;
  if (
    line.victimRosterPlayerId !== undefined &&
    line.victimRosterPlayerId !== "" &&
    !rival.some((player) => player.id === line.victimRosterPlayerId)
  ) {
    return false;
  }
  return true;
}

function isValidGrantee(value: string, roster: readonly RosterPlayerRef[]): boolean {
  if (value === "") return true;
  return roster.some((player) => player.id === value) && !isJourneymanId(value);
}

/**
 * Applies recorded roll edits onto the assembled state. Entries bind by victim
 * identity; a victim that no longer exists (or whose slot is no longer asked —
 * `onlyUnset` for the closure) drops the entry instead of leaking it.
 */
function applyRollInputs(
  state: ActaState,
  rolls: readonly ActaRollInputDraft[],
  onlyUnset: boolean,
): ActaState {
  let next = state;
  // 1D16 first: `setInjuryRoll` re-derives the permanent-band compression, so
  // the 1D6 pass below always writes into a fresh `permanentIndex`.
  for (const entry of rolls) {
    if (entry.injuryRoll === undefined) continue;
    const slot = findRollSlot(next, entry, (casualty) =>
      onlyUnset ? casualty.injuryRoll == null : true,
    );
    if (slot) next = setInjuryRoll(next, slot.casualty.causingTeam, slot.casualty.index, entry.injuryRoll);
  }
  for (const entry of rolls) {
    if (entry.permanentRoll === undefined) continue;
    const slot = findRollSlot(next, entry, (casualty) =>
      casualty.permanent && casualty.permanentIndex != null
        ? onlyUnset
          ? casualty.permanentRoll == null
          : true
        : false,
    );
    if (slot && slot.casualty.permanentIndex != null) {
      next = setPermanentRoll(
        next,
        slot.casualty.causingTeam,
        slot.casualty.permanentIndex,
        entry.permanentRoll,
      );
    }
  }
  return next;
}

function findRollSlot(
  state: ActaState,
  entry: ActaRollInputDraft,
  predicate: (casualty: BajasCasualty) => boolean,
): RollSlot | null {
  for (const slot of rollSlotsOf(state)) {
    const casualty = slot.casualty;
    if (casualty.victimTeam !== entry.victimTeam) continue;
    if (casualty.victimRosterPlayerId !== entry.victimRosterPlayerId) continue;
    if (slot.occurrence !== entry.occurrence) continue;
    return predicate(casualty) ? slot : null;
  }
  return null;
}
