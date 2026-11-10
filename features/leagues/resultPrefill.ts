import type { LiveMatchView, LiveMatchEventDto } from "./api";
import { resolveInjury, INJURY_OUTCOMES } from "@/lib/rules/injuries";

/**
 * Result prefill (LM-9/D8, extended by LM-13 / Slice E): maps a finished
 * `LiveMatchView` into the result modal's INITIAL per-team draft — the final
 * scores and EVERY acta action kind captured live (touchdowns, completions,
 * interceptions, casualties, fouls, throw-team-mates, landed-safes — the
 * `bb2025-rules` PE set in `lib/rules/pe.ts`), so the derived acta carries each
 * captured event WITHOUT re-entry. Coaches still confirm MVP/MJP nominations
 * and the missing-data rolls (pending injury rolls, fans); the existing result
 * POST validates (Σ TD == score, exactly 6 MJP nominations, server-side
 * 1D6/1D16 rolls) and stays the single authority. No dice logic, no parallel
 * result path.
 *
 * Casualty capture is roll-inclusive end-to-end (guided entry emits
 * `roll16`/`roll6`); the victim records below carry those rolls so the closure
 * surface never re-asks a captured roll. A casualty whose injury roll is PENDING
 * (no `roll16` in the payload) survives derivation as `injuryRoll: null` —
 * carried, never silently resolved, never dropped (LM-13 "Pending roll survives
 * derivation"). Victims are deduped per (team, player) keeping the most severe
 * resolved band, mirroring `lib/liveResolve.ts` (`casualtyVictimsFromEvents`):
 * one wound is one injury, so a pending capture superseded by a later resolved
 * capture of the same victim yields ONE record (the resolved one).
 *
 * This module is also the home of the wizard draft types (s6a/RAU-122 design
 * F7): they were moved out of the legacy `ResultModal` (retired in s6c) so the
 * wizard's prefill (`acta/actaState.ts`) and the load path can share them
 * without importing a component.
 */

/** The numeric PE action credits collected for one player in the result form. */
export interface ResultPlayerDraft {
  tds: number;
  casualties: number;
  completions: number;
  interceptions: number;
  fouls: number;
  throwTeamMates: number;
  landedSafe: number;
}

/**
 * A casualty victim derived from the live capture (LM-13): the victim's team +
 * roster player id, the causer when the capture attributed one (absent for a
 * self-inflicted dodge/crowd wound), and the captured rolls. `injuryRoll` is the
 * 1D16 the players actually rolled, or `null` while PENDING (asked in the
 * closure surface — never silently resolved or dropped). `permanentRoll` is the
 * captured 1D6 attribute roll (null when absent).
 */
export interface ResultCasualtyDraft {
  team: "home" | "away";
  rosterPlayerId: string;
  /** The causer's roster id (absent for a self-inflicted wound — no causer). */
  causerRosterPlayerId?: string;
  /** The captured 1D16 injury roll; null = PENDING (asked at closure). */
  injuryRoll: number | null;
  /** The captured 1D6 permanent-attribute roll (null when absent). */
  permanentRoll: number | null;
}

/** One team's in-progress result form state. */
export interface ResultTeamDraft {
  score: number;
  ballHeld: boolean;
  /** Per-player actions keyed by rosterPlayerId (every roster player present). */
  players: Record<string, ResultPlayerDraft>;
  /** Selected MJP nominations (≤ 6 unique roster player ids). */
  mvpNominations: string[];
  /** The casualty victims caused by this team's players (LM-13: carried with
   * their rolls), plus this team's own self-inflicted victims (no causer). */
  casualties: ResultCasualtyDraft[];
}

/** The zeroed action row used for any player with a captured action. */
const EMPTY_ACTIONS = {
  tds: 0,
  casualties: 0,
  completions: 0,
  interceptions: 0,
  fouls: 0,
  throwTeamMates: 0,
  landedSafe: 0,
};

/** The per-player count field credited by each non-casualty acta action kind
 * (bb2025-rules R1; `casualty` is causer-based and handled separately). */
const COUNT_FIELD = {
  td: "tds",
  completion: "completions",
  interception: "interceptions",
  throwTeamMate: "throwTeamMates",
  landedSafe: "landedSafe",
  foul: "fouls",
} as const;

