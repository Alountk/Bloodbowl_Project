/**
 * Public share-link access (RAU-7 / MSL-1·MSL-3·MSL-4·MSL-5).
 *
 * Pure, server-owned helpers for the per-fixture public read-only link:
 *
 * - `isShareLinkActive` — DERIVED expiry: a link is valid only while the
 *   fixture has no official outcome (scores, winner, or a MatchResult row).
 * - `ensureShareToken` — lazy, idempotent token minting (192-bit base64url);
 *   an existing token is always returned and NEVER rotated.
 * - `reduceWatchFrame` / `reduceWatchMatch` — WHITELIST reducers that pick only
 *   the public fields, so a private field can never leak by default (anti-drift).
 *
 * This module holds no Prisma runtime import (deps are injected), so it is
 * trivially unit-testable with zero mocks. `isDisplayEvent` is shared with the
 * member serializers so the guest feed can never drift from the member feed.
 */

import { isDisplayEvent, type LiveMatchStatus, type TeamSide } from "./liveMatch";

/** The fixture fields that determine whether a share link is still valid. */
export interface ShareFixtureState {
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  /** The `MatchResult` relation (or null); never read for content, only nullness. */
  result: unknown;
}

/**
 * MSL-3: DERIVED expiry — a link is active iff `homeScore`, `awayScore`,
 * `winnerId`, and `result` are all null. Covers pending/scheduled/ready/live and
 * a finished-live match whose result has not loaded yet. No timestamp column.
 */
export function isShareLinkActive(fixture: ShareFixtureState): boolean {
  return (
    fixture.homeScore == null &&
    fixture.awayScore == null &&
    fixture.winnerId == null &&
    fixture.result == null
  );
}

/** The minimal Prisma + crypto surface `ensureShareToken` needs (injectable). */
export interface EnsureShareTokenDeps {
  prisma: {
    fixture: {
      findUnique(args: {
        where: { id: string };
        select: { shareToken: true };
      }): Promise<{ shareToken: string | null } | null>;
      update(args: { where: { id: string }; data: { shareToken: string } }): Promise<unknown>;
    };
  };
  /** Defaults to `node:crypto.randomBytes` at the call site; injectable for tests. */
  randomBytes: (size: number) => Buffer;
}

/** MSL-1: the token byte length — 24 bytes → 192 bits → 32 base64url chars. */
export const SHARE_TOKEN_BYTES = 24;

/**
 * MSL-1: mints (or returns) the fixture's stable share token. Idempotent by
 * read-then-conditional-update: an existing token is returned untouched and the
 * value is NEVER rotated. `base64url` is URL-safe and contains no dots, so the
 * token is safe in a path segment.
 */
export async function ensureShareToken(
  fixtureId: string,
  deps: EnsureShareTokenDeps,
): Promise<string> {
  const existing = await deps.prisma.fixture.findUnique({
    where: { id: fixtureId },
    select: { shareToken: true },
  });
  if (existing?.shareToken) return existing.shareToken;

  const token = deps.randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
  await deps.prisma.fixture.update({
    where: { id: fixtureId },
    data: { shareToken: token },
  });
  return token;
}

/** The public team identity served to a guest (no owner/roster/coaching). */
export interface WatchTeam {
  id: string;
  name: string;
  raceId: string;
  emblem: string | null;
}

/** The public timeline event served to a guest (no ack/private payload state). */
export interface WatchEvent {
  seq: number;
  kind: string;
  side: TeamSide | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  at: number;
}

/** The reduced live view served to a guest — `viewerSide` is always null. */
export interface WatchLiveView {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeScore: number;
  awayScore: number;
  startedAt: number | null;
  finishedAt: number | null;
  elapsed: number;
  homeTurnMs: number;
  awayTurnMs: number;
  paused: boolean;
  viewerSide: null;
  events: WatchEvent[];
}

/** The public fixture identity (no `result`, no nested relations). */
export interface WatchFixtureDto {
  id: string;
  round: number;
  status: string;
  scheduledAt: string | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
}

/** The derived end-of-match summary (only for a finished live match, no result). */
export interface WatchSummary {
  homeScore: number;
  awayScore: number;
  winnerSide: TeamSide | null;
}

/** The full reduced DTO served by `GET /api/watch/[token]` (MSL-4). */
export interface WatchMatchDto {
  fixture: WatchFixtureDto;
  homeTeam: WatchTeam;
  awayTeam: WatchTeam;
  live: WatchLiveView | null;
  summary: WatchSummary | null;
}

