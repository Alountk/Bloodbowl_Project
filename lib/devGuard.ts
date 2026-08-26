import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/permissions";

export type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Shared server-side permission guard (RAU-52) for the /api/dev/* routes.
 * 401 unauthenticated (or a session whose user row vanished); 403 for any
 * authenticated user whose DB role lacks the permission. The role is read from
 * the DATABASE (authoritative), never from the JWT — a user promoted after
 * sign-in is granted immediately without re-login.
 */
export async function requirePermission(permission: Permission): Promise<GuardResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (!can(user.role, permission)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, userId };
}

/**
 * Backward-compatible alias for the rulesets dev section (RAU-52 pre-model).
 * The rulesets routes keep calling it; new routes use `requirePermission`
 * directly with their own permission key.
 */
export async function requireDeveloper(): Promise<GuardResult> {
  return requirePermission("rulesets.dev");
}
