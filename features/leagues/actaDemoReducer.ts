import { rollD6 } from "@/lib/random";
import { permanentAttribute, resolveInjury } from "@/lib/rules/injuries";
import {
  kickoffDuelResult,
  kickoffEventFor,
  type KickoffEvent,
} from "@/lib/rules/kickoffEvents";
import { weatherFromRoll } from "@/lib/rules/weather";

import type { LiveCommand, LiveMatchEventDto, LiveMatchViewState } from "./api";
import { MIN, liveState, matchDetail, narrativeEvents } from "./actaFlow.fixtures";
import { fanFactorOf, type FanFactorLine } from "./actaPreMatch";
import type { PreMatchCommit } from "./actaPreMatchWizard";
import type { KnockdownCommand } from "./liveActionEntry";

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
  /** T28 («Plegarias a Nuffle», L92): the per-side 1D16 prayer rolls — one
   *  per «Plegaria a Nuffle» bought, persisted as the team rolls. The demo
   *  producer for the team's `activePrayers` (lib/rules/inducements
   *  `activePrayersFromRolls`). ADDITIVE optional field: a v5 save without it
   *  loads unchanged (no version bump, no state change without prayers).
   *  PRODUCTION live flow (liveMatch/liveStore producer + the
   *  liveEventCards.tsx call site) stays OUT of scope — demo-first, MVT-6
   *  stance (the T26 production half remains its own task). */
  prayerRolls?: { home: number[]; away: number[] };
  /** Winner's decision: who kicks. */
  kicking: "home" | "away" | null;
}

/**
 * S3 · Kickoff con efectos 2D6 (T4, design C «Acta secuencial»): the kickoff
 * gate's own dice. `registered` marks the gate done — every scenario starts
 * past kickoff (S1) EXCEPT the fresh-match reset («Restablecer»).
 */
export interface ActaDemoKickoff {
  /** The two 1D6 dice of the kickoff 2D6 roll (null until thrown). */
  d1: number | null;
  d2: number | null;
  /** True once the kickoff rows are stamped on the acta (gate closed). */
  registered: boolean;
  /** The opposed follow-up (faces 6/7/11/12) per side; null on the others. */
  followUp: { home: number | null; away: number | null } | null;
  /** U12 · L32: "auto" = thrown by the app (locks manual entry, one-shot). */
  source: "auto" | null;
  /** U12 · L32: the opposed duel was resolved by the table (skip button). */
  duelManual: boolean;
}

