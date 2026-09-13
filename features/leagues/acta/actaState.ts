import type { WeatherKind } from "@/lib/rules/weather";
import type { MatchScoreboard, ResultPayload, ResultPlayerAction } from "../api";
import type { ResultTeamDraft } from "../resultPrefill";
import { weatherLabel, type SummaryTFunc } from "../matchSummary";
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
  /**
   * Display-only marker (s6a corrective): true when the persisted snapshot
   * carried casualties the wizard could NOT reconstruct — a legacy row with
   * victims but no `actions` to attribute them to. Step 4 shows a warning,
   * because saving without re-entering them sends `casualties: []` and clears
   * the persisted casualties (and their served suspensions). It NEVER blocks the
   * save and is NEVER sent in the payload. Absent/false for a normal
   * (extended-snapshot) acta.
   */
  casualtiesUnrecoverable?: boolean;
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

/**
 * Canonical persisted weather value → locale-independent BB2025 kind (s6b
 * corrective). `ACTA_WEATHER_OPTIONS` holds the CANONICAL values the payload and
 * the DB store; this map only lets the wizard render a localized LABEL through
 * the existing `weatherLabel` helper without touching the stored value.
 */
const WEATHER_KIND_BY_VALUE: Record<string, WeatherKind> = {
  "Perfecto": "perfect",
  "Calor asfixiante": "heat",
  "Muy soleado": "sunny",
  "Lluvioso": "rain",
  "Ventisca": "blizzard",
};

/**
 * Renders a weather LABEL for the active locale from the canonical persisted
 * value (s6b corrective). Only the label is localized: the value the wizard
 * sends stays the `ACTA_WEATHER_OPTIONS` Spanish string, unchanged. An unknown
 * value (legacy row) passes through unchanged, mirroring `weatherLabel`'s
 * default.
 */
export function weatherOptionLabel(value: string, t: SummaryTFunc): string {
  const kind = WEATHER_KIND_BY_VALUE[value];
  return kind ? weatherLabel(kind, t) : value;
}

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

/** The action kinds a persisted snapshot can rebuild straight from a row
 *  (`casualty` is excluded — the snapshot stores no casualty causer). */
const NON_CASUALTY_KINDS: readonly ActaActionKind[] = [
  "td",
  "completion",
  "interception",
  "foul",
  "throwTeamMate",
  "landedSafe",
];

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
 * The SINGLE prefill home (design decision F2). Accepts either the persisted
 * `MatchResult.scores` snapshot (correct mode, MAW-9 — every extended key is
 * mapped: score, neverHeld, ff, fanRoll, rolls, action lines, inducements,
 * duration, MVP) or the finished-live `buildResultPrefill` draft (load path,
 * s4c corrective). Legacy snapshot rows lacking the extended keys open partially
 * prefilled.
 *
 * `weather` is a `MatchResult` COLUMN, not a `scores` key, so the correct-mode
 * call site passes it as the optional second argument (s6a corrective): the
 * snapshot branch populates `ActaState.weather` from it, otherwise the wizard
 * would keep the "Perfecto" default and silently rewrite the persisted weather
 * on the next save. The load path has no persisted weather and ignores it.
 */
export function actaPrefill(
  source: MatchScoreboard | ActaLoadPrefill | null | undefined,
  weather?: string | null,
): ActaState {
  const base = emptyActaState();
  if (!source) return base;
  if (isLoadPrefill(source)) {
    return {
      ...base,
      home: teamFromResultDraft(source.home),
      away: teamFromResultDraft(source.away),
    };
  }
  return {
    ...base,
    weather: weather ?? base.weather,
    duration: source.duration ?? base.duration,
    casualtiesUnrecoverable:
      hasUnrecoverableCasualties(source.home, source.away) ||
      hasUnrecoverableCasualties(source.away, source.home),
    home: teamFromSnapshot(source.home, source.away, source.mvp?.home),
    away: teamFromSnapshot(source.away, source.home, source.mvp?.away),
  };
}

/**
 * True when the side `own` CAUSED persisted casualties it cannot be credited
 * for: the opponent side carries victims, but `own.actions` has no stored row
 * crediting a casualty, so `actionsFromSnapshot` rebuilds no casualty line and
 * the Bajas step opens EMPTY. The causer↔victim link is not persisted, so the
 * victims cannot be attributed by any other means (s6a corrective).
 */
function hasUnrecoverableCasualties(
  own: SnapshotSide,
  opponent: SnapshotSide,
): boolean {
  const victims = opponent.casualties?.length ?? 0;
  if (victims === 0) return false;
  return !(own.actions ?? []).some((row) => (row.casualties ?? 0) > 0);
}

/** One side of the persisted `MatchResult.scores` snapshot. */
type SnapshotSide = MatchScoreboard["home"];

