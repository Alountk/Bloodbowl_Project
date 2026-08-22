/**
 * Live-match persistence + fan-out store (LM-6, D16/D18).
 *
 * The control POST uses these functions to run the pure transition (from
 * `lib/liveMatch.ts`) and persist it atomically under an optimistic `seq`
 * guard, then publish to the hub AFTER commit:
 *
 * - `consentLiveMatch` creates the LiveMatch row on FIRST consent (D16) or
 *   applies a subsequent consent as a transition; when both booleans are true
 *   the persisted status becomes `ready` (LM-11).
 * - `retractLiveConsent` clears a side's boolean and returns the row to
 *   `pending`.
 * - `beginLiveMatch` runs `ready → live` ONLY via the first turn (LM-3).
 * - `applyTransition` bumps an existing LiveMatch row via `updateMany({ where: {
 *   id, seq: prev } })`; a 0-row result ⇒ double action / seq conflict → 409. The
 *   delta LiveEvent(s) are created in the same transaction so the guard and the
 *   append are atomic. Publish happens only after the transaction commits.
 *
 * The unified clock (LM-5) makes the DB the source of truth: the active side's
 * accumulator is bumped at boundaries (`applyTransition` callers already folded
 * in-flight via `accumulate`; `pauseLiveMatch` bumps it on grace expiry per LM-7/
 * D18) and `clockStartedAt` is the running segment start (null while paused or
 * pre-live). `seq` remains monotonically increasing (LM-6).
 */

import type { LiveMatch, LiveEvent, Player, Prisma } from "@prisma/client";
import {
  beginMatch,
  consentStart,
  retractConsent,
  proposeConcede,
  declineConcede,
  acceptConcede,
  proposeCasualty,
  confirmCasualty,
  toLiveViewState,
  isStartableFixture,
  parseMvpNominations,
  EMPTY_MVP_NOMINATIONS,
  type FixtureStartState,
  type LiveMatchState,
  type MvpNominations,
  type PendingCasualty,
  type TeamSide,
} from "./liveMatch";
import type { CasualtyCause } from "./livePhase";
import { buildKickoffEvents, type BuildKickoffEventsInput } from "./kickoff";
import { maybeCloseLeague } from "./standings";
import { computeWinnings, preMatchFanFactor, postMatchFanFactor, type MatchOutcome } from "@/lib/rules";
import { rollD3, rollD6 } from "@/lib/random";
import { clearSuspensionUpdate, injurySuspensionUpdate, isLastingBand } from "@/lib/playerInjuries";
import {
  computeMvpGrantee,
  computePettyCash,
  computeTeamTv,
  deriveWinnerId,
} from "@/lib/result";
import {
  addMvpPe,
  casualtyVictimsFromEvents,
  deriveLivePeAwards,
  journeymanSnapshotEarned,
  validateMvpNominations,
  validateSingleMvpNomination,
  type ResolveEventLike,
  type SnapshotSideLike,
} from "./liveResolve";
import { DEFAULT_COACHING, isCoachingStaff, type PlayerEntry } from "@/features/teams/types";
import { getRaceById } from "@/features/teams/data/races";
import {
  computeRosterCostFromPlayers,
  computeCoachingCost,
  MAX_PLAYERS,
} from "@/features/teams/roster";
import { createId } from "@/features/teams/id";
import {
  linemanPositionalOf,
  parsePersistedJourneymen,
  type PersistedJourneyman,
  type PersistedJourneymen,
} from "./journeymen";

/** Minimal Prisma transaction surface the store uses (injectable for tests). */
export interface StoreTx {
  liveMatch: {
    updateMany(args: Prisma.LiveMatchUpdateManyArgs): Promise<{ count: number }>;
    create?(args: Prisma.LiveMatchCreateArgs): Promise<LiveMatch>;
    /** RAU-44: the finish-time idempotency read — already-persisted winnings
     * are never recomputed/overwritten (the row is terminal once finished). */
    findUnique(args: {
      where: { id: string };
      select: { winnings: true };
    }): Promise<{ winnings: Prisma.JsonValue | null } | null>;
  };
  liveEvent: {
    create(args: Prisma.LiveEventCreateArgs): Promise<LiveEvent>;
    /** RAU-49: appends the home+away mvp events (LM-mvp parity) and resolves the
     * next event seq in the same transaction as the resolve write. */
    aggregate(args: {
      where: { liveMatchId: string };
      _max: { seq: true };
    }): Promise<{ _max: { seq: number | null } | null }>;
    createMany(args: Prisma.LiveEventCreateManyArgs): Promise<{ count: number }>;
  };
  team: {
    updateMany(args: Prisma.TeamUpdateManyArgs): Promise<{ count: number }>;
    /** RAU-44: reads each side's `coaching` JSON to derive its roster
     * dedicated-fans characteristic for the finish-time winnings formula. The
     * RAU-49 resolve widens the read to the roster/race/players (roster
     * validation, dedicated fans, petty-cash TV) and RAU-51 adds each player's
     * `alive`/`missNextMatch` so `nominateMvp` can reject dead/suspended
     * nominees — all callers pass the FULL select so one concrete signature
     * serves every read. */
    findMany(args: {
      where: { id: { in: string[] } };
      select: {
        id: true;
        raceId: true;
        roster: true;
        coaching: true;
        /** RAU-14: the hire command reads the team's treasury for the balance
         * guard + the paid decrement. */
        treasury: true;
        players: {
          select: { rosterPlayerId: true; valueBonus: true; alive: true; missNextMatch: true };
        };
      };
    }): Promise<
      {
        id: string;
        raceId: string;
        roster: Prisma.JsonValue | null;
        coaching: Prisma.JsonValue | null;
        treasury: number;
        players: { rosterPlayerId: string; valueBonus: number; alive: boolean; missNextMatch: boolean }[];
      }[]
    >;
  };
  /** RAU-49: the resolve transaction needs the MatchResult existence guard
   * (a fixture already has a result → already resolved) and the report write.
   * RAU-13: the hire ALSO reads the persisted `scores` snapshot — the single
   * source of truth for the journeyman's earned PE + injuries. */
  matchResult: {
    findUnique(args: {
      where: { fixtureId: string };
    }): Promise<{ id: string; scores: Prisma.JsonValue | null } | null>;
    create(args: Prisma.MatchResultCreateArgs): Promise<{ id: string }>;
  };
  /** RAU-49: the lazy Player writes — per-player PE increments and the casualty
   * injury appends (skip-unknown/dead semantics mirror the result route).
   * RAU-13: the hire CREATEs the journeyman's row (they are not on the roster
   * until now, so `ensurePlayersForTeam` never made one). */
  player: {
    findMany(args: Prisma.PlayerFindManyArgs): Promise<
      { teamId: string; rosterPlayerId: string; injuries: Prisma.JsonValue | null; alive: boolean }[]
    >;
    updateMany(args: Prisma.PlayerUpdateManyArgs): Promise<{ count: number }>;
    create(args: Prisma.PlayerCreateArgs): Promise<Player>;
  };
  /** RAU-38: the accept-concede transaction closes the fixture (winner + scores)
   * in the SAME tx as the `concede` event rows. */
  fixture: {
    update(args: Prisma.FixtureUpdateArgs): Promise<unknown>;
    /** RAU-40: the tx must be able to re-read the league's fixtures so the
     * accept-concede can auto-close the season when this was the last one. */
    findMany(args: Prisma.FixtureFindManyArgs): Promise<{ homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; winnerId: string | null }[]>;
    /** RAU-44: resolves the fixture's two team ids for the finish-time
     * dedicated-fans read. RAU-49 widens the read to the persisted scores so
     * the resolve can skip the fixture-close for an already-closed concede —
     * both callers pass the FULL select so one concrete signature serves both. */
    findUnique(args: {
      where: { id: string };
      select: {
        homeTeamId: true;
        awayTeamId: true;
        homeScore: true;
        awayScore: true;
        winnerId: true;
      };
    }): Promise<{
      homeTeamId: string;
      awayTeamId: string;
      homeScore: number | null;
      awayScore: number | null;
      winnerId: string | null;
    } | null>;
  };
  /** RAU-40: the league row surface `maybeCloseLeague` needs (status read +
   * finished/champion write) inside the accept-concede transaction. */
  league: {
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: "open" | "started" | "finished" } | null>;
    update(args: {
      where: { id: string };
      data: { status: "finished"; championTeamId: string | null };
    }): Promise<unknown>;
  };
}

