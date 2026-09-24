import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isPasswordAcceptable,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SALT_ROUNDS,
  WRONG_CURRENT_PASSWORD_CODE,
  WEAK_NEW_PASSWORD_CODE,
} from "@/lib/password";
import { AUTH_RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";

/**
 * PATCH /api/me/password
 * Self-service password change. Body `{ currentPassword, newPassword }`:
 * verifies the CURRENT password with bcrypt, validates the NEW one against the
 * same rule signup uses (shared `lib/password`, min AND max), re-hashes and
 * persists it, and increments `sessionVersion` so every existing JWT for this
 * account is invalidated on its next session read (a stolen cookie dies with
 * the rotation). The caller is expected to sign in again on the next 401.
 *
 * Guards: 401 unauthenticated (or a user row that vanished); 400 invalid
 * body / wrong current password / new password out of bounds. On success
 * `{ ok: true }`. The `code` field on the two 400s lets the client pick the
 * right copy without parsing English.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Stop a stolen session from grinding the current-password check.
  const gate = rateLimit(
    `password:${userId}`,
    AUTH_RATE_LIMITS.passwordChange.limit,
    AUTH_RATE_LIMITS.passwordChange.windowMs,
  );
  if (!gate.ok) {
    return tooManyRequests(gate.retryAfterMs);
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

  if (!isPasswordAcceptable(body.newPassword)) {
    return NextResponse.json(
      {
        error: `New password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long`,
        code: WEAK_NEW_PASSWORD_CODE,
      },
      { status: 400 },
    );
  }

  const passwordHash = await hash(body.newPassword, PASSWORD_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    // sessionVersion bumps invalidate every previously issued JWT for this
    // account (see the jwt callback in auth.ts).
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return NextResponse.json({ ok: true });
}
