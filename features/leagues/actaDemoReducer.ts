import { weatherFromRoll } from "@/lib/rules/weather";

import type { LiveCommand, LiveMatchEventDto, LiveMatchViewState } from "./api";
import { MIN, liveState, narrativeEvents } from "./actaFlow.fixtures";
import { fanFactorOf, type FanFactorLine } from "./actaPreMatch";
import type { PreMatchCommit } from "./actaPreMatchWizard";

/**
 * Pure demo state machine behind the dual-view match demo ("Flujo
 * interactivo" + `/demo/partido`). It backs the interactive sandbox only —
 * product flows keep using `useLiveMatch` + `sendLiveCommand`. Deterministic by
 * design: no `Date.now()`, no `Math.random()`, so Chromatic snapshots stay
 * stable.
 *
 * The reducer STAMPS every appended event itself (seq, half, turnNumber, at)
 * from the state it receives, so callers only describe WHAT happened — the
 * demo never trusts a caller-supplied clock or ordering.
 */

/** Named starting points the demo's scenario chips jump to. */
export type DemoScenario =
  | "inicio"
  | "primer-tercio"
  | "segundo-tercio"
  | "finalizado";

/**
 * The live view state the composition renders, plus the pieces the demo drives
 * itself: the appended narrative events, the closure toggle, the auto-follow
 * camera, the single acta submitter and the monotonic event counter.
 */
/**
 * Fase 1 · Pre-partido capture (S5 + S2c): PER-SIDE progress — each coach
 * commits ONLY their own rolls and inducement cart («cada usuario deberia ver
 * el suyo»). The shared acta events derive from these per-side marks.
 */
export interface ActaDemoPreMatch {
  /** Confirmed fan lines per side (merged into `fan_factor` events). */
  fans: { home: FanFactorLine | null; away: FanFactorLine | null };
  /** Per-side confirmed weather dice (the 2D6 sum resolves the weather). */
  weatherDice: { home: number | null; away: number | null };
  /** Per-side confirmed kick dice (the opposed 1D6). */
  kickDice: { home: number | null; away: number | null };
  /** Per-side inducement confirmation. */
  inducementsDone: { home: boolean; away: boolean };
  /** Winner's decision: who kicks. */
  kicking: "home" | "away" | null;
}

export interface ActaDemoState extends LiveMatchViewState {
  events: LiveMatchEventDto[];
  closureOpen: boolean;
  autoFollow: boolean;
  submittedBy: "home" | "away" | null;
  nextSeq: number;
  /** Fase 1 · Pre-partido capture (S5) — see `ActaDemoPreMatch`. */
  preMatch: ActaDemoPreMatch | null;
  /** S6: the in-game capture bar renders only when the match has really
   *  started (every fixture preset is a match underway; only a fresh
   *  pre-match sequence keeps this false). */
  matchStarted: boolean;
}

export type ActaDemoAction =
  | {
      type: "registerEvent";
      kind: string;
      side?: "home" | "away" | null;
      playerRosterId?: string | null;
      payload?: Record<string, unknown>;
      /** Optional score bump (a touchdown) for one side. */
      score?: { side: "home" | "away" };
    }
  | { type: "submitCommand"; command: LiveCommand }
  | { type: "switchPerspective"; side: "home" | "away" }
  | { type: "setAutoFollow"; on: boolean }
  | { type: "submitClosure"; side: "home" | "away" }
  | { type: "openClosure" }
  | { type: "finish" }
  | { type: "reset"; scenario: DemoScenario }
  | { type: "commitPreMatch"; commit: PreMatchCommit }
  | { type: "hydrate"; saved: ActaDemoState };

/** Turns per half in Blood Bowl; `endTurn` rolls 1T8 → 2T1 and 2T8 → finished. */
const TURNS_PER_HALF = 8;

/** Demo clock model: 48' per half, 6' per turn, anchored on `startedAt`. */
const MIN_PER_HALF = 48;
const MIN_PER_TURN = 6;

type EventDraft = {
  kind: string;
  side?: "home" | "away" | null;
  playerRosterId?: string | null;
  payload?: Record<string, unknown>;
};

/** Highest fixture seq — demo events must sort ABOVE every narrative sample. */
const MAX_FIXTURE_SEQ = Math.max(...narrativeEvents.map((e) => e.seq));