function stringField(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function rollField(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Builds ONE casualty victim record from a captured `casualty` event (the
 * event's `side` is the VICTIM's side, LM-12/RAU-39). Returns null when the
 * event carries no resolvable victim. The rolls ride through verbatim; a
 * missing `roll16` is the PENDING injury-roll state (null — never invented).
 */
function casualtyRecordOf(event: LiveMatchEventDto): ResultCasualtyDraft | null {
  if (event.side == null) return null;
  const victim = stringField(event.payload.victimRosterId) ?? event.playerRosterId;
  if (victim == null) return null;
  const causer = stringField(event.payload.causerRosterId);
  return {
    team: event.side,
    rosterPlayerId: victim,
    ...(causer != null ? { causerRosterPlayerId: causer } : {}),
    injuryRoll: rollField(event.payload.roll16),
    permanentRoll: rollField(event.payload.roll6),
  };
}

/**
 * Severity of a victim record for the (team, player) dedupe: a resolved band
 * (derived from the captured roll with the rulebook table, exactly like the
 * Bajas planner) outranks a pending one; among resolved bands the rulebook
 * order (`INJURY_OUTCOMES`) decides. Mirrors `lib/liveResolve.ts`'s
 * "most severe band wins" victim dedupe.
 */
function severityOf(record: ResultCasualtyDraft): number {
  if (record.injuryRoll == null) return -1;
  return INJURY_OUTCOMES.indexOf(resolveInjury(record.injuryRoll, 0).kind);
}

/**
 * Collects the casualty victims across the whole feed IN EVENT ORDER, deduped
 * per (victim team, victim player) keeping the most severe record (first-seen
 * order preserved). A pending record survives when NO resolved capture exists
 * for that victim (LM-13: the pending roll stays pending — carried, not
 * dropped); a later resolved capture supersedes it (the timeline's resolution
 * flow appends a new roll-inclusive capture for the same victim).
 */
function casualtyRecords(events: readonly LiveMatchEventDto[]): ResultCasualtyDraft[] {
  const best = new Map<string, ResultCasualtyDraft>();
  for (const event of events) {
    if (event.kind !== "casualty") continue;
    const record = casualtyRecordOf(event);
    if (record == null) continue;
    const key = `${record.team}:${record.rosterPlayerId}`;
    const prev = best.get(key);
    if (!prev || severityOf(record) > severityOf(prev)) best.set(key, record);
  }
  return [...best.values()];
}

/**
 * Accumulates the per-player action counts for one side from every captured
 * acta-action event of that side (LM-13: not only TDs). A player's row is
 * created on their first captured action.
 */
function playersByAction(
  events: readonly LiveMatchEventDto[],
  side: "home" | "away",
): Record<string, ResultPlayerDraft> {
  const players: Record<string, ResultPlayerDraft> = {};
  const bump = (rosterPlayerId: string, field: keyof ResultPlayerDraft) => {
    const row = (players[rosterPlayerId] ??= { ...EMPTY_ACTIONS });
    row[field] += 1;
  };
  for (const event of events) {
    if (event.side !== side || event.playerRosterId == null) continue;
    const field = COUNT_FIELD[event.kind as keyof typeof COUNT_FIELD];
    if (field != null) bump(event.playerRosterId, field);
  }
  // Casualty counts credit the CAUSER (the opposite side of the victim event),
  // one per surviving wound record (bb2025-rules: a self-inflicted wound awards
  // no caused-casualty credit — `causerRosterPlayerId` absent → no count).
  for (const record of casualtyRecords(events)) {
    if (record.causerRosterPlayerId == null) continue;
    const causerSide = record.team === "home" ? "away" : "home";
    if (causerSide !== side) continue;
    bump(record.causerRosterPlayerId, "casualties");
  }
  return players;
}

function teamDraft(
  side: "home" | "away",
  score: number,
  events: readonly LiveMatchEventDto[],
): ResultTeamDraft {
  const casualties = casualtyRecords(events).filter((record) =>
    record.causerRosterPlayerId != null
      ? // A caused wound lands on the CAUSER's team draft (the team that
        // recorded it); a self-inflicted one on the VICTIM's own team.
        (record.team === "home" ? "away" : "home") === side
      : record.team === side,
  );
  return {
    score,
    ballHeld: true,
    players: playersByAction(events, side),
    // MJP nominations and fans stay missing-data coach input (asked at closure).
    mvpNominations: [],
    casualties,
  };
}

/** Prefills the result modal draft from a finished live match (initial state only). */
export function buildResultPrefill(live: LiveMatchView): { home: ResultTeamDraft; away: ResultTeamDraft } {
  return {
    home: teamDraft("home", live.homeScore, live.events),
    away: teamDraft("away", live.awayScore, live.events),
  };
}
