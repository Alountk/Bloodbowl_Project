import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";

/**
 * LAC-2: a caller's relationship to a league, resolved ONCE so every route and
 * the client predicate agree. `privileged` (a `leagues.manage` holder) is
 * owner-equivalent for authorization.
 */
export type LeagueAccess = "owner" | "privileged" | "member" | "foreign";

export interface LeagueAccessInput {
  userId: string | null;
  role: string | null | undefined;
  ownerId: string | null;
  isMember: boolean;
}

/**
 * Pure access resolution. The owner relation is checked FIRST — ownership wins
 * regardless of role — and only then is `leagues.manage` consulted, so a plain
 * `user` can never become privileged. Falls through to the existing
 * member/foreign semantics unchanged.
 */
export function resolveLeagueAccess(input: LeagueAccessInput): LeagueAccess {
  if (input.userId && input.ownerId && input.userId === input.ownerId) {
    return "owner";
  }
  if (can(input.role, "leagues.manage")) return "privileged";
  return input.isMember ? "member" : "foreign";
}

/**
 * LAC-1: read the caller's role from the DATABASE (authoritative), never from
 * the JWT — a user promoted after sign-in is granted immediately. Mirrors
 * `lib/devGuard.ts`; returns `null` when the user row no longer exists.
 */
export async function getDbRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? null;
}
