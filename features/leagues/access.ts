import { can } from "@/lib/permissions";

/**
 * LAC-2 / LAC-5: pure client predicate mirroring the server's owner-first
 * resolution. The owner is owner-equivalent regardless of role; a
 * `leagues.manage` holder (developer/admin) is owner-equivalent on any league.
 *
 * The role here is the JWT snapshot (`session.user.role`) — DISPLAY ONLY. The
 * server always re-reads the authoritative DB role; this never authorizes.
 */
export function isOwnerEquivalent(
  league: { ownerId: string },
  userId: string | undefined,
  role: string | null | undefined,
): boolean {
  if (userId && league.ownerId === userId) return true;
  return can(role, "leagues.manage");
}
