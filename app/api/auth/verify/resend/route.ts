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
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalidEmail();
  }

  const email = readEmail(body.email);
  if (email === null) return invalidEmail();

  // Cooldown FIRST: it is keyed by the target address, and a cooldown denial
  // sends no mail — so it must NOT draw from the caller's per-IP budget below,
  // whose whole purpose is bounding MAIL volume. Checking the per-IP gate
  // first (which records on pass) let four impatient clicks inside the 60s
  // window consume 4 of the 5 hourly slots, stranding a legitimate, mail-less
  // user behind the ~1h per-IP 429.
  const cooldown = gateResendCooldown(email);
  if (cooldown) return cooldown;

  // CALLER cap: 5/hour/IP, recorded only when a resend actually proceeds.
  // Identity-blind like every gate above (format + cooldown say nothing about
  // existence), and BOTH gates still run before the lookup — so unknown and
  // known addresses answer identically and the no-oracle contract holds.
  const ipGate = gateResendPerIp(clientIp(req));
  if (ipGate) return ipGate;

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