export interface ActaDemoState extends LiveMatchViewState {
  events: LiveMatchEventDto[];
  closureOpen: boolean;
  autoFollow: boolean;
  /** Side that OPENED the current turn — the pair rule only advances
   *  `turnNumber` when this side's rival has also played the turn. */
  turnStarter?: "home" | "away" | null;
  submittedBy: "home" | "away" | null;
  nextSeq: number;
  /** Fase 1 · Pre-partido capture (S5) — see `ActaDemoPreMatch`. */
  preMatch: ActaDemoPreMatch | null;
  /** S6: the in-game capture bar renders only when the match has really
   *  started (every fixture preset is a match underway; only a fresh
   *  pre-match sequence keeps this false). */
  matchStarted: boolean;
  /** S3 · Kickoff gate (T4) — see `ActaDemoKickoff`. */
  kickoff: ActaDemoKickoff;
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
  | {
      type: "submitCommand";
      /** The live command union PLUS the additive T17 `knockdown` command
       *  (applied by `applyCommand`; `api.ts`'s `LiveCommand` is a fixed
       *  surface outside this slice). */
      command: LiveCommand | KnockdownCommand;
    }
  | { type: "switchPerspective"; side: "home" | "away" }
  | { type: "setAutoFollow"; on: boolean }
  | { type: "submitClosure"; side: "home" | "away" }
  | { type: "openClosure" }
  | { type: "finish" }
  | { type: "reset"; scenario: DemoScenario }
  | { type: "commitPreMatch"; commit: PreMatchCommit }
  | { type: "rollKickoff" }
  | { type: "rollKickoffDuel"; side: "home" | "away" }
  | { type: "setKickoffDie"; die: 1 | 2; value: number | null }
  | { type: "setKickoffDuelDie"; side: "home" | "away"; value: number | null }
  | { type: "skipKickoffDuel" }
  | { type: "registerKickoff" }
  | { type: "hydrate"; saved: ActaDemoState };

/** Turns per half in Blood Bowl; each turn is a PAIR of plays (home + away share one number), so `endTurn` rolls 1T8 → 2T1 and 2T8 → finished only on the pair's closing flip. */
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
    // S1: every scenario starts past kickoff — the gate is already done.
    kickoff: {
      d1: null,
      d2: null,
      registered: true,
      followUp: null,
      source: null,
      duelManual: false,
    },
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
        // T22 residual (L74-L75): score = the narrative feed's TD tally —
        // slice(0, 6) has 0 TDs, so home starts 0 (was 1, drifting).
        homeScore: 0,
        awayScore: 0,
        events: narrativeEvents.slice(0, 6),
      };
    case "segundo-tercio":
      return {
        ...base,
        status: "live",
        half: 2,
        turnNumber: 5,
        // T22 · L51 (b): score = the narrative feed's TD tally (1 home TD,
        // seq 9) — `validateActa`'s Σ anotaciones == marcador guard blocks
        // the closure save on any drift (the feed is the source of truth).
        homeScore: 1,
        awayScore: 1,
        events: narrativeEvents.slice(0, 10),
      };
    case "finalizado":
      return {
        ...base,
        status: "finished",
        half: 2,
        turnNumber: TURNS_PER_HALF,
        // T22 · L51 (b): same feed-aligned tally as «segundo-tercio» — the
        // stock closure must save over these scores (see the T22 suite).
        homeScore: 1,
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
 * both weather dice, both inducement confirmations, both kick dice AND the
 * receiver decision (who kicks — picked AFTER the sequence, S7.9). A null
 * capture is always incomplete. This gates the whole match (`matchStarted`).
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

/**
 * True when ONE side holds every pre-match mark (S7.3/S7.4): its fan line,
 * weather die, inducement confirmation and kick die. A null capture is never
 * complete. Who RECEIVES is a POST-sequence decision (S7.9): it gates the
 * whole match via `preMatchComplete`, never a single side. T28 («Plegarias de
 * Nuffle»): the prayer rolls never gate a side — the wizard's forward-only
 * sequence forces the reveal step (and its rolls) before the kick die, so
 * `kickDice` already implies them (L56: no gate change, no state change
 * without prayers). This is the ONLY
 * gate behind the closed sequence («una vez rellenado todo y le demos a
 * finalizar ya no podremos editar») and the «Esperando al contrincante…»
 * screen — no extra state flags.
 */
export function sideCompleteOf(
  preMatch: ActaDemoPreMatch | null,
  side: "home" | "away",
): boolean {
  if (preMatch == null) return false;
  return (
    preMatch.fans[side] != null &&
    preMatch.weatherDice[side] != null &&
    preMatch.inducementsDone[side] &&
    preMatch.kickDice[side] != null
  );
}

function asSide(value: unknown): "home" | "away" | null {
  if (value === "home") return "home";
  if (value === "away") return "away";
  return null;
}

/** The demo fixture's team names (the acta rows name the sides). */
function teamNames(): { home: string; away: string } {
  const detail = matchDetail();
  return { home: detail.homeTeam.name, away: detail.awayTeam.name };
}

/** 6/7 favour the highest opposed total; 11/12 punish the lowest. */
function isBenefitFace(event: KickoffEvent): boolean {
  return event.sum === 6 || event.sum === 7;
}

/**
 * The opposed duel line (row ③ of the sequential kickoff acta): the two 1D6
 * totals and the tie rule PER THAT EVENT'S TEXT — 6/7 tie → both win, 11/12
 * tie → both are hit. An unresolved duel is recorded honestly as manual.
 * Shared by the reducer's stamped rows and the gate's live preview.
 */
export function kickoffDuelLine(
  event: KickoffEvent,
  followUp: { home: number | null; away: number | null } | null,
  names: { home: string; away: string },
): string {
  const head = `Kickoff · Duelo 1D6: ${followUp?.home ?? "—"} vs ${
    followUp?.away ?? "—"
  } →`;
  if (followUp?.home == null || followUp.away == null) {
    return `${head} sin resolver (manual)`;
  }
  const result = kickoffDuelResult(event, {
    home: followUp.home,
    away: followUp.away,
  });
  if (result.tie) {
    return `${head} empate: ambos ${
      isBenefitFace(event) ? "ganan el beneficio" : "sufren el efecto"
    }`;
  }
  return `${head} ${isBenefitFace(event) ? "gana" : "afecta a"} ${
    names[result.affected[0]]
  }`;
}

/**
 * The registro line (row ④ of the sequential kickoff acta): «Kickoff ·
 * <evento> → …». Shared by the reducer's award row and the gate's preview.
 */
export function kickoffRegisterLine(
  event: KickoffEvent,
  followUp: { home: number | null; away: number | null } | null,
  names: { home: string; away: string },
): string {
  const head = `Kickoff · ${event.name} →`;
  if (event.resolution === "manual") {
    return `${head} Aplicación manual en la demo`;
  }
  if (event.resolution === "weather") {
    // Event 8 reuses the existing weather machinery (a new 2D6 weather roll).
    return `${head} nueva tirada de Clima`;
  }
  if (followUp?.home == null || followUp.away == null) {
    return `${head} duelo sin resolver (manual)`;
  }
  const result = kickoffDuelResult(event, {
    home: followUp.home,
    away: followUp.away,
  });
  const totals = `(${followUp.home} vs ${followUp.away})`;
  if (result.tie) {
    return `${head} empate: ambos ${
      isBenefitFace(event) ? "ganan el beneficio" : "sufren el efecto"
    } ${totals}`;
  }
  return `${head} ${
    isBenefitFace(event) ? "beneficio para" : "efecto sobre"
  } ${names[result.affected[0]]} ${totals}`;
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
      // T21: persist the derived band so demo casualty payloads converge with
      // production (the victim-note «Efecto» row reads it; deriveCasualtyOutcome
      // would throw on permanent without roll6, so derive the kind directly).
      if (typeof cmd.roll16 === "number") {
        const outcome = resolveInjury(cmd.roll16);
        payload.band = outcome.kind;
        if (outcome.kind === "permanent" && typeof cmd.roll6 === "number") {
          payload.permanentAttribute = permanentAttribute(cmd.roll6);
        }
      }
      return appendEvents(state, [{ kind: "casualty", side, playerRosterId, payload }]);
    }
    case "knockdown": {
      // T17 (S10.1/S10.2): the standalone «Derribo» entry of the guided combat
      // chain. `side` is the RECORDER's (the tackler's coach — S10.4.1) and the
      // causer is the acting player; the payload carries the chain whole
      // (block dice, picked face and — on a defender knockdown — the armour
      // 2D6 vs the victim's AV).
      const payload: Record<string, unknown> = {
        causerRosterId: cmd.causerRosterId ?? null,
        victimRosterId: cmd.victimRosterId ?? null,
        blockDice: Array.isArray(cmd.blockDice) ? cmd.blockDice : [],
        face: cmd.face ?? null,
      };
      if (typeof cmd.armourRoll === "number") payload.armourRoll = cmd.armourRoll;
      if (typeof cmd.victimAv === "number") payload.victimAv = cmd.victimAv;
      if (typeof cmd.armourBroken === "boolean") {
        payload.armourBroken = cmd.armourBroken;
      }
      return appendEvents(state, [
        {
          kind: "knockdown",
          side,
          playerRosterId: asRosterId(cmd.causerRosterId),
          payload,
        },
      ]);
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
      // Pair rule: BOTH coaches play the same turn number. `turnStarter` is
      // the side that opened it (self-adopted from the first flip), and only
      // the rival's flip closes the pair and advances the turn number.
      const starter: "home" | "away" = state.turnStarter ?? state.activeSide;
      const activeSide: "home" | "away" = state.activeSide === "home" ? "away" : "home";
      const patch: Partial<ActaDemoState> = { activeSide, turnStarter: starter };
      if (state.autoFollow) patch.viewerSide = activeSide;
      const closesPair = state.activeSide !== starter;
      if (closesPair && state.half === 2 && state.turnNumber === TURNS_PER_HALF) {
        patch.status = "finished";
        drafts.push({ kind: "endMatch", side: null, playerRosterId: null });
      } else if (closesPair && state.turnNumber === TURNS_PER_HALF) {
        patch.half = 2;
        patch.turnNumber = 1;
        // The kickoff receiver flips with the halves (BB: the half's kicker
        // receives the next half, so the other side opens it).
        patch.turnStarter = starter === "home" ? "away" : "home";
        drafts.push({ kind: "endHalf", side: null, playerRosterId: null });
      } else if (closesPair) {
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

      if (commit.step === "prayersRoll") {
        // T28 (L92): one 1D16 per «Plegaria a Nuffle» bought, persisted as
        // the team rolls. The rulebook re-rolls repeats («repitiendo
        // cualquier resultado que ya hayas obtenido») — the roller re-rolls
        // them and the state NEVER stores one; a real face is 1-16 (never
        // invented).
        if (!Number.isInteger(commit.roll) || commit.roll < 1 || commit.roll > 16) {
          return state;
        }
        const prayerRolls = {
          home: preMatch.prayerRolls?.home ?? [],
          away: preMatch.prayerRolls?.away ?? [],
        };
        if (prayerRolls[commit.side].includes(commit.roll)) return state;
        return {
          ...state,
          preMatch: {
            ...preMatch,
            prayerRolls: {
              ...prayerRolls,
              [commit.side]: [...prayerRolls[commit.side], commit.roll],
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

      // commit.step === "kicking": the winner's decision — who RECEIVES
      // (the commit stores who KICKS; S7.10's inverted commit).
      const receiver: "home" | "away" =
        commit.kicking === "home" ? "away" : "home";
      return {
        ...state,
        preMatch: { ...preMatch, kicking: commit.kicking },
        // kickoff resolved externally per L39 («la patada inicial se hara de
        // manera externa»): the initial kick happens OUTSIDE the app, so the
        // gate reads resolved (it can never open) and NO kickoff rows are
        // ever recorded — the S3 kickoff machinery stays in the codebase,
        // out of the flow (reversible).
        kickoff: { ...state.kickoff, registered: true },
        // The match starts DIRECTLY in turn 1 with the RECEIVING team active
        // (the one that keeps the ball / attacks first).
        matchStarted: true,
        activeSide: receiver,
        turnStarter: receiver,
        // The demo camera follows the active coach onto the receiver (same
        // auto-follow rule as endTurn) so turn 1 is playable immediately.
        ...(state.autoFollow ? { viewerSide: receiver } : {}),
      };
    }
    case "rollKickoff": {
      // S3 · the kickoff 2D6 (two dice from @/lib/random) — ONE throw per
      // match: once recorded it never re-rolls (S7.6 philosophy).
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.d1 != null) return state;
      const d1 = rollD6();
      const d2 = rollD6();
      const event = kickoffEventFor(d1, d2);
      return {
        ...state,
        kickoff: {
          ...kickoff,
          d1,
          d2,
          // U12 · L32: an automatic throw locks manual entry (one-shot).
          source: "auto",
          // The opposed follow-up (6/7/11/12) opens one slot per side.
          followUp:
            event.resolution === "opposed"
              ? { home: null, away: null }
              : null,
        },
      };
    }
    case "rollKickoffDuel": {
      // S3 · the opposed follow-up: one 1D6 per side, recorded once each.
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.followUp == null) return state;
      if (kickoff.followUp[action.side] != null) return state;
      return {
        ...state,
        kickoff: {
          ...kickoff,
          followUp: { ...kickoff.followUp, [action.side]: rollD6() },
        },
      };
    }
    case "setKickoffDie": {
      // U12 · L32 — the table may TYPE each kickoff face (1-6) instead of
      // rolling: manual entry stays open until registration, while an
      // AUTOMATIC throw stays locked (one-shot).
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.source === "auto") return state;
      const { value } = action;
      if (
        value !== null &&
        (!Number.isInteger(value) || value < 1 || value > 6)
      ) {
        return state;
      }
      const d1 = action.die === 1 ? value : kickoff.d1;
      const d2 = action.die === 2 ? value : kickoff.d2;
      const base = { ...kickoff, d1, d2 };
      if (d1 == null || d2 == null) return { ...state, kickoff: base };
      // Both faces known → resolve like an automatic throw would: open the
      // opposed slots (unless real duel throws already live there) and drop
      // them again if the new face is not opposed.
      const event = kickoffEventFor(d1, d2);
      return {
        ...state,
        kickoff: {
          ...base,
          followUp:
            event.resolution === "opposed"
              ? kickoff.followUp ?? { home: null, away: null }
              : null,
        },
      };
    }
    case "setKickoffDuelDie": {
      // U12 · L32 — each coach enters their OWN 1D6 by hand when the table
      // prefers not to roll; possible until registration.
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.followUp == null) return state;
      const { value } = action;
      if (
        value !== null &&
        (!Number.isInteger(value) || value < 1 || value > 6)
      ) {
        return state;
      }
      return {
        ...state,
        kickoff: {
          ...kickoff,
          followUp: { ...kickoff.followUp, [action.side]: value },
        },
      };
    }
    case "skipKickoffDuel": {
      // U12 · L32 — the opposed duel is OPTIONAL: the table can resolve it
      // by hand (registration already records «sin resolver (manual)»).
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.followUp == null || kickoff.duelManual) {
        return state;
      }
      return { ...state, kickoff: { ...kickoff, duelManual: true } };
    }
    case "registerKickoff": {
      // S3 · the sequential kickoff acta rows (roll → event → [duel] →
      // [weather] → award). DEMO-ONLY kinds: the production server never
      // emits `kickoff` (openspec MVT-6 forbids surfacing kickoff-table
      // events in the production feed).
      const kickoff = state.kickoff;
      if (kickoff.registered || kickoff.d1 == null || kickoff.d2 == null) {
        return state;
      }
      const event = kickoffEventFor(kickoff.d1, kickoff.d2);
      const sum = kickoff.d1 + kickoff.d2;
      const names = teamNames();
      const base = { sum, eventId: event.id };
      const drafts: EventDraft[] = [
        {
          kind: "kickoff",
          payload: {
            ...base,
            phase: "roll",
            d1: kickoff.d1,
            d2: kickoff.d2,
            note: `Kickoff · 2D6: ${kickoff.d1} + ${kickoff.d2} = ${sum}`,
          },
        },
        {
          kind: "kickoff",
          payload: { ...base, phase: "event", note: `Kickoff · ${event.name}` },
        },
      ];
      if (kickoff.followUp != null) {
        drafts.push({
          kind: "kickoff",
          payload: {
            ...base,
            phase: "duel",
            home: kickoff.followUp.home,
            away: kickoff.followUp.away,
            note: kickoffDuelLine(event, kickoff.followUp, names),
          },
        });
      }
      if (event.resolution === "weather") {
        // Event 8 reuses the EXISTING weather machinery (S2): a fresh 2D6
        // resolves on the weather table and derives into the acta as the
        // standard `weather` event (same shape `commitPreMatch` derives).
        const roll = rollD6() + rollD6();
        drafts.push({
          kind: "weather",
          payload: { value: weatherFromRoll(roll).kind, roll },
        });
      }
      drafts.push({
        kind: "kickoff",
        payload: {
          ...base,
          phase: "award",
          note: kickoffRegisterLine(event, kickoff.followUp, names),
        },
      });
      return {
        ...appendEvents(state, drafts),
        kickoff: { ...kickoff, registered: true },
      };
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
        // S3 · a fresh match meets the kickoff gate («Restablecer» = partido
        // fresco): the 2D6 kickoff roll is NOT registered yet.
        kickoff: {
          d1: null,
          d2: null,
          registered: false,
          followUp: null,
          source: null,
          duelManual: false,
        },
        events: base.events.filter(
          (event) => event.kind !== "weather" && event.kind !== "fan_factor",
        ),
      };
    }
    case "hydrate":
      // Old saves predate `matchStarted` — they were matches underway, so a
      // missing flag keeps the old behavior (the capture bar stays up). Same
      // for the kickoff slice (S3): a save without it started past kickoff.
      return {
        ...demoState("inicio"),
        ...action.saved,
        matchStarted: action.saved.matchStarted ?? true,
        kickoff: {
          d1: action.saved.kickoff?.d1 ?? null,
          d2: action.saved.kickoff?.d2 ?? null,
          registered: action.saved.kickoff?.registered ?? true,
          followUp: action.saved.kickoff?.followUp ?? null,
          source: action.saved.kickoff?.source ?? null,
          duelManual: action.saved.kickoff?.duelManual ?? false,
        },
      };
  }
}
