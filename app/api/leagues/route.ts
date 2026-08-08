import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leagues
 * Lists the leagues owned by the session user, or 401 unauthenticated.
 */
export async function GET() {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const leagues = await prisma.league.findMany({
    where: { ownerId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(leagues);
}

/**
 * POST /api/leagues
 * Creates a league owned by the session user. `ownerId` is injected from the
 * session, never read from the client. Returns 409 when the league name already
 * exists globally (Prisma unique-constraint error P2002).
 */
export async function POST(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; description?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "League name is required" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description : null;

  try {
    const league = await prisma.league.create({
      data: { ownerId, name, description },
    });
    return NextResponse.json(league, { status: 201 });
  } catch (error) {
    // Prisma unique constraint on League.name (global) → duplicate name.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "League name already exists" }, { status: 409 });
    }
    throw error;
  }
}
