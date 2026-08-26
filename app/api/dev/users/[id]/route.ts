import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/devGuard";
import { isPlan, isRole, ROLES, PLANS } from "@/lib/permissions";

/**
 * PATCH /api/dev/users/[id]
 * Updates a user's `role` and/or `plan` (RAU-52) from the developer
 * user-management section. Gated by the `users.manage` permission.
 *
 * Guards:
 * - 400 unknown user id, an empty body, or an invalid role/plan value;
 * - 400 a user cannot change their OWN role (prevents self-lockout out of the
 *   dev section); changing one's own plan is allowed;
 * - 404 a foreign/nonexistent user row.
 * The session user's own row is read from the DB (authoritative).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requirePermission("users.manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const data: { role?: string; plan?: string } = {};
  if (body.role !== undefined) {
    if (!isRole(body.role)) {
      return NextResponse.json(
        { error: `role must be one of: ${ROLES.join(", ")}` },
        { status: 400 },
      );
    }
    data.role = body.role;
  }
  if (body.plan !== undefined) {
    if (!isPlan(body.plan)) {
      return NextResponse.json(
        { error: `plan must be one of: ${PLANS.join(", ")}` },
        { status: 400 },
      );
    }
    data.plan = body.plan;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "role or plan is required" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Self-demotion lockout guard: the session user may not change their own
  // role (their plan is fine — it never revokes permissions).
  if (data.role !== undefined && target.id === guard.userId) {
    return NextResponse.json(
      { error: "A user cannot change their own role" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data,
    select: { id: true, email: true, name: true, role: true, plan: true },
  });
  return NextResponse.json(updated);
}