/** A fresh demo state for a named scenario (fixture viewer context preserved). */
export function demoState(scenario: DemoScenario): ActaDemoState {
  const base: ActaDemoState = {
    ...liveState(),
    events: [],
    closureOpen: false,
    autoFollow: true,
    submittedBy: null,
    nextSeq: MAX_FIXTURE_SEQ + 1,
    preMatch: null,
    // Every fixture preset is a match underway — only the reset-to-"inicio"
    // wipe (below) represents a fresh, unstarted match.
    matchStarted: true,
  };

  switch (scenario) {
    case "inicio":
      return {
        ...base,
        status: "live",
        half: 1,
        turnNumber: 1,
        homeScore: 0,
        awayScore: 0,
        // S1: every scenario starts past kickoff — the weather roll and both
        // fan factor rolls are already on the feed.
        events: narrativeEvents.slice(0, 3),
      };
    case "primer-tercio":
      return {
        ...base,
        status: "live",
        half: 1,
        turnNumber: 3,
        activeSide: "home",
        homeScore: 1,
        awayScore: 0,
        events: narrativeEvents.slice(0, 6),
      };
    case "segundo-tercio":
      return {
        ...base,
        status: "live",
        half: 2,
        turnNumber: 5,
        homeScore: 2,
        awayScore: 1,
        events: narrativeEvents.slice(0, 10),
      };
    case "finalizado":
      return {
        ...base,
        status: "finished",
        half: 2,
        turnNumber: TURNS_PER_HALF,
        homeScore: 2,
        awayScore: 1,
        events: [...narrativeEvents],
      };
  }
}

/**
 * Stamp one event from the CURRENT state (pure): monotonic `seq` supplied by
 * the caller, `half`/`turnNumber` copied from the state, `at` derived from the
 * deterministic demo clock (never `Date.now()`).
 */
function stampEvent(
  state: ActaDemoState,
  draft: EventDraft,
  seq: number,
): LiveMatchEventDto {
  return {
    seq,
    kind: draft.kind,
    side: draft.side ?? null,
    playerRosterId: draft.playerRosterId ?? null,
    half: state.half,
    turnNumber: state.turnNumber,
    payload: draft.payload ?? {},
    at:
      (state.startedAt ?? 0) +
      (((state.half - 1) * MIN_PER_HALF + state.turnNumber * MIN_PER_TURN) *
        MIN),
  };
}

/** Append stamped events (pure): copies the array, bumps `nextSeq` per event. */
function appendEvents(
  state: ActaDemoState,
  drafts: readonly EventDraft[],
): ActaDemoState {
  let seq = state.nextSeq;
  const stamped = drafts.map((draft) => stampEvent(state, draft, seq++));
  return {
    ...state,
    events: [...state.events, ...stamped],
    nextSeq: seq,
  };
}

/** Score bump patch for one side (+1), or nothing when no side applies. */
function scoreBump(
  state: ActaDemoState,
  side: "home" | "away" | null | undefined,
): Partial<ActaDemoState> {
  if (side === "home") return { homeScore: state.homeScore + 1 };
  if (side === "away") return { awayScore: state.awayScore + 1 };
  return {};
}

/** The neutral start of a pre-match capture (nothing confirmed). */
function emptyPreMatch(): ActaDemoPreMatch {
  return {
    fans: { home: null, away: null },
    weatherDice: { home: null, away: null },
    kickDice: { home: null, away: null },
    inducementsDone: { home: false, away: false },
    kicking: null,
  };
}

/**
 * True only when BOTH sides hold every pre-match mark (S6): both fan lines,
 * both weather dice, both inducement confirmations, both kick dice and the
 * kicking decision. A null capture is always incomplete.
 */
export function preMatchComplete(preMatch: ActaDemoPreMatch | null): boolean {
  if (preMatch == null) return false;
  return (
    preMatch.fans.home != null &&
    preMatch.fans.away != null &&
    preMatch.weatherDice.home != null &&
    preMatch.weatherDice.away != null &&
    preMatch.inducementsDone.home &&
    preMatch.inducementsDone.away &&
    preMatch.kickDice.home != null &&
    preMatch.kickDice.away != null &&
    preMatch.kicking != null
  );
}

function asSide(value: unknown): "home" | "away" | null {
  if (value === "home") return "home";
  if (value === "away") return "away";
  return null;
}

