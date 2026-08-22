import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email";

const PASSWORD_SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/** Simple email validation (RFC-loose: something @ something . something). */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/auth/signup
 *
 * Body: `{ email, password, name? }`. Validates input, hashes the password with
 * bcryptjs, and persists a new User. Returns 201 with the created user, or a
 * 400/409 on invalid input / duplicate email. The client establishes the
 * session afterwards via `signIn("credentials")`.
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

  if (!isValidEmail(email) || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: "A valid email and a password of at least 8 characters are required" },
      { status: 400 },
    );
  }

  const passwordHash = await hash(password, PASSWORD_SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, ...(name ? { name } : {}) },
      select: { id: true, email: true, name: true },
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
