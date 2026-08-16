/**
 * Live-match access gate (AC-1/LM-2, D9).
 *
 * A pure role-decision for the SSE (GET) and control (POST) live routes. Slice 1
 * ships this gate helper as the skeleton the slice-2 SSE routes consume; it
 * deliberately makes no HTTP/Prisma calls so it is trivially unit-testable with
 * zero mocks.
 *
 * Visibility (MVP STARTED matrix, mirroring GET /api/leagues/[id]):
 * - an OPEN league is readable by any authenticated user;
 * - a STARTED league is readable only by its owner or a current member;
 * - a foreign non-member of a STARTED league gets 404 (no existence/status leak);
 * - control is owner/member-only: a known-but-unauthorized caller gets 403, and
 *   a foreign (unknown) caller still gets 404 for control on a started league.
 *
 * Local-mode parity: when `authEnabled` is false (AUTH_MODE=local) there is no
 * session, so the gate 401s like the auth-mode case rather than allowing
 * anonymous realtime access.
 *
 * @returns "allow" to proceed, or the HTTP status to return (401/403/404).
 */
export type LiveAccessDecision = "allow" | 401 | 403 | 404;

export interface LiveAccessInput {
  /** Whether authentication is enabled (AUTH_MODE=auth). Caller resolves via `isAuthEnabled()`. */
  authEnabled: boolean;
  /** The session user id, or null when unauthenticated. */
  userId: string | null;
  /** The queued match's league, or null when unknown. Member ids are the league's current (non-archived) member team owner ids. */
  league: {
    ownerId: string;
    status: "open" | "started" | "finished";
    memberUserIds: readonly string[];
  } | null;
  /** "read" for the SSE subscribe stream; "control" for the POST transition route. */
  action: "read" | "control";
}

const isOwner = (userId: string, ownerId: string): boolean => userId === ownerId;
const isMember = (userId: string, memberUserIds: readonly string[]): boolean =>
  memberUserIds.includes(userId);

export function resolveLiveAccess(input: LiveAccessInput): LiveAccessDecision {
  // Local mode (or auth mode without a session) → 401; never anonymous realtime.
  if (!input.authEnabled || !input.userId) return 401;
  // Unknown league id (or a missing fixture's league) → 404, no existence leak.
  if (!input.league) return 404;

  const { ownerId, status, memberUserIds } = input.league;
  const participant = isOwner(input.userId, ownerId) || isMember(input.userId, memberUserIds);

  if (status === "open") {
    // Readable by any authenticated user; control restricted to owner/member.
    if (input.action === "read") return "allow";
    return participant ? "allow" : 403;
  }

  // STARTED league: owner or current member may read/control.
  if (participant) return "allow";
  // Foreign non-member: 404 for both read and control (no existence/status leak).
  return 404;
}
