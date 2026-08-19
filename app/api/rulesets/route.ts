import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/rulesets
 * Any authenticated user: lists the ACTIVE rulesets a new league may pick
 * (id + name + description). This is the public read surface the league-creation
 * selector uses; the developer-only `/api/dev/rulesets` stays hidden from
 * non-developers. Inactive rulesets never appear here (they cannot be selected
 * for a new league). 401 unauthenticated.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rulesets = await prisma.ruleset.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
  return NextResponse.json(rulesets);
}
