/**
 * Pure side-matrix decision for live event recording (LM-12, D14).
 *
 * The live route gates every event command (TD / foul / casualty / pass-turn)
 * by comparing the caller's SIDE against the current ACTIVE side:
 *
 * - ACTIVE coach: allowed to record any event, on any victim.
 * - NON-ACTIVE coach: allowed ONLY to record a casualty to one of their OWN
 *   players (own-side victim). Any other non-active event → deny (409 out-of-
 *   turn).
 * - Caller with NO side (league admin without a team, or any spectator) → deny
 *   all event recording (D14: admin may do lifecycle ops like `endMatch`, never
 *   the play surface).
 *
 * The ROUTE maps a deny to the right HTTP status: a fixture coach whose action
 * is invalid → 409; a known-but-unauthorized member → 403; a foreign user → the
 * existing `loadFixtureGate` 404 (no existence leak). This module is pure and
 * zero-mock testable.
 */

export type EventKind = "td" | "foul" | "casualty" | "completion" | "passTurn";

export interface EventPermissionInput {
  /** The caller's team side, or null when they have no team (admin/spectator). */
  callerSide: "home" | "away" | null;
  /** The current active side whose turn is running. */
  activeSide: "home" | "away";
  kind: EventKind;
  /** For casualties: whose player is the victim (must be the caller's own for a non-active coach). */
  victimSide?: "home" | "away";
}

export type EventPermission = "allow" | "deny";

/**
 * Returns whether the caller may record `kind`, given the active side and (for
 * casualties) the victim's side. Pure and deterministic (LM-12/D14).
 */
export function resolveEventPermission(input: EventPermissionInput): EventPermission {
  const { callerSide, activeSide, kind, victimSide } = input;
  // No side → no event recording (admin/spectator, D14).
  if (callerSide === null) return "deny";
  // The active coach may record any event on any victim.
  if (callerSide === activeSide) return "allow";
  // Non-active coach: ONLY a casualty to one of their OWN players.
  if (kind === "casualty" && victimSide === callerSide) return "allow";
  return "deny";
}

// --- LM-12 actor-side invariants (D1: pure helpers beside the side matrix) --

export type TeamSide = "home" | "away";

/** Materialized roster player ids grouped by side, for resolving a victim or
 * causer against the live rosters (LM-12). Read-only sets. */
export interface RosterSideMap {
  home: ReadonlySet<string>;
  away: ReadonlySet<string>;
}

/**
 * Returns the side a roster player id belongs to, or `null` when the id is
 * missing/unresolvable (not present in either materialized roster). Pure and
 * deterministic (LM-12/D1).
 */
export function playerSide(
  map: RosterSideMap,
  id: string | null | undefined,
): TeamSide | null {
  if (id == null) return null;
  if (map.home.has(id)) return "home";
  if (map.away.has(id)) return "away";
  return null;
}

/** Input to the actor-side invariant check (LM-12/D1). `actorSide` is the side
 * OF the actor being constrained: the foul AGGRESSOR's side, or the casualty
 * VICTIM's side. `opponentId` is the opposite-side actor to check: the foul
 * victim, or the casualty causer. */
export interface ActorInvariantInput {
  kind: "foul" | "casualty";
  actorSide: TeamSide;
  opponentId?: string;
  cause?: string;
  rosters: RosterSideMap;
}

/**
 * Enforces the actor-side invariants for a foul/casualty command (LM-12/MVT-5):
 *
 * - `foul`: the victim (`opponentId`) MUST resolve to a roster player on the
 *   side OPPOSITE the aggressor (`actorSide`). A missing or unresolvable victim
 *   is denied (LM-6 makes `victimRosterId` REQUIRED); a same-side victim is an
 *   opponent-invariant violation.
 * - `casualty`: the causer (`opponentId`), when present, MUST resolve to a
 *   roster player on the side OPPOSITE the victim (`actorSide`). A dodge/crowd
 *   cause is self-inflicted / the crowd, so a causer is STRICTLY denied; when
 *   absent the casualty passes (bare-cause fallback, MVT-5).
 *
 * Pure and deterministic; the route maps a deny to 409. Returns
 * `"allow" | "deny"`.
 */
export function checkActorInvariant(input: ActorInvariantInput): EventPermission {
  const { kind, actorSide, opponentId, cause, rosters } = input;

  if (kind === "foul") {
    if (opponentId == null || opponentId === "") return "deny";
    if (playerSide(rosters, opponentId) === actorSide) return "deny";
    return playerSide(rosters, opponentId) === null ? "deny" : "allow";
  }

  // casualty
  if (cause === "dodge" || cause === "crowd") {
    // The crowd / the player's own dodge caused it — a causer is a violation.
    if (opponentId != null) return "deny";
    return "allow";
  }
  if (opponentId == null || opponentId === "") return "allow";
  if (playerSide(rosters, opponentId) === actorSide) return "deny";
  return playerSide(rosters, opponentId) === null ? "deny" : "allow";
}

/** The five casualty causes (MVT-5/LM-6; `penetration` folded into `blitz`). */
export const CASUALTY_CAUSES = [
  "blitz",
  "foul",
  "dodge",
  "crowd",
  "block",
] as const;
export type CasualtyCause = (typeof CASUALTY_CAUSES)[number];