function asRosterId(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asAckStatus(value: unknown): "ok" | "nok" | "pending" | null {
  if (value === "ok") return "ok";
  if (value === "nok") return "nok";
  if (value === "pending") return "pending";
  return null;
}

/**
 * Map a live command onto demo events (pure). Unknown or malformed commands
 * never throw: they echo their `type` as an event when it is a string and are
 * dropped otherwise.
 */
function applyCommand(state: ActaDemoState, raw: unknown): ActaDemoState {
  if (raw == null || typeof raw !== "object") return state;
  const cmd = raw as { type?: unknown } & Record<string, unknown>;
  if (typeof cmd.type !== "string") return state;

  const side = asSide(cmd.side);
  const playerRosterId = asRosterId(cmd.playerRosterId);

  switch (cmd.type) {
    case "td":
      return {
        ...appendEvents(state, [{ kind: "td", side, playerRosterId }]),
        ...scoreBump(state, side),
      };
    case "completion":
    case "interception":
    case "throwTeamMate":
    case "landedSafe":
      return appendEvents(state, [{ kind: cmd.type, side, playerRosterId }]);
    case "casualty": {
      const payload: Record<string, unknown> = {
        victimRosterId: cmd.victimRosterId ?? null,
        cause: cmd.cause ?? null,
        roll16: cmd.roll16 ?? null,
      };
      if (cmd.causerRosterId != null) payload.causerRosterId = cmd.causerRosterId;
      if (cmd.roll6 != null) payload.roll6 = cmd.roll6;
      if (cmd.bothDown != null) payload.bothDown = cmd.bothDown;
      return appendEvents(state, [{ kind: "casualty", side, playerRosterId, payload }]);
    }
    case "foul":
      return appendEvents(state, [
        {
          kind: "foul",
          side,
          playerRosterId,
          payload: { victimRosterId: cmd.victimRosterId ?? null },
        },
      ]);
    case "weather": {
      // S2 (Cambiar clima): a side-less weather event carrying the FIXED T1
      // payload contract — `{ value, roll? }` (the generic fallback would map
      // the kind but drop the payload). A malformed command is dropped whole.
      if (typeof cmd.value !== "string") return state;
      const payload: Record<string, unknown> = { value: cmd.value };
      if (typeof cmd.roll === "number") payload.roll = cmd.roll;
      return appendEvents(state, [
        { kind: "weather", side: null, playerRosterId: null, payload },
      ]);
    }
    case "endTurn": {
      const reason = cmd.reason ?? "voluntary";
      const drafts: EventDraft[] = [
        {
          kind: "turnStart",
          side,
          playerRosterId: null,
          payload: { reason },
        },
      ];
      const activeSide: "home" | "away" = state.activeSide === "home" ? "away" : "home";
      const patch: Partial<ActaDemoState> = { activeSide };
      if (state.autoFollow) patch.viewerSide = activeSide;
      if (state.half === 2 && state.turnNumber === TURNS_PER_HALF) {
        patch.status = "finished";
        drafts.push({ kind: "endMatch", side: null, playerRosterId: null });
      } else if (state.turnNumber === TURNS_PER_HALF) {
        patch.half = 2;
        patch.turnNumber = 1;
        drafts.push({ kind: "endHalf", side: null, playerRosterId: null });
      } else {
        patch.turnNumber = state.turnNumber + 1;
      }
      return { ...appendEvents(state, drafts), ...patch };
    }
    case "acknowledgeEvent": {
      const eventSeq = cmd.eventSeq;
      const status = asAckStatus(cmd.status);
      if (typeof eventSeq !== "number" || status == null) return state;
      const events = state.events.map((event) =>
        event.seq === eventSeq ? { ...event, ackStatus: status } : event,
      );
      return { ...state, events };
    }
    case "begin":
      return appendEvents(state, [{ kind: "start", side, playerRosterId }]);
    case "consent":
      return appendEvents(state, [{ kind: "consent", side, playerRosterId }]);
    case "retractConsent":
      return appendEvents(state, [
        { kind: "retractConsent", side, playerRosterId },
      ]);
    case "resolveMatch":
      return {
        ...appendEvents(state, [{ kind: "endMatch", side, playerRosterId }]),
        status: "finished",
      };
    default:
      // nominateMvp / rollMvp and any unknown command echo their `type` string.
      return appendEvents(state, [{ kind: cmd.type, side, playerRosterId }]);
  }
}

/**
 * The demo state machine. Pure: every case returns a new state object (or the
 * untouched input for no-ops) and neither the input state nor its arrays and
 * objects are ever mutated.
 */
export function actaDemoReducer(
  state: ActaDemoState,
  action: ActaDemoAction,
): ActaDemoState {
  switch (action.type) {
    case "registerEvent": {
      const draft: EventDraft = {
        kind: action.kind,
        side: action.side ?? null,
        playerRosterId: action.playerRosterId ?? null,
        payload: action.payload,
      };
      return {
        ...appendEvents(state, [draft]),
        ...scoreBump(state, action.score?.side),
      };
    }
    case "commitPreMatch": {
      // PER-SIDE capture (S2c): one commit touches ONLY the committing side;
      // the shared acta events (`fan_factor` merged, `weather` on the 2D6 sum)
      // derive from the merged per-side marks.
      const commit = action.commit;
      const preMatch = state.preMatch ?? emptyPreMatch();

      if (commit.step === "fanRoll") {
        const rival: "home" | "away" = commit.side === "home" ? "away" : "home";
        const fans = { home: preMatch.fans.home, away: preMatch.fans.away };
        fans[commit.side] = commit.line;
        // The rival keeps their confirmed line, else the per-side line of the
        // LATEST `fan_factor` event payload (the demo's kickoff fixture).
        fans[rival] = fans[rival] ?? fanFactorOf(state.events, rival);
        return {
          ...appendEvents(state, [
            {
              kind: "fan_factor",
              side: null,
              payload: { home: fans.home, away: fans.away },
            },
          ]),
          preMatch: { ...preMatch, fans },
        };
      }

      if (commit.step === "weatherRoll") {
        const weatherDice = {
          home: preMatch.weatherDice.home,
          away: preMatch.weatherDice.away,
        };
        weatherDice[commit.side] = commit.die;
        const nextPreMatch = { ...preMatch, weatherDice };
        // The 2D6 weather resolves only when BOTH coaches confirmed a die.
        if (weatherDice.home != null && weatherDice.away != null) {
          const roll = weatherDice.home + weatherDice.away;
          return {
            ...appendEvents(state, [
              {
                kind: "weather",
                side: null,
                payload: { value: weatherFromRoll(roll).kind, roll },
              },
            ]),
            preMatch: nextPreMatch,
          };
        }
        return { ...state, preMatch: nextPreMatch };
      }

      if (commit.step === "inducements") {
        const carts = state.inducements ?? { home: [], away: [] };
        const items = commit.items.map((item) => ({ ...item }));
        return {
          ...state,
          // ONLY the committing side's cart is replaced — the rival's is kept.
          inducements: {
            home:
              commit.side === "home"
                ? items
                : carts.home.map((item) => ({ ...item })),
            away:
              commit.side === "away"
                ? items
                : carts.away.map((item) => ({ ...item })),
          },
          preMatch: {
            ...preMatch,
            inducementsDone: {
              home: preMatch.inducementsDone.home || commit.side === "home",
              away: preMatch.inducementsDone.away || commit.side === "away",
            },
          },
        };
      }

      if (commit.step === "kickRoll") {
        const kickDice = {
          home: preMatch.kickDice.home,
          away: preMatch.kickDice.away,
        };
        kickDice[commit.side] = commit.die;
        return { ...state, preMatch: { ...preMatch, kickDice } };
      }

      if (commit.step === "kickTie") {
        // A committed tie clears BOTH dice for the shared re-roll.
        return {
          ...state,
          preMatch: {
            ...preMatch,
            kickDice: { home: null, away: null },
            kicking: null,
          },
        };
      }

      // commit.step === "kicking": the winner's decision.
      return { ...state, preMatch: { ...preMatch, kicking: commit.kicking } };
    }
    case "submitCommand":
      return applyCommand(state, action.command);
    case "switchPerspective":
      return { ...state, viewerSide: action.side };
    case "setAutoFollow":
      return { ...state, autoFollow: action.on };
    case "submitClosure":
      return { ...state, submittedBy: action.side };
    case "openClosure":
      return state.status === "finished" && !state.closureOpen
        ? { ...state, closureOpen: true }
        : state;
    case "finish":
      return state.status === "finished"
        ? state
        : { ...state, status: "finished" };
    case "reset": {
      const base = demoState(action.scenario);
      if (action.scenario !== "inicio") return base;
      // Restablecer = a FRESH match (user decision, 2026-11-13): the pre-match
      // capture starts from scratch (the wizard walks from Paso 1) and the acta
      // holds no pre-match facts until they are captured again.
      return {
        ...base,
        inducements: { home: [], away: [] },
        preMatch: emptyPreMatch(),
        matchStarted: false,
        events: base.events.filter(
          (event) => event.kind !== "weather" && event.kind !== "fan_factor",
        ),
      };
    }
    case "hydrate":
      // Old saves predate `matchStarted` — they were matches underway, so a
      // missing flag keeps the old behavior (the capture bar stays up).
      return {
        ...demoState("inicio"),
        ...action.saved,
        matchStarted: action.saved.matchStarted ?? true,
      };
  }
}
