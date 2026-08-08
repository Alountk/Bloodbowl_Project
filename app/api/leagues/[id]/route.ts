import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leagues/[id]
 * Returns a league owned by the session user together with its non-archived
 * member teams. Each member has `raceId`, which the client resolves to a race
 * name from the local catalog. A foreign league id returns 404 (no existence leak).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findFirst({
    where: { id, ownerId },
    include: {
      teams: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(league);
}

/**
 * DELETE /api/leagues/[id]
 * Deletes a league owned by the session user. Member teams have their `leagueId`
 * set to null (expelled) BEFORE the league row is removed, so the teams survive.
 * A foreign league id returns 404 and performs no mutation (owner-only).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findFirst({ where: { id, ownerId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Clear membership before deleting the league so member teams survive.
  await prisma.team.updateMany({
    where: { leagueId: id },
    data: { leagueId: null },
  });
  await prisma.league.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
