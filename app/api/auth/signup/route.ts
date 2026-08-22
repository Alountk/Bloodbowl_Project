import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";
import { isPasswordLongEnough, PASSWORD_SALT_ROUNDS } from "@/lib/password";
import { isLocale } from "@/lib/i18n/serverLocale";

/** Simple email validation (RFC-loose: something @ something . something). */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

  if (!isValidEmail(email) || !isPasswordLongEnough(password)) {
    return NextResponse.json(
      { error: "A valid email and a password of at least 8 characters are required" },
      { status: 400 },
    );
  }

  const passwordHash = await hash(password, PASSWORD_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, locale, ...(name ? { name } : {}) },
      select: { id: true, email: true, name: true, locale: true },
    });
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
