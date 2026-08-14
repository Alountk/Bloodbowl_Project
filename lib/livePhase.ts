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
