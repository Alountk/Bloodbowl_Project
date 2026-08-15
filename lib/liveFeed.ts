import { eventSpp as sppForEvent, type LiveEventLabelInput } from "@/features/leagues/liveEventLabels";

/**
 * Pure display derivations for the Design-A history feed (LM-17/LM-19, D22):
 * match minute, global turn tag, dorsal map, and per-team stats. All functions
 * are side-effect-free and deterministic so the feed row and hero mini-stats
 * render straight from the event DTOs (no DTO growth, D22).
 */

/** The minimum per-event surface the derivations need (matches LiveEventLabelInput + side). */
export interface FeedEvent {
  kind: string;
  side: "home" | "away" | null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  /** Monotonic sequence (LM-6); used to key per-TD partial scores (D5). Absent on synthetic rows. */
  seq?: number;
  /** Event absolute timestamp (ms); used by the timeline percent (D4). */
  at?: number;
}

/** A roster player id → dorsal entry source (the served teams' players array). */
export interface FeedPlayerRef {
  rosterPlayerId: string;
}

export type FeedPlayers = readonly FeedPlayerRef[];

/** Per-team stat line derived from the display-worthy events (LM-19). */
export interface TeamStats {
  tds: number;
  completions: number;
  casualties: number;
  fouls: number;
  /// total SPP stars (TD ★3, Completion ★1, lasting Casualty ★2, MVP ★4, else 0).
  spp: number;
}

const ZERO_STATS: TeamStats = { tds: 0, completions: 0, casualties: 0, fouls: 0, spp: 0 };

/**
 * The match minute for an event: floored whole minutes since `startedAt`
 * (the kickoff anchor), rendered as e.g. `199'`. Events before the kickoff
 * clamp to `0'` (defensive — an `mvp` written at result-load with a
 * pre-start `startedAt` would otherwise go negative).
 */
export function deriveMinute(at: number, startedAt: number): string {
  const minute = startedAt != null ? Math.floor((at - startedAt) / 60_000) : 0;
  return `${Math.max(0, minute)}'`;
}

/**
 * The global turn tag (LM-17): half 2's turns continue from half 1's 8, so a
 * half-2 turn `n` renders `T{n + 8}`; half 1 renders `T{n}`. The history spans
 * the whole match, so a global counter avoids a repeating `T1` from half 2.
 */
export function turnTag(half: number, turnNumber: number): string {
  return `T${half === 2 ? turnNumber + 8 : turnNumber}`;
}

/**
 * The Design-A dorsal map (D21): each roster slot renders `#index + 1` — the
 * served `players` array order, which the fixture GET guarantees via
 * `orderBy:{id:"asc"}`. There is no jersey field; the dorsal is a stable
 * pseudo-number for display.
 */
export function playerRef(players: FeedPlayers): Map<string, number> {
  const map = new Map<string, number>();
  players.forEach((p, i) => map.set(p.rosterPlayerId, i + 1));
  return map;
}

/** Re-export of the shared SPP helper so feed consumers import it from one place (D23). */
export { sppForEvent as eventSpp };

/** SPP span needed by `deriveTeamStats` for a single event (uses liveEventLabels). */
function sppOf(event: FeedEvent): number {
  return sppForEvent(event as LiveEventLabelInput);
}

/**
 * Per-team stat line over the display-worthy feed events (LM-19/D22):
 * home and away each get TD / completion / casualty / foul counts and the total
 * SPP stars. A "casualty" counts toward casualties regardless of band (a
 * coach-reported injure), but only a LASTING band (Baja) awards its ★2. A
 * null-side boundary event (`endHalf`/`endMatch`) is ignored. Empty events →
 * every stat 0.
 */
export function deriveTeamStats(events: readonly FeedEvent[]): { home: TeamStats; away: TeamStats } {
  const home = { ...ZERO_STATS };
  const away = { ...ZERO_STATS };
  for (const e of events) {
    const target = e.side === "away" ? away : e.side === "home" ? home : null;
    if (target === null) continue; // boundary rows have no side
    switch (e.kind) {
      case "td":
        target.tds += 1;
        break;
      case "completion":
        target.completions += 1;
        break;
      case "casualty":
        target.casualties += 1;
        break;
      case "foul":
        target.fouls += 1;
        break;
      default:
        break;
    }
    target.spp += sppOf(e);
  }
  return { home, away };
}

/** A running per-side TD tally, keyed by event seq for TD cards (D5). */
export type PartialScoreLine = { home: number; away: number };

/**
 * Per-TD partial score (MVT-1/D5): accumulate TD events per side across the
 * display feed IN SEQ ORDER and record a `Map<seq, {home, away}>` snapshot ONLY
 * at each TD event, so a TD card renders the score "up to that event". Iterating
 * the feed in seq order means a home TD then an away TD yields `(1 - 0)` then
 * `(1 - 1)`. Non-TD events never appear in the map; events without a `seq` are
 * skipped (no key to bind to). Empty/untagged feeds → an empty map.
 */
export function derivePartialScore(events: readonly FeedEvent[]): Map<number, PartialScoreLine> {
  const scores = new Map<number, PartialScoreLine>();
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.kind === "td") {
      if (e.side === "home") home += 1;
      else if (e.side === "away") away += 1;
    }
    if (e.seq != null && e.kind === "td") {
      scores.set(e.seq, { home, away });
    }
  }
  return scores;
}

/**
 * The timeline-icon position (MVT-2/D4): the event's elapsed share of the
 * `[start, end]` window, rounded to the nearest whole percent and clamped to
 * 0..100. A null-width window (start === end) returns 0 so callers never
 * divide by zero.
 */
export function timelinePercent(at: number, start: number, end: number): number {
  if (end <= start) return 0;
  const ratio = (at - start) / (end - start);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