/** A frame event as published (member DTO or store record) — loosely typed. */
interface WatchEventInput {
  seq: number;
  kind: string;
  side?: TeamSide | null;
  playerRosterId?: string | null;
  half: number;
  turnNumber: number;
  payload?: unknown;
  at: number;
}

/** A live frame (snapshot or hub publish) carrying private fields to drop. */
export interface WatchFrameInput {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeScore: number;
  awayScore: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  elapsed?: number;
  homeTurnMs?: number;
  awayTurnMs?: number;
  paused?: boolean;
  events?: readonly WatchEventInput[];
}

/** The route's minimal Prisma read (fixture + teams + live + result nullness). */
export interface WatchMatchInput {
  fixture: {
    id: string;
    round: number;
    status: string;
    scheduledAt: Date | string | null;
    homeScore: number | null;
    awayScore: number | null;
    winnerId: string | null;
    homeTeam: { id: string; name: string; raceId: string; emblem: string | null };
    awayTeam: { id: string; name: string; raceId: string; emblem: string | null };
    liveMatch: WatchFrameInput | null;
    result: unknown;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whitelist-picks one event and normalizes its payload (drops ack/extra fields). */
function toWatchEvent(event: WatchEventInput): WatchEvent {
  return {
    seq: event.seq,
    kind: event.kind,
    side: event.side ?? null,
    playerRosterId: event.playerRosterId ?? null,
    half: event.half,
    turnNumber: event.turnNumber,
    payload: isPlainObject(event.payload) ? event.payload : {},
    at: event.at,
  };
}

/**
 * MSL-4/MSL-5: reduces any live frame (snapshot or hub publish) to the public
 * `WatchLiveView`. Explicitly picks fields — never spreads — so private fields
 * (`mvpNominations`, `resolutionState`, `inducements`, consent flags, …) can
 * never leak. Forces `viewerSide: null` and filters events through
 * `isDisplayEvent` (LM-16).
 */
export function reduceWatchFrame(frame: WatchFrameInput): WatchLiveView {
  return {
    seq: frame.seq,
    status: frame.status,
    half: frame.half,
    turnNumber: frame.turnNumber,
    activeSide: frame.activeSide,
    homeScore: frame.homeScore,
    awayScore: frame.awayScore,
    startedAt: frame.startedAt ?? null,
    finishedAt: frame.finishedAt ?? null,
    elapsed: frame.elapsed ?? 0,
    homeTurnMs: frame.homeTurnMs ?? 0,
    awayTurnMs: frame.awayTurnMs ?? 0,
    paused: frame.paused ?? false,
    viewerSide: null,
    events: (frame.events ?? [])
      .filter((event) => isDisplayEvent(event.kind))
      .map(toWatchEvent),
  };
}

/** Whitelist-picks the public team identity. */
function toWatchTeam(team: {
  id: string;
  name: string;
  raceId: string;
  emblem: string | null;
}): WatchTeam {
  return { id: team.id, name: team.name, raceId: team.raceId, emblem: team.emblem };
}

/**
 * MSL-4: derives the end-of-match summary from the LIVE view (never from
 * `result`) — only a finished live match without a loaded result has one. A draw
 * carries `winnerSide: null`.
 */
function deriveSummary(live: WatchLiveView | null, result: unknown): WatchSummary | null {
  if (!live || live.status !== "finished" || result != null) return null;
  return {
    homeScore: live.homeScore,
    awayScore: live.awayScore,
    winnerSide:
      live.homeScore === live.awayScore ? null : live.homeScore > live.awayScore ? "home" : "away",
  };
}

/**
 * MSL-4: maps the route's minimal Prisma read to the reduced `WatchMatchDto`.
 * Explicit whitelist at every level; the fixture `result` is used ONLY to gate
 * the derived summary, never exposed.
 */
export function reduceWatchMatch(input: WatchMatchInput): WatchMatchDto {
  const live = input.fixture.liveMatch ? reduceWatchFrame(input.fixture.liveMatch) : null;
  return {
    fixture: {
      id: input.fixture.id,
      round: input.fixture.round,
      status: input.fixture.status,
      scheduledAt: input.fixture.scheduledAt
        ? new Date(input.fixture.scheduledAt).toISOString()
        : null,
      homeScore: input.fixture.homeScore,
      awayScore: input.fixture.awayScore,
      winnerId: input.fixture.winnerId,
    },
    homeTeam: toWatchTeam(input.fixture.homeTeam),
    awayTeam: toWatchTeam(input.fixture.awayTeam),
    live,
    summary: deriveSummary(live, input.fixture.result),
  };
}