/** Minimal Prisma + hub surfaces the store needs (injectable for tests). */
export interface StoreDeps {
  prisma: {
    $transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>;
    liveMatch: {
      create(args: Prisma.LiveMatchCreateArgs): Promise<LiveMatch>;
      findFirst(args: Prisma.LiveMatchFindFirstArgs): Promise<LiveMatch | null>;
    };
  };
  hub: {
    publish(fixtureId: string, payload: unknown): void;
  };
  /** RAU-44: the finish-time pre-match FF 1D3 source — injectable so tests are
   * deterministic; defaults to the server-owned real roll. */
  rollD3?: () => number;
  /** RAU-49: the resolve-time MVP 1D6 + post-match FF 1D6 source — injectable
   * so tests are deterministic; defaults to the server-owned real roll. */
  rollD6?: () => number;
}

/** The persisted row fields the store maps to/from a pure state. */
interface LiveMatchRowFields {
  id: string;
  fixtureId: string;
  status: LiveMatch["status"];
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeConsented: boolean;
  awayConsented: boolean;
  startedAt: Date | string | null;
  homeTurnMs: number;
  awayTurnMs: number;
  homeScore: number;
  awayScore: number;
  seq: number;
  paused: boolean;
  clockStartedAt: Date | string | null;
  finishedAt: Date | string | null;
  /** RAU-38: the side that proposed to concede (null until proposed/resolved). */
  concedeProposedBy: TeamSide | null;
  /** RAU-39: the pending casualty proposal JSON (null until proposed/confirmed). */
  pendingCasualty: Prisma.JsonValue | null;
  /** RAU-51: the persisted per-side MJP nominations JSON (`{ home, away }`,
   * null per side = that coach has not nominated yet). */
  mvpNominations: Prisma.JsonValue | null;
}

/** Defensively parses a persisted `pendingCasualty` JSON value into the pure
 * state shape; malformed/unknown values collapse to null (never crash). */
function toPendingCasualty(value: Prisma.JsonValue | null): PendingCasualty | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const proposerSide = v.proposerSide;
  const cause = v.cause;
  const roll16 = v.roll16;
  const roll6 = v.roll6;
  if (
    (proposerSide !== "home" && proposerSide !== "away") ||
    typeof v.victimRosterId !== "string" ||
    typeof v.causerRosterId !== "string" ||
    typeof cause !== "string" ||
    typeof roll16 !== "number"
  ) {
    return null;
  }
  return {
    proposerSide,
    victimRosterId: v.victimRosterId,
    causerRosterId: v.causerRosterId,
    cause: cause as CasualtyCause,
    roll16,
    ...(typeof roll6 === "number" ? { roll6 } : {}),
  };
}

/** Converts a persisted LiveMatch row (ISO statuses/timestamps) into a pure state. */
export function liveMatchRowToState(
  row: Partial<LiveMatch> & LiveMatchRowFields,
): LiveMatchState {
  return {
    seq: row.seq,
    status: row.status,
    half: row.half,
    turnNumber: row.turnNumber,
    activeSide: row.activeSide,
    homeConsented: row.homeConsented,
    awayConsented: row.awayConsented,
    startedAt: row.startedAt ? new Date(row.startedAt).getTime() : null,
    homeTurnMs: row.homeTurnMs,
    awayTurnMs: row.awayTurnMs,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    paused: row.paused,
    clockStartedAt: row.clockStartedAt ? new Date(row.clockStartedAt).getTime() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null,
    concedeProposedBy: row.concedeProposedBy,
    pendingCasualty: toPendingCasualty(row.pendingCasualty ?? null),
    mvpNominations: parseMvpNominations(row.mvpNominations ?? null),
    events: [],
  };
}

function rowData(next: LiveMatchState): Prisma.LiveMatchUpdateManyMutationInput {
  return {
    status: next.status,
    half: next.half,
    turnNumber: next.turnNumber,
    activeSide: next.activeSide,
    homeConsented: next.homeConsented,
    awayConsented: next.awayConsented,
    startedAt: next.startedAt != null ? new Date(next.startedAt) : null,
    homeTurnMs: next.homeTurnMs,
    awayTurnMs: next.awayTurnMs,
    homeScore: next.homeScore,
    awayScore: next.awayScore,
    paused: next.paused,
    clockStartedAt: next.clockStartedAt != null ? new Date(next.clockStartedAt) : null,
    finishedAt: next.finishedAt != null ? new Date(next.finishedAt) : null,
    concedeProposedBy: next.concedeProposedBy,
    // Nullable JSON: SQL NULL when no proposal is pending (Prisma's TS input
    // type omits bare `null`, so the value is cast — the runtime JSON write is
    // exactly the object, or SQL NULL when cleared).
    pendingCasualty: next.pendingCasualty as unknown as
      | Prisma.NullableJsonNullValueInput
      | Prisma.InputJsonValue,
    mvpNominations: next.mvpNominations as unknown as
      | Prisma.NullableJsonNullValueInput
      | Prisma.InputJsonValue,
  };
}

/** The team's dedicated-fans characteristic from its persisted `coaching` JSON
 * (result-route `dedicatedFansOf` precedent); a malformed/absent value falls
 * back to the roster default (1). */
function dedicatedFansOf(coaching: Prisma.JsonValue | null): number {
  return isCoachingStaff(coaching) ? coaching.dedicatedFans : DEFAULT_COACHING.dedicatedFans;
}

/**
 * RAU-44: computes the per-team match winnings for a transition that FINISHES
 * the live match (`next.status === "finished"`), mirroring the result route's
 * server-owned formula — per team a fresh 1D3 + the roster dedicated fans gives
 * the pre-match FF, then `computeWinnings` with `heldBall: true` (a live end
 * never grants the +10k "never held the ball" bonus; the admin corrects it when
 * the result is loaded). Treasury is NOT touched here — it still applies at
 * result-load, so nothing is double-applied. Returns null unless the match JUST
 * finished AND the row has no persisted winnings yet (idempotent: a finished
 * row is terminal, so this guards a re-entrant/retried finish).
 */
async function computeLiveWinnings(
  input: {
    liveMatchId: string;
    fixtureId: string;
    next: LiveMatchState;
    /** RAU-44: the walkover scoreboard for a CONCEDED match (2-0 to the winner).
     * The live state's own scoreboard stays 0-0 on a concede, so without this the
     * winner would lose the 2-TD winnings boost. Auto-finishes pass undefined. */
    finalScore?: { homeScore: number; awayScore: number };
  },
  tx: StoreTx,
  deps: StoreDeps,
): Promise<{ home: number; away: number } | null> {
  if (input.next.status !== "finished") return null;

  const existing = await tx.liveMatch.findUnique({
    where: { id: input.liveMatchId },
    select: { winnings: true },
  });
  if (existing?.winnings != null) return null;

  const fixture = await tx.fixture.findUnique({
    where: { id: input.fixtureId },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, winnerId: true },
  });
  if (!fixture) return null;

  const teams = await tx.team.findMany({
    where: { id: { in: [fixture.homeTeamId, fixture.awayTeamId] } },
    select: {
      id: true,
      raceId: true,
      roster: true,
      coaching: true,
      treasury: true,
      players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
    },
  });
  const byId = new Map(teams.map((team) => [team.id, team]));

  const roll = deps.rollD3 ?? rollD3;
  const preHomeFf = preMatchFanFactor({
    roll3: roll(),
    dedicatedFans: dedicatedFansOf(byId.get(fixture.homeTeamId)?.coaching ?? null),
  });
  const preAwayFf = preMatchFanFactor({
    roll3: roll(),
    dedicatedFans: dedicatedFansOf(byId.get(fixture.awayTeamId)?.coaching ?? null),
  });

  const homeScore = input.finalScore?.homeScore ?? input.next.homeScore;
  const awayScore = input.finalScore?.awayScore ?? input.next.awayScore;

  return {
    home: computeWinnings({
      ffHome: preHomeFf,
      ffAway: preAwayFf,
      ownTds: homeScore,
      heldBall: true,
    }),
    away: computeWinnings({
      ffHome: preAwayFf,
      ffAway: preHomeFf,
      ownTds: awayScore,
      heldBall: true,
    }),
  };
}

