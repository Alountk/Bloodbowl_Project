/**
 * Shared live-action ENTRY helpers for the Design-A contextual dock (LM-46),
 * extracted from the removed player-first strip so the dock and the resolution
 * modal share the same naming and command-building logic (no duplication).
 *
 * - Role vocabulary: the ACTIVE coach opens actions on THEIR OWN side
 *   (td/completion/casualty/foul); the NON-active coach opens only casualty
 *   records on their own team — the SELF-INFLICTED dodge/crowd wound and the
 *   "both-down" block casualty. The dock shows the legal chips UP FRONT and a
 *   sheet over it to pick the involved players, keeping the SERVER both-down
 *   semantics intact (DEC-1): the non-active both-down record has the RIVAL
 *   fallen blocker as VICTIM and the tapped own defender as CAUSER
 *   ({side: opp, victimRosterId: rival, causerRosterId: own, bothDown:true}).
 */

import { CASUALTY_CAUSES, type CasualtyCause } from "@/lib/livePhase";
import { getRaceById } from "@/features/teams/data/races";
import type { LiveCommand, MatchPlayer } from "./api";

/** The casualty causes that REQUIRE an explicit causer (blitz/foul/block). */
export const CAUSES_REQUIRING_CAUSER: ReadonlySet<CasualtyCause> = new Set([
  "blitz",
  "foul",
  "block",
]);

/** ACTIVE coach may author a caused casualty from these causes. */
export const ACTIVE_CAUSES = CASUALTY_CAUSES.filter((c) =>
  CAUSES_REQUIRING_CAUSER.has(c),
);
/** The NON-active self-inflicted wound is dodge/crowd only (no causer). */
export const SELF_CAUSES = CASUALTY_CAUSES.filter(
  (c) => !CAUSES_REQUIRING_CAUSER.has(c),
);
/** The both-down casualty is ALWAYS a block (D1). */
export const BOTH_DOWN_CAUSE: CasualtyCause = "block";

/**
 * RAU-48: the positional display name for a player line ("blitzer" →
 * "Blitzer"), resolved against the race catalog; unknown keys pass through.
 * Moved here from the deleted `playerActionStrip` so the resolution modal's MJP
 * pickers share the same position label (RAU-13 dorsal).
 */
export function positionName(raceId: string, positionalKey: string): string {
  const race = getRaceById(raceId);
  return race?.positionals.find((pos) => pos.key === positionalKey)?.name ?? positionalKey;
}

/** The dorsal is the served-array index + 1 (D21), matching the feed's table. */
export function dorsalMap(pool: MatchPlayer[]): Map<string, number> {
  return new Map(pool.map((p, i) => [p.rosterPlayerId, i + 1]));
}

/** Chip short name: first name token (mockup "Design B"), whole single token. */
export function shortName(player: MatchPlayer): string {
  return player.name.trim().split(/\s+/)[0] || player.name;
}

/** The alive, eligible players of a roster offered by the dock (RAU-12/13). */
export function eligiblePlayers(pool: MatchPlayer[]): MatchPlayer[] {
  return pool.filter((p) => p.alive && !p.missNextMatch);
}

/**
 * The chosen selections for a Guided casualty/foul flow inside the dock sheet.
 * `roll` values are raw; the band is DERIVED server-side — never client-chosen.
 */
export interface GuidedSelections {
  cause?: CasualtyCause | "";
  causerId?: string;
  victimId?: string;
  roll16?: number | "";
  roll6?: number | "";
}

/**
 * Builds the `LiveCommand` for the dock's guided flows (Baja / Falta) plus the
 * non-active "Baja — ambos derribados" and "Baja propia". Pure and shared:
 * returns `null` when any required selection is missing (the Registrar button
 * is gated by the shape-validity instead).
 *
 * Resolved semantics (mirrored one-to-one from the removed strip's onRegister):
 *  - casualtyCaused (ACTIVE):  { type:casualty, side: opp, victim:rival,
 *    causer:own, cause, roll16(+roll6) }.
 *  - selfInflicted (NON-active, dodge/crowd, no causer): { type:casualty,
 *    side: viewer, victim:own, cause, roll16(+roll6) }.
 *  - bothDown (NON-active): { type:casualty, side: opp, victim: rival fallen
 *    blocker, causer: own defender tapped, cause:'block', bothDown:true,
 *    roll16(+roll6) } — DEC-1 canonical.
 *  - foul (ACTIVE): { type:foul, side: viewer, playerRosterId: aggressor own,
 *    victimRosterId: victim rival }.
 */
export function buildGuidedCommand(
  kind: "casualty" | "selfInflicted" | "bothDown" | "foul",
  viewerSide: "home" | "away",
  selections: GuidedSelections,
): LiveCommand | null {
  const oppSide = viewerSide === "home" ? "away" : "home";
  const { cause, causerId, victimId, roll16, roll6 } = selections;

  if (kind === "foul") {
    if (!causerId || !victimId) return null;
    return {
      type: "foul",
      side: viewerSide,
      playerRosterId: causerId,
      victimRosterId: victimId,
    };
  }

  if (kind === "selfInflicted") {
    if (!cause || !victimId || roll16 === "" || !roll16) return null;
    const base: LiveCommand = {
      type: "casualty",
      side: viewerSide,
      victimRosterId: victimId,
      cause,
      roll16,
    };
    if (roll6 !== "" && roll6 != null)
      (base as Extract<LiveCommand, { type: "casualty" }>).roll6 = roll6;
    return base;
  }

  if (kind === "bothDown") {
    if (!causerId || !victimId || roll16 === "" || !roll16) return null;
    const casualty: Extract<LiveCommand, { type: "casualty" }> = {
      type: "casualty",
      side: oppSide,
      victimRosterId: victimId,
      causerRosterId: causerId,
      cause: BOTH_DOWN_CAUSE,
      roll16: Number(roll16),
      bothDown: true,
    };
    if (roll6 !== "" && roll6 != null) casualty.roll6 = Number(roll6);
    return casualty;
  }

  // casualtyCaused (ACTIVE): causer REQUIRED for blitz/foul/block.
  if (!causerId || !cause || !victimId || roll16 === "" || !roll16) return null;
  const base: LiveCommand = {
    type: "casualty",
    side: oppSide,
    victimRosterId: victimId,
    causerRosterId: causerId,
    cause,
    roll16: Number(roll16),
  };
  if (roll6 !== "" && roll6 != null)
    (base as Extract<LiveCommand, { type: "casualty" }>).roll6 = Number(roll6);
  return base;
}

/** Builds the instant two-touch command for TD / Pase (active, own scorer). */
export function buildScoredCommand(
  kind: "td" | "completion",
  viewerSide: "home" | "away",
  playerRosterId: string,
): LiveCommand {
  return { type: kind, side: viewerSide, playerRosterId };
}

/** True when the viewer is the ACTIVE (current turn) side's coach. */
export function isActiveActor(
  viewerSide: "home" | "away" | null,
  activeSide: "home" | "away",
): boolean {
  return viewerSide != null && viewerSide === activeSide;
}
