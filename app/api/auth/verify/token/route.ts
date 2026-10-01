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
 * POST /api/auth/verify/token — activate via the emailed link ("por si cierra
 * el alta sin querer"). SESSIONLESS, same contract as the code endpoint: the
 * body is `{ token, email }` (both ride in the link URL — the stored hash is
 * domain-separated by the address, so the pair is required). Wrong token,
 * unknown email, and expired token all answer with the identical
 * `invalidVerification()` body, and this endpoint draws from the SAME attempt
 * budget as the code endpoint; see `lib/verificationServer.ts`.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return invalidVerification();
  }

  const email = readEmail(body.email);
  if (email === null || typeof body.token !== "string") {
    return invalidVerification();
  }

  const gated = gateVerifyAttempts(email);
  if (gated) return gated;

  const user = await loadPendingVerification(email);
  if (
    !user ||
    !secretMatches(
      user.emailVerificationTokenHash,
      user.emailVerificationTokenExpiresAt,
      body.token,
      email,
    )
  ) {
    return invalidVerification();
  }

  await markVerified(user.id);
  return NextResponse.json({ ok: true });
}
