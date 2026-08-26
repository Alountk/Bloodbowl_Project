import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/devGuard";

/**
 * GET /api/dev/users
 * Lists every account (id, email, name, role, plan) for the developer
 * user-management section (RAU-52). Gated by the `users.manage` permission
 * (developers today; admins inherit it later). The role is DB-authoritative.
 */
export async function GET() {
  const guard = await requirePermission("users.manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, plan: true, createdAt: true },
  });
  return NextResponse.json(users);
}