/**
 * Rebuilds the free-form Acciones lines for one side from the persisted
 * snapshot (MAW-9). Non-casualty lines come straight from this side's
 * aggregated `actions` rows. Casualty lines are reconstructed from the OPPONENT
 * side's `casualties` — the snapshot groups every victim under the VICTIM's
 * team, not the causer's — and attributed to this side's players in proportion
 * to their recorded `casualties` counts. The snapshot does NOT persist which
 * causer hit which victim, so the pairing is reconstructed in recorded victim
 * order; the victim set, the per-player casualty counts (PE) and the roll
 * alignment are preserved exactly.
 */
function actionsFromSnapshot(
  own: SnapshotSide,
  opponent: SnapshotSide,
): ActaActionLine[] {
  const lines: ActaActionLine[] = [];
  for (const row of own.actions ?? []) {
    for (const kind of NON_CASUALTY_KINDS) {
      const quantity = row[ACTION_FIELD[kind]];
      if (quantity > 0) {
        lines.push({
          id: `${row.rosterPlayerId}:${kind}`,
          rosterPlayerId: row.rosterPlayerId,
          kind,
          quantity,
        });
      }
    }
  }
  const victims = opponent.casualties ?? [];
  let victimIndex = 0;
  for (const row of own.actions ?? []) {
    const caused = row.casualties ?? 0;
    for (let i = 0; i < caused && victimIndex < victims.length; i += 1) {
      const victim = victims[victimIndex];
      victimIndex += 1;
      lines.push({
        id: `c${victimIndex}:${row.rosterPlayerId}`,
        rosterPlayerId: row.rosterPlayerId,
        kind: "casualty",
        quantity: 1,
        victimTeam: victim.team,
        victimRosterPlayerId: victim.rosterPlayerId,
      });
    }
  }
  return lines;
}

/**
 * Maps one persisted snapshot side into the wizard's team draft. Everything the
 * snapshot genuinely carries is mapped; a legacy row (no `actions`/`ff`/rolls)
 * opens partially prefilled (score, neverHeld, MVP) without throwing. The
 * snapshot groups `injuryRoll`/`permanentRoll` by the VICTIM's side, while the
 * wizard stores them on the CAUSING draft, so each side reads the OPPONENT's
 * arrays (the causer↔victim link is not persisted).
 */
function teamFromSnapshot(
  own: SnapshotSide,
  opponent: SnapshotSide,
  grantee: string | undefined,
): ActaTeamDraft {
  return {
    ...emptyTeamDraft(),
    score: own.score,
    neverHeld: own.neverHeld ?? false,
    inducements: own.inducements?.budget ?? 0,
    fanRoll: own.fanRoll ?? null,
    mvpGrantee: grantee ?? "",
    actions: actionsFromSnapshot(own, opponent),
    injuryRoll: opponent.injuryRoll ?? [],
    permanentRoll: opponent.permanentRoll ?? [],
    ...(own.ff != null ? { ff: own.ff } : {}),
  };
}

/** The finished-live draft `buildResultPrefill` returns for the load path. */
type ActaLoadPrefill = { home: ResultTeamDraft; away: ResultTeamDraft };

/** Distinguishes the live draft pair from the persisted `MatchScoreboard`. */
function isLoadPrefill(
  source: MatchScoreboard | ActaLoadPrefill,
): source is ActaLoadPrefill {
  return "players" in source.home;
}

/**
 * Rebuilds the free-form Acciones lines from a `ResultTeamDraft`'s per-player
 * rows. Only the directly-sourced non-casualty counts are mapped: the DRAFT
 * that `buildResultPrefill` returns carries a casualty COUNT per player but no
 * casualty VICTIM, so a count cannot be turned into the wizard's victim-bound
 * casualty line and is deliberately left for manual re-entry rather than
 * invented. This is a limitation of the DRAFT, not of the live source: the raw
 * `LiveMatchView.events` casualty payloads DO carry `victimRosterId`,
 * `causerRosterId`, `roll16`/`roll6`, and `band` (see the live route's
 * `recordCasualty`), and `LiveMatchView` exposes `mvpGrantees` — but
 * `buildResultPrefill` discards every non-`td` event, so this function never
 * sees them. A future slice could prefill casualties by reading those events.
 */
function actionsFromResultPlayers(
  players: ResultTeamDraft["players"],
): ActaActionLine[] {
  const lines: ActaActionLine[] = [];
  for (const [rosterPlayerId, row] of Object.entries(players)) {
    for (const kind of Object.keys(ACTION_FIELD) as ActaActionKind[]) {
      if (kind === "casualty") continue;
      const quantity = row[ACTION_FIELD[kind]];
      if (quantity > 0) {
        lines.push({ id: `${rosterPlayerId}:${kind}`, rosterPlayerId, kind, quantity });
      }
    }
  }
  return lines;
}

/** Maps one finished-live `ResultTeamDraft` into the wizard's team draft. */
function teamFromResultDraft(draft: ResultTeamDraft): ActaTeamDraft {
  return {
    ...emptyTeamDraft(),
    score: draft.score,
    neverHeld: !draft.ballHeld,
    actions: actionsFromResultPlayers(draft.players),
  };
}
