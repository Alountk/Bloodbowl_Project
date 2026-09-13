import type { MatchScoreboard, ResultPayload, ResultPlayerAction } from "../api";
import { casualtiesFromActions } from "./deriveCasualties";

/**
 * S2 (RAU-122) — the pure wizard state for the "Acta del partido" flow. This
 * module is the SINGLE home for the wizard state shape and the correct-mode
 * prefill (`actaPrefill`, design decision F2): `features/leagues/resultPrefill.ts`
 * MUST NOT grow a second prefill.
 */

/** The action kinds a free-form Acciones line can record (MAW-4). */
export type ActaActionKind =
  | "td"
  | "casualty"
  | "completion"
  | "interception"
  | "foul"
  | "throwTeamMate"
  | "landedSafe";

/**
 * One free-form Acciones line: a roster player, an action kind, and a quantity.
 * A `casualty` line represents exactly ONE casualty against ONE victim, so the
 * wizard appends a new line per casualty and `quantity` is not multiplied when
 * deriving victims (see `deriveCasualties.ts`).
 */
export interface ActaActionLine {
  id: string;
  rosterPlayerId: string;
  kind: ActaActionKind;
  quantity: number;
  /** Victim of a `casualty` line (the opposing team + its roster player). */
  victimTeam?: "home" | "away";
  victimRosterPlayerId?: string;
}

/** One team's in-progress acta (S0–S5 fields; Bajas/Final rolls land in S3). */
export interface ActaTeamDraft {
  /**
   * FINAL Factor Fan entered directly by the user (winnings input, as-is).
   * `undefined` until the user enters it — BB minimum is 1, so 0 is not a valid
   * sentinel and MUST NOT reach the payload (the route falls back to its
   * server-rolled pre-match FF when `ff` is absent).
   */
  ff?: number;
  /** "NUNCA tuvo el balón" — the payload maps `heldBall = !neverHeld`. */
  neverHeld: boolean;
  /** Inducements spent by this team (budget in gold). */
  inducements: number;
  score: number;
  /** The single directly-selected MVP roster id ("" = unset). */
  mvpGrantee: string;
  actions: ActaActionLine[];
  /** Post-match fan 1D6 (Step 5, S3). */
  fanRoll: number | null;
  /** Per-victim 1D16 rolls aligned with this team's derived casualties (S3). */
  injuryRoll: number[];
  /** Per-permanent-victim 1D6 rolls (S3). */
  permanentRoll: number[];
}

/** The whole wizard state across the seven steps. */
export interface ActaState {
  weather: string;
  /**
   * Match duration in minutes. `undefined` until entered — 0 minutes is not a
   * real duration, so it is omitted from the payload (the snapshot stores null
   * rather than a false 0).
   */
  duration?: number;
  home: ActaTeamDraft;
  away: ActaTeamDraft;
}

/** The canonical weather options (BB2025 R6) offered by the Contexto step. */
export const ACTA_WEATHER_OPTIONS = [
  "Perfecto",
  "Calor asfixiante",
  "Muy soleado",
  "Lluvioso",
  "Ventisca",
] as const;

function emptyTeamDraft(): ActaTeamDraft {
  return {
    // `ff` is intentionally absent until the user enters it (see ActaTeamDraft).
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions: [],
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
  };
}

/** A blank acta: both teams empty, the default (Perfecto) weather. */
export function emptyActaState(): ActaState {
  return {
    weather: "Perfecto",
    // `duration` is intentionally absent until the user enters it (see ActaState).
    home: emptyTeamDraft(),
    away: emptyTeamDraft(),
  };
}

/** Maps each action kind to the per-player payload field it credits. */
const ACTION_FIELD: Record<
  ActaActionKind,
  Exclude<keyof ResultPlayerAction, "rosterPlayerId">
> = {
  td: "tds",
  casualty: "casualties",
  completion: "completions",
  interception: "interceptions",
  foul: "fouls",
  throwTeamMate: "throwTeamMates",
  landedSafe: "landedSafe",
};