/** Shared optimistic-guard persistence: bump seq, write fields, append delta events. */
async function persistAndPublish(
  input: {
    liveMatchId: string;
    fixtureId: string;
    currentSeq: number;
    next: LiveMatchState;
    now: number;
    /** Optional per-team treasury decrements to commit in the SAME transaction as
     * the event rows (LM-23 atomicity): a failure rolls back events AND treasury. */
    treasuryUpdates?: { teamId: string; amountLost: number }[];
    /** RAU-14: the fielded journeymen to persist on the LiveMatch row at begin
     * (additive, never re-typed). Undefined → the field is not touched. */
    journeymen?: PersistedJourneymen;
    /** RAU-38: when set, closes the fixture (winner + scores) in the SAME
     * transaction as the event rows — a concession's victory is atomic with its
     * `concede` event, never a partial state. `leagueId` lets the store run the
     * RAU-40 season-close check (last fixture → finished + champion) atomically. */
    closeFixture?: {
      winnerId: string;
      homeScore: number;
      awayScore: number;
      leagueId: string;
    };
  },
  deps: StoreDeps,
): Promise<number> {
  const eventsToPersist = input.next.events.filter((e) => e.seq > input.currentSeq);
  // Advance the row seq past BOTH the previous value and every newly-appended
  // delta event. Most transitions emit exactly one event (seq = currentSeq+1),
  // but `beginMatch` emits the kickoff-plus-start/turnStart set, so the row must
  // advance to the highest event seq — otherwise the next transition's event
  // collides on `@@unique([liveMatchId, seq])` (P2002).
  const highestEventSeq = eventsToPersist.reduce((max, e) => Math.max(max, e.seq), input.currentSeq);
  const nextSeq = Math.max(input.currentSeq + 1, highestEventSeq);

  await deps.prisma.$transaction(async (tx) => {
    // RAU-44: a finish transition computes + persists the deterministic per-team
    // winnings IN this SAME transaction (atomic with the event rows below) so
    // the finished feed can show "Ganancias" immediately at end. The reads are
    // static roster data; the write rides the seq-guarded updateMany so a
    // concurrent finish can never double-apply (finished is terminal anyway).
    const liveWinnings = await computeLiveWinnings(
      { ...input, finalScore: input.closeFixture },
      tx,
      deps,
    );
    const updated = await tx.liveMatch.updateMany({
      where: { id: input.liveMatchId, seq: input.currentSeq },
      data: {
        ...rowData(input.next),
        seq: nextSeq,
        ...(liveWinnings ? { winnings: liveWinnings } : {}),
        // RAU-14: the begin write persists the fielded journeymen atomically
        // with the kickoff rows; later transitions never touch the field.
        ...(input.journeymen !== undefined ? { journeymen: input.journeymen as unknown as Prisma.InputJsonValue } : {}),
      },
    });
    if (updated.count === 0) {
      throw Object.assign(new Error("seq conflict"), { status: 409 });
    }
    for (const event of eventsToPersist) {
      await tx.liveEvent.create({
        data: {
          liveMatchId: input.liveMatchId,
          seq: event.seq,
          kind: event.kind,
          side: event.side,
          playerRosterId: event.playerRosterId,
          half: event.half,
          turnNumber: event.turnNumber,
          payload: event.payload as never,
        },
      });
    }
    // LM-23: the treasury decrements are part of the SAME transaction as the
    // event rows, so a failure rolls BOTH back. The delta is ≤ half treasury
    // (serious-incident) or the kept remainder (catastrophe), never negative.
    for (const update of input.treasuryUpdates ?? []) {
      await tx.team.updateMany({
        where: { id: update.teamId },
        data: { treasury: { decrement: update.amountLost } },
      });
    }
    // RAU-38: the conceded match's victory (fixture winner + walkover-style
    // scores) commits atomically with the `concede` event rows — a failed
    // fixture write rolls back the events too.
    if (input.closeFixture) {
      await tx.fixture.update({
        where: { id: input.fixtureId },
        data: {
          winnerId: input.closeFixture.winnerId,
          homeScore: input.closeFixture.homeScore,
          awayScore: input.closeFixture.awayScore,
        },
      });
      // RAU-40: a concession counts as played — when it was the season's LAST
      // fixture the league closes in this SAME transaction (finished + champion).
      await maybeCloseLeague(tx, input.closeFixture.leagueId);
    }
  });

  const bounded = { ...input.next, seq: nextSeq };
  // The fan-out frame carries the view PLUS this transition's delta events so a
  // connected client can apply the new state and append the events to its
  // timeline in one frame (no reload, no second DB read). `eventsToPersist` is
  // always the event rows created in the SAME transaction (empty for
  // pause/resume/retract-style transitions that emit no event).
  deps.hub.publish(input.fixtureId, {
    ...toLiveViewState(bounded, input.now),
    events: eventsToPersist,
  });
  return nextSeq;
}

export interface ApplyTransitionInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  next: LiveMatchState;
  now: number;
}

/**
 * Persists one transition: optimistic `updateMany` on the previous `seq` (a
 * 0-row result → seq conflict / double action), appends the delta event rows in
 * the SAME transaction, then publishes the new view state after commit. Throws
 * with `status: 409` when the guard reports 0 rows.
 */
export async function applyTransition(
  input: ApplyTransitionInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const nextSeq = await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: input.next,
      now: input.now,
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...input.next, seq: nextSeq }, input.now) };
}

/**
 * Creates an initial pending LiveMatch row whose ONE consented boolean is set
 * (D16: the row exists only once a coach consents). Used by `consentLiveMatch`
 * when no row exists yet. Publishes the pending view.
 */
async function createFirstConsent(
  input: { fixtureId: string; side: TeamSide; now: number },
  deps: StoreDeps,
): Promise<{ liveMatchId: string; view: ReturnType<typeof toLiveViewState> }> {
  const homeConsented = input.side === "home";
  const awayConsented = input.side === "away";
  const state: LiveMatchState = {
    seq: 0,
    status: "pending",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented,
    awayConsented,
    startedAt: null,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: null,
    finishedAt: null,
    concedeProposedBy: null,
    pendingCasualty: null,
    mvpNominations: EMPTY_MVP_NOMINATIONS,
    events: [],
  };

  const liveMatchId = await deps.prisma.$transaction(async (tx) => {
    const created = await tx.liveMatch.create!({
      data: {
        fixtureId: input.fixtureId,
        status: "pending" as const,
        half: 1,
        turnNumber: 1,
        activeSide: "home" as const,
        homeConsented,
        awayConsented,
        startedAt: null,
        homeTurnMs: 0,
        awayTurnMs: 0,
        homeScore: 0,
        awayScore: 0,
        seq: 0,
        paused: false,
        clockStartedAt: null,
      },
    });
    return created.id;
  });

  const view = toLiveViewState(state, input.now);
  deps.hub.publish(input.fixtureId, view);
  return { liveMatchId, view };
}

export interface ConsentLiveMatchInput {
  fixtureId: string;
  fixture: FixtureStartState;
  side: TeamSide;
  now: number;
}

/**
 * Records a coach's consent (LM-11, D16): the LiveMatch row is created on the
 * FIRST consent (create-on-first-consent); a subsequent consent transitions an
 * existing row. Both consents → `ready`. Doubly-consenting the same side is an
 * idempotent no-op. Rejects a played/result-loaded fixture with 409 before any
 * write. P2002 race on create → re-read + apply the transition.
 */
