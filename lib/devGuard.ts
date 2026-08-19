import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type DeveloperSessionResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Shared server-side guard for the /api/dev/rulesets routes (RAU-52).
 * 401 unauthenticated (or a session whose user row vanished); 403 for any
 * authenticated user whose DB role is not "developer". The role is read from the
 * DATABASE (authoritative), never from the JWT — a user promoted after sign-in
 * is granted immediately without re-login.
 */
export async function requireDeveloper(): Promise<DeveloperSessionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  if (user.role !== "developer") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, userId };
}
