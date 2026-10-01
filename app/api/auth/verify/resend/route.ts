import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { clientIp, resetRateLimits } from "@/lib/rateLimit";
import { notifyEmailVerification } from "@/lib/mail/notify";
import { newVerificationSecrets } from "@/lib/verification";
import {
  gateResendCooldown,
  gateResendPerIp,
  loadPendingVerification,
  readEmail,
} from "@/lib/verificationServer";

function invalidEmail(): Response {
  return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
}

/**
 * POST /api/auth/verify/resend — issue a fresh code+link and mail it, guarded
 * by the 60s cooldown. Sessionless; the body is just `{ email }`.
 *
 * NO-ORACLE, decided deliberately: unknown address, already-verified account,
 * and successful resend all answer the SAME `200 { ok: true }` — the first two
 * simply do nothing. This route does NOT mirror signup's 409, because resend's
 * only limit is a per-email cooldown an attacker resets by changing the
 * address: mirroring would hand out unlimited email enumeration, while
 * signup's existing 409 is capped at 5/hour/IP. Mail failure never changes
 * the response (notify never throws; the extra guard is the same belt the
 * propose route wears).
 */
export async function POST(req: Request) {
  // CALLER cap first: it must not depend on the body at all, or the 429 would
  // start correlating with what was sent and become an oracle of its own.
  const ipGate = gateResendPerIp(clientIp(req));
  if (ipGate) return ipGate;

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalidEmail();
  }

  const email = readEmail(body.email);
  if (email === null) return invalidEmail();

  const gated = gateResendCooldown(email);
  if (gated) return gated;

  const user = await loadPendingVerification(email);
  if (!user || user.emailVerifiedAt !== null) {
    return NextResponse.json({ ok: true });
  }

  const secrets = newVerificationSecrets(email);
  await prisma.user.update({ where: { id: user.id }, data: secrets.data });
  // Fresh code → fresh attempt budget: five typo'd tries must not strand the
  // user for the whole code window after a successful resend.
  resetRateLimits(`verify:${email}`);

  try {
    await notifyEmailVerification({
      userId: user.id,
      email,
      locale: user.locale,
      code: secrets.code,
      token: secrets.token,
    });
  } catch (error) {
    logError("mail.verification.failed", error, { userId: user.id });
  }

  return NextResponse.json({ ok: true });
}