export async function consentLiveMatch(
  input: ConsentLiveMatchInput,
  deps: StoreDeps,
): Promise<{ liveMatchId: string; view: ReturnType<typeof toLiveViewState> }> {
  if (!isStartableFixture(input.fixture)) {
    throw Object.assign(new Error("consent not allowed on played/result fixture"), { status: 409 });
  }

  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) {
    return createFirstConsent({ fixtureId: input.fixtureId, side: input.side, now: input.now }, deps);
  }

  const current = liveMatchRowToState(row);
  const next = consentStart(current, { side: input.side });
  if (next === current) {
    return { liveMatchId: row.id, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { liveMatchId: row.id, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface RetractLiveConsentInput {
  liveMatchId: string;
  fixtureId: string;
  side: TeamSide;
  now: number;
}

/**
 * Clears a coach's consent, returning the match to `pending` (LM-11). No-op when
 * that side never consented.
 */
export async function retractLiveConsent(
  input: RetractLiveConsentInput,
  deps: StoreDeps,
): Promise<{ view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  const next = retractConsent(current, { side: input.side });
  if (next === current) {
    return { view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface BeginLiveMatchInput {
  liveMatchId: string;
  fixtureId: string;
  now: number;
  /** Optional kickoff input (LM-21/22/23): when present, the begin transition
   * builds the em/em/fan_factor events and commits the treasury deltas atomically. */
  kickoff?: BuildKickoffEventsInput;
  /** RAU-14: the journeymen (Novatos) fielded at begin, persisted on the
   * LiveMatch row so the post-resolve HIRE flow can reference them. Built by
   * the route from the SAME served rosters that name the `journeyman` timeline
   * events (deterministic per match). Omit → the row keeps SQL NULL (a match
   * with no journeymen has nothing to hire). */
  journeymen?: PersistedJourneymen;
}

/**
 * Begins the first turn: `ready → live` ONLY via `beginMatch` (LM-3/LM-11).
 * When a kickoff input is supplied, builds the kickoff events via
 * `buildKickoffEvents` (LM-21) and passes the treasury deltas into
 * `persistAndPublish` so they commit in the same transaction as the event rows
 * (LM-23). A retried begin (already-live) is mapped to 409 (LM-21 idempotency);
 * the optimistic seq guard also returns 409 on a concurrent double-begin.
 */
export async function beginLiveMatch(
  input: BeginLiveMatchInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);

  const kickoff = input.kickoff
    ? buildKickoffEvents(input.kickoff)
    : { events: [], treasuryUpdates: [] as { teamId: string; amountLost: number }[] };

  let next: LiveMatchState;
  try {
    next = beginMatch(current, input.now, kickoff.events);
  } catch (error) {
    // LM-21: a begin on an already-live match is a retry → 409, never a 500.
    if (error instanceof Error && error.message.includes("begin only from ready")) {
      throw Object.assign(error, { status: 409 });
    }
    throw error;
  }

  const nextSeq = await persistAndPublish(
    {
      liveMatchId: row.id,
      fixtureId: input.fixtureId,
      currentSeq: current.seq,
      next,
      now: input.now,
      treasuryUpdates: kickoff.treasuryUpdates,
      // RAU-14: persist the fielded journeymen atomically with the begin event
      // rows — the post-resolve hire flow reads them off the row.
      journeymen: input.journeymen,
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface ConcedeInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — for propose the PROPOSER, for decline the responder. */
  side: TeamSide;
  now: number;
}

export interface AcceptConcedeInput extends ConcedeInput {
  homeTeamId: string;
  awayTeamId: string;
  /** RAU-40: the fixture's league — the accept-concede close check needs it. */
  leagueId: string;
}

/**
 * RAU-38 propose: persists `concedeProposedBy = side` under the optimistic seq
 * guard. A retried propose from the same side is an idempotent no-op returning
 * the current view; a double-propose by the other side or a non-live propose is
 * a state-machine rejection mapped to 409.
 */
export async function proposeConcedeLiveMatch(
  input: ConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = proposeConcede(current, input.side);
  } catch (error) {
    // Every pure transition rejection is a state-machine guard → 409.
    throw Object.assign(error as Error, { status: 409 });
  }
  if (next === current) {
    return { seq: current.seq, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-38 decline: the NON-proposer rejects a pending concession, clearing
 * `concedeProposedBy` so the match continues. A decline with no pending
 * proposal is an idempotent no-op; the proposer declining their own proposal
 * is a state-machine rejection → 409.
 */
export async function declineConcedeLiveMatch(
  input: ConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = declineConcede(current, input.side);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  if (next === current) {
    return { seq: current.seq, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-38 accept: the NON-proposer accepts a pending concession → the match
 * finishes and the ACCEPTOR's team wins. The victory is awarded in the SAME
 * transaction as the `concede` event rows (`closeFixture`): the fixture gets
 * the acceptor as `winnerId` plus the walkover-style 2-0 scores (forfeit
 * precedent) so it closes as played and a later result load 409s. A concession
 * 409). A concession is NOT a played match — no PE/MVP are computed here
 * (documented choice); the winnings snapshot IS persisted at finish like any
 * live end (RAU-44: `persistAndPublish` computes `{ home, away }` when the
 * row reaches `finished`), while the scoreboard in the live state stays
 * untouched. A retried accept (already finished) or an accept of one's own
 * proposal is a state-machine rejection → 409 (the optimistic seq guard
 * catches a concurrent double-accept too).
 */
export async function acceptConcedeLiveMatch(
  input: AcceptConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = acceptConcede(current, input.side, input.now);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  const isHome = input.side === "home";
  const winnerTeamId = isHome ? input.homeTeamId : input.awayTeamId;
  const homeScore = isHome ? 2 : 0;
  const awayScore = isHome ? 0 : 2;
  const nextSeq = await persistAndPublish(
    {
      liveMatchId: row.id,
      fixtureId: input.fixtureId,
      currentSeq: current.seq,
      next,
      now: input.now,
      closeFixture: {
        winnerId: winnerTeamId,
        homeScore,
        awayScore,
        leagueId: input.leagueId,
      },
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface ProposeCasualtyInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — MUST be the ACTIVE side (the state machine enforces). */
  side: TeamSide;
  victimRosterId: string;
  causerRosterId: string;
  cause: CasualtyCause;
  roll16: number;
  roll6?: number;
  now: number;
}

export interface ConfirmCasualtyInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — the responder, opposite the proposer. */
  side: TeamSide;
  now: number;
}

/**
 * RAU-39 propose: persists `pendingCasualty` (the ACTIVE coach's casualty
 * proposal) under the optimistic seq guard. Any state-machine rejection
 * (non-live, double-propose, non-active caller, invalid rolls) is mapped to 409;
 * the optimistic guard catches a concurrent double-propose too.
 */
export async function proposeCasualtyLiveMatch(
  input: ProposeCasualtyInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = proposeCasualty(current, {
      side: input.side,
      victimRosterId: input.victimRosterId,
      causerRosterId: input.causerRosterId,
      cause: input.cause,
      roll16: input.roll16,
      roll6: input.roll6,
    });
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-39 confirm: the NON-proposer confirms a pending casualty → the `casualty`
 * event persists ATOMICALLY (band derived server-side from the 1D16 roll) and
 * `pendingCasualty` clears, all in the same transaction. A casualty has no money
 * effect — no treasury/winnings are involved (unlike the kickoff EM). Any
 * state-machine rejection (non-live, no proposal, proposer-self) → 409.
 */
export async function confirmCasualtyLiveMatch(
  input: ConfirmCasualtyInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = confirmCasualty(current, input.side, input.now);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface PauseResumeInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  now: number;
}/**
 * Hub-driven internal pause (LM-7/D18): bumps the ACTIVE accumulator by the
 * in-flight segment `(now - clockStartedAt)`, then sets `paused=true` and
 * `clockStartedAt=null` (the active clock consumes no further time) under the
 * optimistic seq guard, then publishes. Repeating a pause when already paused is
 * a no-op acceptance (no seq bump, no mutation). Survives restarts (persisted).
 */
export async function pauseLiveMatch(input: PauseResumeInput, deps: StoreDeps): Promise<void> {
  if (input.current.paused) return;
  const bumped = bumpActiveAccumulator(input.current, input.now);
  const paused: LiveMatchState = {
    ...bumped,
    paused: true,
    clockStartedAt: null,
    events: [],
  };
  await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: paused,
      now: input.now,
    },
    deps,
  );
}

/**
 * Hub-driven resume (LM-7): clears the pause and restarts the running segment at
 * `now` (`paused=false`, `clockStartedAt=now`) so accumulation resumes from the
 * persisted accumulators (never zero). Repurposed unified-clock segment resume.
 */
export async function resumeLiveMatch(input: PauseResumeInput, deps: StoreDeps): Promise<void> {
  if (!input.current.paused) return;
  const resumed: LiveMatchState = {
    ...input.current,
    paused: false,
    clockStartedAt: input.now,
    events: [],
  };
  await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: resumed,
      now: input.now,
    },
    deps,
  );
}

/** Bumps the ACTIVE side's accumulator by the live in-flight segment elapsed (LM-5). */
function bumpActiveAccumulator(state: LiveMatchState, now: number): LiveMatchState {
  if (state.status !== "live" || state.clockStartedAt == null) return state;
  const inFlight = Math.max(now - state.clockStartedAt, 0);
  if (inFlight === 0) return state;
  return state.activeSide === "home"
    ? { ...state, homeTurnMs: state.homeTurnMs + inFlight }
    : { ...state, awayTurnMs: state.awayTurnMs + inFlight };
}

/** The persisted per-team winnings JSON (`{ home, away }`), or null when the
 * value is absent/malformed (defensive — mirrors the fixture GET parser). */
function parseWinningsJson(value: Prisma.JsonValue | null): { home: number; away: number } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.home !== "number" || typeof v.away !== "number") return null;
  return { home: v.home, away: v.away };
}

/** The team's coaching-staff JSON as a typed `CoachingStaff` (result-route
 * `coachingOf` precedent); a malformed/absent value falls back to the default. */
function coachingOf(coaching: Prisma.JsonValue | null): import("@/features/teams/types").CoachingStaff {
  return isCoachingStaff(coaching) ? coaching : DEFAULT_COACHING;
}

/** Extracts the three TV parts from a loaded team row for the petty-cash
 * comparison (result-route `raceTvParts` precedent). */
function raceTvParts(team: {
  raceId: string;
  roster: Prisma.JsonValue | null;
  coaching: Prisma.JsonValue | null;
  players: readonly { valueBonus: number }[];
}): { rosterCost: number; coachingCost: number; valueBonus: number } {
  const race = getRaceById(team.raceId);
  const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
  const valueBonus = (team.players ?? []).reduce((total, p) => total + (p.valueBonus ?? 0), 0);
  if (!race) return { rosterCost: 0, coachingCost: 0, valueBonus };
  return {
    rosterCost: computeRosterCostFromPlayers(race, roster),
    coachingCost: computeCoachingCost(race, coachingOf(team.coaching)),
    valueBonus,
  };
}

/** A loaded LiveMatch row with its persisted events (resolve derivation input). */

/** The persisted event rows as the pure derivation's minimum surface. */
function resolveEventsOf(rows: readonly unknown[]): ResolveEventLike[] {
  return rows
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e) => ({
      kind: typeof e.kind === "string" ? e.kind : "",
      side: e.side === "home" || e.side === "away" ? e.side : null,
      playerRosterId: typeof e.playerRosterId === "string" ? e.playerRosterId : null,
      payload:
        typeof e.payload === "object" && e.payload !== null && !Array.isArray(e.payload)
          ? (e.payload as Record<string, unknown>)
          : {},
    }));
}

/** A side's MJP-eligible ids: the roster ids PLUS the fielded Journeyman ids
 * (RAU-13: a Novato plays for the team that match, so they are MVP-eligible).
 * The journeymen come from the persisted `LiveMatch.journeymen` — only the ids
 * that actually fielded the match are accepted, never a foreign `journeyman-*`
 * pattern. */
function eligibleMvpIds(
  roster: Prisma.JsonValue | null,
  journeymen: readonly PersistedJourneyman[] | null | undefined,
): Set<string> {
  const ids = new Set(
    (Array.isArray(roster) ? (roster as unknown as PlayerEntry[]) : []).map((entry) => entry.id),
  );
  for (const journeyman of journeymen ?? []) ids.add(journeyman.id);
  return ids;
}

/** The rolled resolution the preview persists for the commit to reuse (RAU-49
 * fix): the chosen nominee rosterPlayerIds + the post-match FF totals — both
 * from the SAME server roll the modal previewed. */
export interface PendingResolution {
  mvp: { home: string; away: string };
  postFf: { home: number; away: number };
}

/** Defensive parse of the persisted `pendingResolution` JSON: a malformed or
 * legacy shape returns null so `resolveLiveMatch` falls back to a fresh roll. */
function parsePendingResolution(value: Prisma.JsonValue | null | undefined): PendingResolution | null {
  if (typeof value !== "object" || value === null) return null;
  const pending = value as Record<string, unknown>;
  const mvp = pending.mvp as Record<string, unknown> | undefined;
  const postFf = pending.postFf as Record<string, unknown> | undefined;
  if (
    !mvp ||
    typeof mvp.home !== "string" ||
    typeof mvp.away !== "string" ||
    !postFf ||
    typeof postFf.home !== "number" ||
    typeof postFf.away !== "number"
  ) {
    return null;
  }
  return {
    mvp: { home: mvp.home, away: mvp.away },
    postFf: { home: postFf.home, away: postFf.away },
  };
}

export interface RollLiveMvpInput {
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  now: number;
}

/**
 * RAU-51 nominate: a coach submits THEIR OWN side's six MJP nominations. The
 * persisted per-side `mvpNominations` JSON is replaced for that side (re-submit
 * allowed) under the optimistic `seq` guard, then the new view is published.
 * Guards: 404 no live row/team, 409 not-finished / already-resolved / seq
 * conflict, 400 when the six are not DISTINCT roster ids of that side's team or
 * a nominee is dead / suspended for the next match (RAU-12). The route enforces
 * the caller-side ownership (only the OWNER of that side's team may nominate).
 */
export async function nominateMvpLiveMatch(
  input: NominateMvpInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  if (row.status !== "finished") {
    throw Object.assign(new Error("match not finished"), { status: 409 });
  }
  const current = liveMatchRowToState(row);

  await deps.prisma.$transaction(async (tx) => {
    // Same guard as `resolveLiveMatch`: a match already resolved (or in the
    // middle of it) must not accept a nomination.
    const existing = await tx.matchResult.findUnique({ where: { fixtureId: input.fixtureId } });
    if (existing) throw Object.assign(new Error("already resolved"), { status: 409 });

    const teams = await tx.team.findMany({
      where: { id: { in: [input.teamId] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
        treasury: true,
        players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
      },
    });
    const team = teams[0];
    if (!team) throw Object.assign(new Error("not found"), { status: 404 });

    const rosterIds = eligibleMvpIds(team.roster, parsePersistedJourneymen(row.journeymen)?.[input.side]);
    const availability = new Map(
      team.players.map((p) => [p.rosterPlayerId, { alive: p.alive, missNextMatch: p.missNextMatch }]),
    );
    const invalid = validateSingleMvpNomination(input.players, rosterIds, availability);
    if (invalid) throw Object.assign(new Error(invalid), { status: 400 });

    const nextNominations: MvpNominations = {
      ...parseMvpNominations(row.mvpNominations),
      [input.side]: input.players,
    };
    const updated = await tx.liveMatch.updateMany({
      where: { id: row.id, seq: row.seq },
      data: {
        mvpNominations: nextNominations as unknown as Prisma.InputJsonValue,
        seq: row.seq + 1,
      },
    });
    if (updated.count === 0) {
      throw Object.assign(new Error("seq conflict"), { status: 409 });
    }
  });

  const next = {
    ...current,
    seq: row.seq + 1,
    mvpNominations: {
      ...parseMvpNominations(row.mvpNominations),
      [input.side]: input.players,
    } as MvpNominations,
  };
  const view = toLiveViewState(next, input.now, { viewerSide: input.side });
  // Fan out the new nomination state (no timeline event — the delta events list
  // is empty; a connected rival's modal/conso adjusts from the view frame).
  deps.hub.publish(input.fixtureId, { ...view, events: [] });
  return { seq: next.seq, view };
}

/** RAU-51: the side a coach nominates for + their own side's team id. */
export interface NominateMvpInput {
  fixtureId: string;
  /** The OWNER-side team id (the route resolves it from the session). */
  teamId: string;
  side: TeamSide;
  players: string[];
  now: number;
}

/** The server-owned preview roll for the resolution modal (RAU-49): rolls the
 * MVP 1D6 + the post-match FF dice over the PERSISTED per-side nominations
 * (RAU-51 — the body no longer carries them) and PERSISTS the result as
 * `pendingResolution` on the LiveMatch row (in the SAME transaction) — the
 * `resolveMatch` command then reuses those EXACT rolls at commit, so what the
 * modal previewed is what gets reported (never a second independent roll).
 * Overwriting a previous preview on re-roll is fine; 400 on invalid persisted
 * nominations, 404 when the live row or a team is missing, 409 when the live
 * match is not finished, already resolved, or BOTH sides have not nominated
 * yet (RAU-51: the roll is gated on both sides' `mvpNominations`). */
export async function rollLiveMvp(
  input: RollLiveMvpInput,
  deps: StoreDeps,
): Promise<{ mvp: { home: string; away: string }; postFf: { home: number; away: number } }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  if (row.status !== "finished") {
    throw Object.assign(new Error("match not finished"), { status: 409 });
  }
  const nominations = parseMvpNominations(row.mvpNominations);
  if (!nominations.home || !nominations.away) {
    throw Object.assign(new Error("both sides must nominate first"), { status: 409 });
  }
  const homeNom = nominations.home;
  const awayNom = nominations.away;

  const roll6 = deps.rollD6 ?? rollD6;
  const roll3 = deps.rollD3 ?? rollD3;

  return deps.prisma.$transaction(async (tx) => {
    // Same guard as `resolveLiveMatch`: a match already resolved (or in the
    // middle of it) must not accept a preview roll.
    const existing = await tx.matchResult.findUnique({ where: { fixtureId: input.fixtureId } });
    if (existing) throw Object.assign(new Error("already resolved"), { status: 409 });

    const teams = await tx.team.findMany({
      where: { id: { in: [input.homeTeamId, input.awayTeamId] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
        treasury: true,
        players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
      },
    });
    const byTeamId = new Map(teams.map((team) => [team.id, team]));
    const homeTeam = byTeamId.get(input.homeTeamId);
    const awayTeam = byTeamId.get(input.awayTeamId);
    if (!homeTeam || !awayTeam) throw Object.assign(new Error("not found"), { status: 404 });

    const persistedJourneymen = parsePersistedJourneymen(row.journeymen);
    const rosterIdsOf = (team: { roster: Prisma.JsonValue | null }, side: "home" | "away") =>
      eligibleMvpIds(team.roster, persistedJourneymen?.[side]);
    const invalid = validateMvpNominations(
      homeNom,
      awayNom,
      rosterIdsOf(homeTeam, "home"),
      rosterIdsOf(awayTeam, "away"),
    );
    if (invalid) throw Object.assign(new Error(invalid), { status: 400 });

    const homeMvp = computeMvpGrantee(homeNom, roll6());
    const awayMvp = computeMvpGrantee(awayNom, roll6());

    // The preview mirrors the resolve's FF derivation (a concede walkover's
    // fixture scores win over the live state's own scoreboard).
    const fixture = await tx.fixture.findUnique({
      where: { id: input.fixtureId },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, winnerId: true },
    });
    const homeScore = fixture?.homeScore ?? row.homeScore;
    const awayScore = fixture?.awayScore ?? row.awayScore;
    const homeOutcome: MatchOutcome =
      homeScore > awayScore ? "win" : homeScore < awayScore ? "loss" : "draw";
    const awayOutcome: MatchOutcome =
      awayScore > homeScore ? "win" : awayScore < homeScore ? "loss" : "draw";

    const preHomeFf = preMatchFanFactor({
      roll3: roll3(),
      dedicatedFans: dedicatedFansOf(homeTeam.coaching),
    });
    const preAwayFf = preMatchFanFactor({
      roll3: roll3(),
      dedicatedFans: dedicatedFansOf(awayTeam.coaching),
    });
    const postHomeFf = postMatchFanFactor({ ff: preHomeFf, result: homeOutcome, roll6: roll6() });
    const postAwayFf = postMatchFanFactor({ ff: preAwayFf, result: awayOutcome, roll6: roll6() });

    // RAU-49 fix: persist the previewed resolution so `resolveMatch` reuses
    // THESE exact values at commit (the summary the user approved IS what gets
    // reported). Overwrite-on-reroll is fine; the write is in the same
    // transaction as the guard so a race cannot roll after resolution.
    await tx.liveMatch.updateMany({
      where: { id: row.id },
      data: {
        pendingResolution: {
          mvp: { home: homeMvp, away: awayMvp },
          postFf: { home: postHomeFf, away: postAwayFf },
        },
      },
    });

    return { mvp: { home: homeMvp, away: awayMvp }, postFf: { home: postHomeFf, away: postAwayFf } };
  });
}

export interface ResolveLiveMatchInput {
  fixtureId: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** The resolving user (fixture coach or league admin) — the MatchResult
   * `loadedBy` audit (result-route parity). */
  loadedBy: string;
  now: number;
}

/** The resolve command's response: the closure snapshot + rolled awards. */
export interface ResolveLiveOutcome {
  fixtureId: string;
  status: "played";
  homeScore: number;
  awayScore: number;
  winnerId: string | null;
  winnings: { home: number; away: number };
  postFf: { home: number; away: number };
  mvp: { home: string; away: string };
  resultId: string;
}

/**
 * RAU-49: the end-of-match RESOLUTION — the closure of a finished live match.
 * In ONE transaction, mirroring the result route:
 *  - rolls the server-owned MJP 1D6 per team over the persisted per-side
 *    nominations (RAU-51) — or reuses the `rollMvp` preview;
 *  - derives the PE awards from the persisted live events (TD/completion/
 *    lasting-casualty) + the MVP +4, applied to the lazy Player rows;
 *  - applies the finish-time `LiveMatch.winnings` to the treasuries (never
 *    recomputed — RAU-44 persisted them deterministically at finish);
 *  - stores the post-match FF (snapshot-only, result-route precedent) and
 *    petty cash;
 *  - appends the home+away `mvp` events + bumps the row seq (LM-mvp parity);
 *  - closes the fixture IDEMPOTENTLY (skipped when already closed — the concede
 *    walkover) and runs `maybeCloseLeague` — the resolve IS the closure, fixing
 *  - the never-closed normally-finished live match; the fixture played +
 *    MatchResult presence are the terminal guard.
 * Guards: 404 no live row/team, 409 not-finished / already-resolved /
 * already-played-with-result / BOTH sides have not nominated yet (RAU-51: the
 * resolve rolls from the persisted per-side `mvpNominations`), 400 invalid
 * persisted nominations. A conceded match (fixture closed by
 * `acceptConcedeLiveMatch`, no MatchResult yet) is ALLOWED: the fixture-close
 * part is skipped, the awards + report still write.
 */
export async function resolveLiveMatch(
  input: ResolveLiveMatchInput,
  deps: StoreDeps,
): Promise<ResolveLiveOutcome> {
  const row = await deps.prisma.liveMatch.findFirst({
    where: { fixtureId: input.fixtureId },
    include: { events: { orderBy: { seq: "asc" } } },
  });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  if (row.status !== "finished") {
    throw Object.assign(new Error("match not finished"), { status: 409 });
  }
  const nominations = parseMvpNominations(row.mvpNominations);
  if (!nominations.home || !nominations.away) {
    throw Object.assign(new Error("both sides must nominate first"), { status: 409 });
  }
  const homeNom = nominations.home;
  const awayNom = nominations.away;

  const roll6 = deps.rollD6 ?? rollD6;
  const roll3 = deps.rollD3 ?? rollD3;

  return deps.prisma.$transaction(async (tx) => {
    const existing = await tx.matchResult.findUnique({ where: { fixtureId: input.fixtureId } });
    if (existing) throw Object.assign(new Error("already resolved"), { status: 409 });

    const fixture = await tx.fixture.findUnique({
      where: { id: input.fixtureId },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, winnerId: true },
    });
    if (!fixture) throw Object.assign(new Error("not found"), { status: 404 });

    const teams = await tx.team.findMany({
      where: { id: { in: [input.homeTeamId, input.awayTeamId] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
        treasury: true,
        players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
      },
    });
    const byTeamId = new Map(teams.map((team) => [team.id, team]));
    const homeTeam = byTeamId.get(input.homeTeamId);
    const awayTeam = byTeamId.get(input.awayTeamId);
    if (!homeTeam || !awayTeam) throw Object.assign(new Error("not found"), { status: 404 });

    const persistedJourneymen = parsePersistedJourneymen(row.journeymen);
    const rosterIdsOf = (team: { roster: Prisma.JsonValue | null }, side: "home" | "away") =>
      eligibleMvpIds(team.roster, persistedJourneymen?.[side]);
    const invalid = validateMvpNominations(
      homeNom,
      awayNom,
      rosterIdsOf(homeTeam, "home"),
      rosterIdsOf(awayTeam, "away"),
    );
    if (invalid) throw Object.assign(new Error(invalid), { status: 400 });

    // The scoreboard: the fixture's persisted scores when already closed (a
    // concede walkover), else the live state's own final scoreboard. The winner
    // derives from the scores (a draw → null), falling back to a persisted
    // winner id (defensive).
    const homeScore = fixture.homeScore ?? row.homeScore;
    const awayScore = fixture.awayScore ?? row.awayScore;
    const winnerId =
      deriveWinnerId(homeScore, awayScore, input.homeTeamId, input.awayTeamId) ??
      fixture.winnerId ??
      null;

    const homeOutcome: MatchOutcome =
      homeScore > awayScore ? "win" : homeScore < awayScore ? "loss" : "draw";
    const awayOutcome: MatchOutcome =
      awayScore > homeScore ? "win" : awayScore < homeScore ? "loss" : "draw";
    // RAU-49 fix: when `rollMvp` previewed the resolution, the commit reuses
    // THOSE EXACT rolls (MVP grantees + post-match FF) — the reported result
    // always equals what the modal's summary showed, never a second independent
    // roll. A direct/legacy resolve without a preview falls back to fresh
    // server-owned rolls exactly as before.
    const pending = parsePendingResolution(row.pendingResolution);
    let postHomeFf: number;
    let postAwayFf: number;
    let homeMvp: string;
    let awayMvp: string;
    if (pending) {
      homeMvp = pending.mvp.home;
      awayMvp = pending.mvp.away;
      postHomeFf = pending.postFf.home;
      postAwayFf = pending.postFf.away;
    } else {
      // FF: fresh server-owned pre-match 1D3 + dedicated fans → post-match 1D6.
      // Snapshot-only, exactly like the result route (no team mutation).
      const preHomeFf = preMatchFanFactor({
        roll3: roll3(),
        dedicatedFans: dedicatedFansOf(homeTeam.coaching),
      });
      const preAwayFf = preMatchFanFactor({
        roll3: roll3(),
        dedicatedFans: dedicatedFansOf(awayTeam.coaching),
      });
      postHomeFf = postMatchFanFactor({ ff: preHomeFf, result: homeOutcome, roll6: roll6() });
      postAwayFf = postMatchFanFactor({ ff: preAwayFf, result: awayOutcome, roll6: roll6() });

      // MVP: server-owned 1D6 per team over the persisted per-side nominations.
      homeMvp = computeMvpGrantee(homeNom, roll6());
      awayMvp = computeMvpGrantee(awayNom, roll6());
    }

    // Winnings: the RAU-44 finish-time values — applied, never recomputed.
    const winnings = parseWinningsJson(row.winnings) ?? { home: 0, away: 0 };

    // PE: derived from the persisted events + the MJP grant (+4 upsert).
    const events = resolveEventsOf((row as { events?: unknown[] }).events ?? []);
    const homeAwards = addMvpPe(deriveLivePeAwards(events).home, homeMvp);
    const awayAwards = addMvpPe(deriveLivePeAwards(events).away, awayMvp);

    // Casualties: the server-derived bands persisted at confirm, never re-rolled.
    const casualties = casualtyVictimsFromEvents(events);

    // Petty cash: result-route parity (the lower-TV team's inducement budget).
    const homeParts = raceTvParts(homeTeam);
    const awayParts = raceTvParts(awayTeam);
    const pettyCash = computePettyCash(
      computeTeamTv(homeParts.rosterCost, homeParts.coachingCost, homeParts.valueBonus),
      computeTeamTv(awayParts.rosterCost, awayParts.coachingCost, awayParts.valueBonus),
    );

    // D4: the snapshot carries scores, post-FF, winnings, casualties and PE —
    // the same shape the result route persists (MV-2 renders it).
    const scoreboard = {
      home: {
        score: homeScore,
        postFf: postHomeFf,
        winnings: winnings.home,
        casualties: casualties
          .filter((c) => c.team === "home")
          .map((c) => ({ team: c.team, rosterPlayerId: c.rosterPlayerId, outcome: { kind: c.band } })),
        pe: homeAwards,
      },
      away: {
        score: awayScore,
        postFf: postAwayFf,
        winnings: winnings.away,
        casualties: casualties
          .filter((c) => c.team === "away")
          .map((c) => ({ team: c.team, rosterPlayerId: c.rosterPlayerId, outcome: { kind: c.band } })),
        pe: awayAwards,
      },
      winnerId,
      mvp: { home: homeMvp, away: awayMvp },
    };

    // D20/LM-mvp parity: append the home+away grantee events and bump the row
    // seq so the feed shows the ★4 MVP rows and the constraint never collides.
    const agg = await tx.liveEvent.aggregate({
      where: { liveMatchId: row.id },
      _max: { seq: true },
    });
    const maxSeq = agg._max?.seq ?? 0;
    const homeSeq = maxSeq + 1;
    const awaySeq = maxSeq + 2;
    const atMs = row.finishedAt ? new Date(row.finishedAt).getTime() : input.now;
    await tx.liveEvent.createMany({
      data: [
        {
          liveMatchId: row.id,
          seq: homeSeq,
          kind: "mvp",
          side: "home",
          playerRosterId: homeMvp,
          half: row.half,
          turnNumber: row.turnNumber,
          payload: {},
          createdAt: new Date(atMs),
        },
        {
          liveMatchId: row.id,
          seq: awaySeq,
          kind: "mvp",
          side: "away",
          playerRosterId: awayMvp,
          half: row.half,
          turnNumber: row.turnNumber,
          payload: {},
          createdAt: new Date(atMs),
        },
      ],
    });
    await tx.liveMatch.updateMany({ where: { id: row.id }, data: { seq: awaySeq } });

    // Close the fixture IDEMPOTENTLY: skip when already closed (a concede
    // walkover already wrote scores + winner in the SAME tx as its events).
    if (fixture.homeScore == null && fixture.awayScore == null) {
      await tx.fixture.update({
        where: { id: input.fixtureId },
        data: { homeScore, awayScore, winnerId },
      });
    }
    // RAU-40: the resolve IS the closure — when this was the season's LAST
    // fixture the league closes atomically here (finished + champion).
    await maybeCloseLeague(tx, input.leagueId);

    const report = await tx.matchResult.create({
      data: {
        fixtureId: input.fixtureId,
        weather: null,
        scores: scoreboard as never,
        pettyCash,
        loadedBy: input.loadedBy,
      },
    });

    // Treasury: apply the persisted finish-time winnings (RAU-44), never
    // recomputed and never double-applied (the result route's winnings are
    // superseded by this resolution for a live match).
    await tx.team.updateMany({
      where: { id: input.homeTeamId },
      data: { treasury: { increment: winnings.home } },
    });
    await tx.team.updateMany({
      where: { id: input.awayTeamId },
      data: { treasury: { increment: winnings.away } },
    });

    // PE awards to the lazy Player rows (same shape as the result route).
    for (const award of homeAwards) {
      await tx.player.updateMany({
        where: { teamId: input.homeTeamId, rosterPlayerId: award.rosterPlayerId },
        data: { pe: { increment: award.pe } },
      });
    }
    for (const award of awayAwards) {
      await tx.player.updateMany({
        where: { teamId: input.awayTeamId, rosterPlayerId: award.rosterPlayerId },
        data: { pe: { increment: award.pe } },
      });
    }

    // RAU-12 clear-then-set: this resolution IS an applied match — suspensions
    // from BEFORE it are served (cleared for every player of both teams) and
    // the new lasting victims are re-flagged so a player injured in THIS match
    // starts their suspension after it, not during.
    await tx.player.updateMany({
      where: { teamId: { in: [input.homeTeamId, input.awayTeamId] } },
      data: clearSuspensionUpdate(),
    });

    // Casualty injuries: append each victim's persisted band (skip unknown rows
    // and already-dead players — result-route semantics).
    await persistResolveCasualties(tx, input.homeTeamId, input.awayTeamId, casualties);

    return {
      fixtureId: input.fixtureId,
      status: "played" as const,
      homeScore,
      awayScore,
      winnerId,
      winnings,
      postFf: { home: postHomeFf, away: postAwayFf },
      mvp: { home: homeMvp, away: awayMvp },
      resultId: report.id,
    };
  });
}

/**
 * Appends each casualty victim's persisted band to their Player row, marking a
 * `dead` victim not alive and flagging a lasting band as unavailable for the
 * NEXT match (RAU-12). Mirrors the result route's `persistCasualtyOutcomes`:
 * an unknown roster id — no backfilled Player row — is skipped, an already-dead
 * Player is skipped, and duplicate victims apply once. The caller CLEARS both
 * teams' pre-existing suspension flags BEFORE invoking this.
 */
async function persistResolveCasualties(
  tx: StoreTx,
  homeTeamId: string,
  awayTeamId: string,
  casualties: ReturnType<typeof casualtyVictimsFromEvents>,
): Promise<void> {
  const deduped = Array.from(
    new Map(casualties.map((c) => [`${c.team}:${c.rosterPlayerId}`, c])).values(),
  );
  if (deduped.length === 0) return;
  const existing = await tx.player.findMany({
    where: {
      OR: deduped.map((c) => ({
        teamId: c.team === "home" ? homeTeamId : awayTeamId,
        rosterPlayerId: c.rosterPlayerId,
      })),
    },
  });
  const rowByKey = new Map(existing.map((row) => [`${row.teamId}:${row.rosterPlayerId}`, row]));
  for (const c of deduped) {
    const teamId = c.team === "home" ? homeTeamId : awayTeamId;
    const row = rowByKey.get(`${teamId}:${c.rosterPlayerId}`);
    if (!row) continue; // unknown roster id — not backfilled → skip
    if (!row.alive) continue; // already dead → skip (no revive / re-append)
    const injuries = Array.isArray(row.injuries) ? row.injuries : [];
    await tx.player.updateMany({
      where: { teamId, rosterPlayerId: c.rosterPlayerId },
      data: {
        injuries: [...injuries, { kind: c.band }] as never,
        ...injurySuspensionUpdate(c.band, row.alive),
      },
    });
  }
}

/** The hire/let-go command input (RAU-14). */
export interface HireJourneymanInput {
  fixtureId: string;
  /** The OWNER-side team id (the route resolves it from the session, mirroring
   * `NominateMvpInput`). */
  teamId: string;
  side: TeamSide;
  /** The synthetic journeyman id (`journeyman-{teamId}-{n}`) being decided. */
  journeymanId: string;
  /** true = HIRE (pay the lineman cost from the treasury, add to the roster);
   * false = "Dejar ir" (remove the option; nothing else mutates). */
  hire: boolean;
  now: number;
}

/**
 * RAU-14: the post-resolve journeyman decision — HIRE a fielded Novato as a
 * permanent roster player (pays the race Lineman cost from the treasury,
 * `positionalKey` = the race Lineman, RAU-11 style) or LET GO (removes the
 * option; no mutation beyond the persisted list).
 *
 * RAU-13: a hire ALSO CREATEs the journeyman's `Player` row in the same
 * transaction, carrying the PE they earned during the match (read from the
 * persisted `MatchResult` snapshot — the single source of truth) and every
 * casualty band they suffered (`missNextMatch` for a lasting band, `alive:
 * false` on a dead one). A "Dejar ir" leaves a clean slate — no row, no PE.
 *
 * Guards: 404 no live row / team; 400 unknown journeyman (the match never
 * persisted journeymen or the JSON is malformed); 409 the journeyman is not in
 * the persisted list (already hired-or-gone) or the match is NOT resolved yet
 * (`MatchResult` must exist); 409 roster at the 16 cap; 409 the treasury
 * cannot cover the lineman cost (the hire is PAID in cash from the treasury —
 * RAU-52: the cost is subtracted from the treasury AFTER the match winnings
 * were collected). Double-hire is impossible: removing the id from the list
 * plus the optimistic `seq` guard on the row (a concurrent decision on the
 * SAME journeyman loses the guard → 409).
 *
 * Effect in ONE transaction: the journeyman is removed from
 * `LiveMatch.journeymen`; a hire ALSO appends a `PlayerEntry { id: createId(),
 * name: <the persisted journeyman name>, positionalKey: <race Lineman key> }`
 * to the roster, decrements the treasury by the lineman cost, and creates the
 * matching Player row with the match's earned PE + injuries. Returns the
 * remaining journeymen + the updated team surface.
 */
export async function hireJourneymanLiveMatch(
  input: HireJourneymanInput,
  deps: StoreDeps,
): Promise<{
  journeymen: PersistedJourneymen;
  team: { id: string; roster: PlayerEntry[]; treasury: number };
}> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });

  const current = parsePersistedJourneymen(row.journeymen);
  const sideList = current?.[input.side];
  // 400 unknown journeyman: the match never persisted journeymen (or the JSON
  // is malformed) — there is nothing to decide for this side.
  if (!current || !Array.isArray(sideList)) {
    throw Object.assign(new Error("unknown journeyman"), { status: 400 });
  }
  const entry = sideList.find((j) => j.id === input.journeymanId);
  // 409 already hired-or-gone: the id is no longer in the persisted list (the
  // pre-check is a fast path — the in-tx `seq` guard is the real concurrency
  // protection against a simultaneous decision on the same journeyman).
  if (!entry) {
    throw Object.assign(new Error("journeyman already hired or gone"), { status: 409 });
  }

  return deps.prisma.$transaction(async (tx) => {
    // 409 not resolved yet: hiring is a POST-resolve decision — the match must
    // be reported (`MatchResult` exists) before a journeyman can stay.
    const existing = await tx.matchResult.findUnique({ where: { fixtureId: input.fixtureId } });
    if (!existing) throw Object.assign(new Error("match not resolved"), { status: 409 });

    const nextJourneymen: PersistedJourneymen = {
      ...current,
      [input.side]: sideList.filter((j) => j.id !== input.journeymanId),
    };

    if (!input.hire) {
      // "Dejar ir": just remove the option — no team mutation.
      const updated = await tx.liveMatch.updateMany({
        where: { id: row.id, seq: row.seq },
        data: {
          journeymen: nextJourneymen as unknown as Prisma.InputJsonValue,
          seq: row.seq + 1,
        },
      });
      if (updated.count === 0) throw Object.assign(new Error("seq conflict"), { status: 409 });
      return {
        journeymen: nextJourneymen,
        team: { id: input.teamId, roster: [], treasury: 0 },
      };
    }

    // HIRE: load the team + race, then the cap/balance guards.
    const teams = await tx.team.findMany({
      where: { id: { in: [input.teamId] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
        treasury: true,
        players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
      },
    });
    const team = teams[0];
    if (!team) throw Object.assign(new Error("not found"), { status: 404 });
    const race = getRaceById(team.raceId);
    const lineman = linemanPositionalOf(race);
    if (!race || !lineman) throw Object.assign(new Error("unknown race"), { status: 400 });

    const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
    if (roster.length >= MAX_PLAYERS) {
      throw Object.assign(new Error("roster full"), { status: 409 });
    }
    // RAU-52: the hire is PAID in CASH from the treasury (after the match
    // winnings were collected at resolve) — the guard is the affordability of
    // the lineman cost against the treasury itself.
    if (lineman.cost > team.treasury) {
      throw Object.assign(new Error("not enough treasury"), { status: 409 });
    }

    const nextRosterId = createId();
    const nextRoster: PlayerEntry[] = [
      ...roster,
      { id: nextRosterId, name: entry.name, positionalKey: lineman.key },
    ];
    const updated = await tx.liveMatch.updateMany({
      where: { id: row.id, seq: row.seq },
      data: {
        journeymen: nextJourneymen as unknown as Prisma.InputJsonValue,
        seq: row.seq + 1,
      },
    });
    if (updated.count === 0) throw Object.assign(new Error("seq conflict"), { status: 409 });
    // RAU-52: the hire is PAID from the treasury ledger — the lineman cost is
    // subtracted AFTER the resolve already applied the match winnings. The
    // roster growth separately raises the team TV; the treasury decrement is
    // the cash payment.
    await tx.team.updateMany({
      where: { id: input.teamId },
      data: { roster: nextRoster as never, treasury: { decrement: lineman.cost } },
    });

    // RAU-13: the hire CARRIES the match into the journeyman's new `Player`
    // row — the PE they EARNED during the match (TD ★3 / completion ★1 /
    // lasting casualty ★2 plus the MJP +4 when granted) and every casualty band
    // they SUFFERED. Both come from the persisted `MatchResult` snapshot: the
    // resolve already wrote it, so it is the single source of truth at hire
    // time. A lasting band starts their RAU-12 suspension; a dead band sets
    // `alive: false`. The row is keyed `(teamId, rosterPlayerId)` with the NEW
    // roster entry id — `ensurePlayersForTeam` never touched the journeyman
    // (they are not on the roster until now), so this is the ONLY place the
    // match's awards land for a hired Novato.
    const scoreboard = (existing.scores ?? {}) as Record<string, unknown>;
    const earned = journeymanSnapshotEarned(
      scoreboard[input.side] as SnapshotSideLike | undefined,
      input.journeymanId,
    );
    const injuries = earned.injuries.map((kind) => ({ kind }));
    const alive = !injuries.some((injury) => injury.kind === "dead");
    await tx.player.create({
      data: {
        teamId: input.teamId,
        rosterPlayerId: nextRosterId,
        name: entry.name,
        positionalKey: lineman.key,
        pe: earned.pe,
        skills: [],
        injuries: injuries as never,
        alive,
        missNextMatch: alive && injuries.some((injury) => isLastingBand(injury.kind)),
        valueBonus: 0,
        improvements: [],
        attributeIncreases: {},
      },
    });

    return {
      journeymen: nextJourneymen,
      team: { id: input.teamId, roster: nextRoster, treasury: team.treasury - lineman.cost },
    };
  });
}