/** Aggregates the free-form action lines into the route's per-player rows. */
export function aggregateActions(
  actions: readonly ActaActionLine[],
): ResultPlayerAction[] {
  const byPlayer = new Map<string, ResultPlayerAction>();
  for (const action of actions) {
    if (!action.rosterPlayerId) continue;
    const row =
      byPlayer.get(action.rosterPlayerId) ??
      {
        rosterPlayerId: action.rosterPlayerId,
        tds: 0,
        casualties: 0,
        completions: 0,
        interceptions: 0,
        fouls: 0,
        throwTeamMates: 0,
        landedSafe: 0,
      };
    row[ACTION_FIELD[action.kind]] +=
      // A casualty line is ONE casualty against ONE victim: its `quantity` is
      // meaningless and is never multiplied, and a line that names no victim
      // records no casualty (mirrors `casualtiesFromActions` and the Step 2
      // counter, so PE and the derived victim list can never disagree).
      action.kind === "casualty"
        ? action.victimRosterPlayerId
          ? 1
          : 0
        : Math.max(0, action.quantity);
    byPlayer.set(action.rosterPlayerId, row);
  }
  return [...byPlayer.values()];
}

function toTeamInput(
  draft: ActaTeamDraft,
  casualties: { team: "home" | "away"; rosterPlayerId: string }[],
): ResultPayload["home"] {
  return {
    score: draft.score,
    // The payload's legacy field is the positive "held the ball"; the wizard
    // captures the inverse "NUNCA tuvo el balón" (MAW-2).
    ballHeld: !draft.neverHeld,
    neverHeld: draft.neverHeld,
    // Omit `ff` when unset so the route falls back to its server-rolled FF
    // (`home.ff ?? preMatchFanFactor(...)`); a numeric 0 would bypass it.
    ...(draft.ff !== undefined ? { ff: draft.ff } : {}),
    fanRoll: draft.fanRoll,
    injuryRoll: draft.injuryRoll,
    permanentRoll: draft.permanentRoll,
    players: aggregateActions(draft.actions),
    // The wizard is the direct-MVP path: exactly one scalar grantee, no
    // nominations (MAW-5). The server keeps the legacy six-nomination fallback.
    mvp: { nominations: [], grantee: draft.mvpGrantee || null },
    casualties,
  };
}

/**
 * Pure: assembles the additive `ResultPayload` from the wizard state. Contexto
 * values, the neverHeld inversion, both scores, the direct MVPs, the aggregated
 * action rows, and the derived victims all ride here; winnings are NOT sent
 * (the server computes them from `ff`, MAW-7).
 */
export function buildActaPayload(state: ActaState): ResultPayload {
  return {
    weather: state.weather,
    // Omit `duration` when unset (0 minutes is not a real duration).
    ...(state.duration !== undefined ? { duration: state.duration } : {}),
    inducements: {
      home: { budget: state.home.inducements, cards: [] },
      away: { budget: state.away.inducements, cards: [] },
    },
    home: toTeamInput(state.home, casualtiesFromActions(state.home.actions)),
    away: toTeamInput(state.away, casualtiesFromActions(state.away.actions)),
  };
}

/**
 * Correct-mode prefill skeleton (MAW-9). Maps the scalar Contexto/Marcador/MVP
 * fields present in the persisted `MatchResult.scores` snapshot; the full
 * action-line + roll reconstruction is completed in the prefill slice (S6).
 * Legacy rows lacking the extended keys open partially prefilled.
 */
export function actaPrefill(
  snapshot: MatchScoreboard | null | undefined,
): ActaState {
  const base = emptyActaState();
  if (!snapshot) return base;
  return {
    ...base,
    duration: snapshot.duration ?? base.duration,
    home: {
      ...base.home,
      score: snapshot.home.score,
      ff: snapshot.home.ff ?? base.home.ff,
      neverHeld: snapshot.home.neverHeld ?? base.home.neverHeld,
      mvpGrantee: snapshot.mvp?.home ?? base.home.mvpGrantee,
    },
    away: {
      ...base.away,
      score: snapshot.away.score,
      ff: snapshot.away.ff ?? base.away.ff,
      neverHeld: snapshot.away.neverHeld ?? base.away.neverHeld,
      mvpGrantee: snapshot.mvp?.away ?? base.away.mvpGrantee,
    },
  };
}
