import { NextResponse } from "next/server";
import {
  gateVerifyAttempts,
  invalidVerification,
  loadPendingVerification,
  markVerified,
  readEmail,
  secretMatches,
} from "@/lib/verificationServer";

/**
 * POST /api/auth/verify/code — confirm the address with the 6-digit code from
 * the mail. SESSIONLESS by contract (the login gate is PR 2): the body is
 * `{ email, code }`, never a user id — the target comes from the email plus
 * the secret, so a caller can only act on an address whose mail they hold.
 * Every failure answers with the identical `invalidVerification()` body
 * (malformed input, unknown email, wrong code, expired code) and attempts
 * share one per-address budget with the link endpoint; see
 * `lib/verificationServer.ts` for the no-oracle contract.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalidVerification();
  }

  const email = readEmail(body.email);
  if (email === null || typeof body.code !== "string") {
    return invalidVerification();
  }

  const gated = gateVerifyAttempts(email);
  if (gated) return gated;

  const user = await loadPendingVerification(email);
  if (
    !user ||
    !secretMatches(
      user.emailVerificationCodeHash,
      user.emailVerificationCodeExpiresAt,
      body.code,
      email,
    )
  ) {
    return invalidVerification();
  }

  await markVerified(user.id);
  return NextResponse.json({ ok: true });
}
