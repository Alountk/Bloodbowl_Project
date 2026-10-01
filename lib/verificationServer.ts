import { NextResponse } from "next/server";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { AUTH_RATE_LIMITS, rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { hashVerificationValue, isExpired } from "@/lib/verification";

/**
 * Server-side enforcement for the sessionless verify endpoints (issue #197,
 * PR 1). `lib/verification.ts` stays pure; this module is the Prisma + rate
 * limit + HTTP half.
 *
 * NO-ORACLE CONTRACT — kept here so the three routes cannot drift apart:
 * every account-dependent failure answers with the SAME status and body
 * (`invalidVerification()`), whether the email is unknown, the secret is
 * wrong, or it has expired. The repo already discloses existence through
 * signup's 409 (openspec/specs/user-auth), which is capped at 5/hour/IP by
 * `AUTH_RATE_LIMITS.signup`; a second, smarter oracle here — especially on
 * resend, where the only limit is a per-email cooldown an attacker sidesteps
 * by changing the address — would be an UNRATELIMITED enumeration channel.
 * So on purpose: unknown == wrong == expired, and resend answers 200 { ok }
 * for unknown and already-verified addresses alike. The residual difference
 * is response TIME (a known address does DB writes); that carries no usable
 * signal next to the wholesale signup-409 disclosure.
 */
export function invalidVerification(): Response {
  return NextResponse.json(
    { error: "Invalid or expired verification code" },
    { status: 400 },
  );
}

/**
 * Normalizes and validates the email half of the (email, secret) pair.
 * Format errors are NOT account-dependent, so callers may answer a plain 400
 * without touching the DB. The target user is ALWAYS derived from this value
 * plus the secret — never from a client-supplied id.
 */
export function readEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = normalizeEmail(raw);
  return isValidEmail(email) ? email : null;
}

/**
 * Attempt budget shared by BOTH secrets: a wrong code and a wrong token are
 * the same attack surface, so they draw from one per-address bucket — trying
 * each endpoint separately must not double the tries. Checked BEFORE the DB
 * lookup, so guessing is capped even for addresses that do not exist (and a
 * probing attacker can never distinguish outcomes by whether the bucket moved).
 */
export function gateVerifyAttempts(email: string): Response | null {
  const gate = rateLimit(
    `verify:${email}`,
    AUTH_RATE_LIMITS.verify.limit,
    AUTH_RATE_LIMITS.verify.windowMs,
  );
  return gate.ok ? null : tooManyRequests(gate.retryAfterMs);
}

/** Resend cooldown: 1 mail per window per address, checked BEFORE the lookup
 *  so unknown addresses are throttled identically. */
export function gateResendCooldown(email: string): Response | null {
  const gate = rateLimit(
    `resend:${email}`,
    AUTH_RATE_LIMITS.resend.limit,
    AUTH_RATE_LIMITS.resend.windowMs,
  );
  return gate.ok ? null : tooManyRequests(gate.retryAfterMs);
}

/** Resend, capped by the CALLER (not the target): 5/hour/IP.
 *
 *  Checked AFTER the per-address cooldown but BEFORE the lookup, and it
 *  records only when a resend actually proceeds: a cooldown denial sends no
 *  mail, so it must not consume the budget that exists to bound mail volume
 *  (impatient clicks inside the 60s window used to burn hourly slots). Like
 *  the cooldown it is identity-blind — format and recent-resend state say
 *  nothing about whether an account exists — so the no-oracle contract holds
 *  while mail volume and the number of `verify:` budget resets one host can
 *  force stay bounded. */
export function gateResendPerIp(ip: string): Response | null {
  const gate = rateLimit(
    `resend-ip:${ip}`,
    AUTH_RATE_LIMITS.resendIp.limit,
    AUTH_RATE_LIMITS.resendIp.windowMs,
  );
  return gate.ok ? null : tooManyRequests(gate.retryAfterMs);
}

/** The single lookup all three verify routes use, scoped by normalized email. */
export function loadPendingVerification(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      locale: true,
      emailVerifiedAt: true,
      emailVerificationCodeHash: true,
      emailVerificationCodeExpiresAt: true,
      emailVerificationTokenHash: true,
      emailVerificationTokenExpiresAt: true,
    },
  });
}

/**
 * Stored hash matches AND has not expired. A `null` stored value (unknown
 * account, no pending secret, already consumed by the other path) fails
 * exactly like a wrong guess — it flows into `invalidVerification()`, which is
 * the whole point: no caller can tell the cases apart.
 */
export function secretMatches(
  storedHash: string | null,
  expiresAt: Date | null,
  value: string,
  email: string,
): boolean {
  if (storedHash === null || isExpired(expiresAt)) return false;
  return hashVerificationValue(value, email) === storedHash;
}

/**
 * Success side-effect: stamps the address and consumes BOTH secrets — the
 * account is verified, so the other activation path is moot and a consumed
 * secret can never be replayed.
 */
export async function markVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationCodeHash: null,
      emailVerificationCodeExpiresAt: null,
      emailVerificationTokenHash: null,
      emailVerificationTokenExpiresAt: null,
    },
  });
}
