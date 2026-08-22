import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isPasswordLongEnough,
  PASSWORD_SALT_ROUNDS,
  WRONG_CURRENT_PASSWORD_CODE,
  WEAK_NEW_PASSWORD_CODE,
} from "@/lib/password";

/**
 * PATCH /api/me/password
 * Self-service password change. Body `{ currentPassword, newPassword }`:
 * verifies the CURRENT password with bcrypt, validates the NEW one against the
 * same rule signup uses (shared `lib/password`), then re-hashes and persists
 * it. The session stays valid (JWT) so the user keeps browsing; the NEW
 * password is what the next login accepts.
 *
 * Guards: 401 unauthenticated (or a user row that vanished); 400 invalid
 * body / wrong current password / new password too short. On success `{ ok:
 * true }`. The `code` field on the two 400s lets the client pick the right
 * copy without parsing English.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string") {
    return NextResponse.json(
      { error: "currentPassword and newPassword must be strings" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentMatches = await compare(body.currentPassword, user.passwordHash);
  if (!currentMatches) {
    return NextResponse.json(
      { error: "Current password is incorrect", code: WRONG_CURRENT_PASSWORD_CODE },
      { status: 400 },
    );
  }

  if (!isPasswordLongEnough(body.newPassword)) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters long", code: WEAK_NEW_PASSWORD_CODE },
      { status: 400 },
    );
  }

  const passwordHash = await hash(body.newPassword, PASSWORD_SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return NextResponse.json({ ok: true });
}
