import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Pure PATCH allowlist for `/api/me`.
 *
 * Accepts ONLY `name` (free text, trimmed) and `avatar`. `avatar` is allowed
 * only when it is exactly `null` (clear) or equals the current stored value
 * (a no-op echo from the client). A `data:` URI, an external/`http(s)://` URL,
 * or any value that is not the current stored value must be rejected so a
 * client-supplied avatar can never persist (XSS via stored URL). Unknown
 * fields are also rejected. Returns `{ ok: true, data }` for the update or
 * `{ ok: false, error }` for a rejected payload.
 */
export function patchUserData(
  body: Record<string, unknown>,
  current: { name?: string | null; avatar?: string | null },
): { ok: true; data: Record<string, string | null> } | { ok: false; error: string } {
  const data: Record<string, string | null> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { ok: false, error: "name must be a string" };
    }
    data.name = body.name.trim();
  }

  if (body.avatar !== undefined) {
    // `null` clears the avatar.
    if (body.avatar === null) {
      data.avatar = null;
    } else if (typeof body.avatar === "string") {
      // Only the adapter-issued value previously persisted may be echoed back.
      if (body.avatar === current.avatar) {
        data.avatar = body.avatar;
      } else {
        return { ok: false, error: "avatar must be null or the current stored value" };
      }
    } else {
      return { ok: false, error: "avatar must be null or a string" };
    }
  }

  const allowedKeys = ["name", "avatar"];
  for (const key of Object.keys(body)) {
    if (!allowedKeys.includes(key)) {
      return { ok: false, error: `Unknown field: ${key}` };
    }
  }

  return { ok: true, data };
}

/**
 * GET /api/me
 * Returns the session user's `id`, `name`, `email`, and `avatar`.
 * 401 unauthenticated.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, avatar: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(user);
}

/**
 * PATCH /api/me
 * Updates only `name` (free text) or `avatar` (`null` to clear; otherwise the
 * current stored adapter-issued value). Any other field or a `data:`/external
 * `avatar` returns 400 and the stored value is left unchanged. 401 without a
 * session.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patch = patchUserData(body, { name: user.name, avatar: user.avatar });
  if (!patch.ok) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: patch.data,
  });
  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    avatar: updated.avatar,
  });
}
