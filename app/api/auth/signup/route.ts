import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { isPasswordAcceptable, PASSWORD_SALT_ROUNDS } from "@/lib/password";
import { isLocale } from "@/lib/i18n/serverLocale";
import { logError } from "@/lib/logger";
import { notifyEmailVerification } from "@/lib/mail/notify";
import { newVerificationSecrets } from "@/lib/verification";
import {
  AUTH_RATE_LIMITS,
  clientIp,
  rateLimit,
  tooManyRequests,
} from "@/lib/rateLimit";

/** Same bound the player-rename route uses — names stay display-sized. */
const MAX_NAME_LENGTH = 50;

/**
 * RAU-58: the account starts in the language the user was browsing in. The
 * client's I18nProvider persists the resolved locale to the `bb-locale` cookie
 * on first render, so by the time the signup form is submitted the cookie
 * reflects the browser preference. Fall back to the DB default (es) when the
 * cookie is absent/invalid.
 */
function readSignupLocale(req: Request): "es" | "en" | undefined {
  const header = req.headers.get("cookie") ?? "";
  const value = header
    .split("; ")
    .find((part) => part.startsWith("bb-locale="))
    ?.split("=")[1];
  return isLocale(value) ? value : undefined;
}

/**
 * POST /api/auth/signup
 *
 * Body: `{ email, password, name? }`. Validates input, hashes the password with
 * bcryptjs, and persists a new User (locale captured from the `bb-locale`
 * cookie so the account inherits the signup language). Returns 201 with the
 * created user, or a 400/409 on invalid input / duplicate email. The client
 * establishes the session afterwards via `signIn("credentials")`.
 *
 * Issue #197 PR 1 (additive): the create also stores the pending verification
 * code/link secrets (hashes only) and mails them best-effort. The response,
 * the session flow, and enforcement are untouched — verification is enforced
 * in PR 2; until then `emailVerifiedAt` simply stays NULL on new signups.
 */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const password = body.password ?? "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const locale = readSignupLocale(req);

  // Abuse control: burst signups from one IP before any bcrypt work.
  const gate = rateLimit(
    `signup:${clientIp(req)}`,
    AUTH_RATE_LIMITS.signup.limit,
    AUTH_RATE_LIMITS.signup.windowMs,
  );
  if (!gate.ok) {
    return tooManyRequests(gate.retryAfterMs);
  }

  if (
    !isValidEmail(email) ||
    !isPasswordAcceptable(password) ||
    name.length > MAX_NAME_LENGTH
  ) {
    return NextResponse.json(
      {
        error:
          "A valid email, a password of 8-128 characters, and a name of at most 50 characters are required",
      },
      { status: 400 },
    );
  }

  const passwordHash = await hash(password, PASSWORD_SALT_ROUNDS);

  try {
    // Secrets are generated BEFORE the insert and stored (hashed) IN the
    // insert, so a row never exists without its mail having been queued in
    // the same request.
    const secrets = newVerificationSecrets(email);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        locale,
        ...(name ? { name } : {}),
        ...secrets.data,
      },
      select: { id: true, email: true, name: true, locale: true },
    });

    // Best-effort by contract: notifyEmailVerification NEVER throws, and the
    // extra guard mirrors the propose route — a mail problem must not change
    // the 201 (sendMail resolves false instead of rejecting).
    try {
      await notifyEmailVerification({
        userId: user.id,
        email: user.email,
        locale: user.locale,
        code: secrets.code,
        token: secrets.token,
      });
    } catch (error) {
      logError("mail.verification.failed", error, { userId: user.id });
    }

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const isDuplicate = (error as { code?: string }).code === "P2002";
    if (isDuplicate) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
