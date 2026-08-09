import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leagues/[id]
 * Returns a league together with its non-archived member teams, the owner's
 * name, and (when started) the season fixtures grouped by round (each fixture
 * carries its jornada `round` with labeled home/away teams).
 *
 * Visibility: an OPEN league is readable by any authenticated user; a STARTED
 * league is readable only by its owner or a current member. A foreign non-
 * member requesting a started league gets 404 (no existence/status leak), and
 * a nonexistent id returns 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findFirst({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      teams: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Started league: owner-only or member-only to shield fixture data.
  if (league.status === "started") {
    const isMember = league.teams.some((team) => team.userId === userId);
    if (league.ownerId !== userId && !isMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const fixtures =
    league.status === "started"
      ? await prisma.fixture.findMany({
          where: { leagueId: id },
          orderBy: [{ round: "asc" }, { createdAt: "asc" }],
        })
      : [];

  const { owner, ...rest } = league;
  return NextResponse.json({
    ...rest,
    status: rest.status,
    ownerName: owner?.name ?? owner?.email ?? null,
    fixtures,
  });
}

/**
 * DELETE /api/leagues/[id]
 * Deletes an OPEN league owned by the session user, clearing each member
 * team's `leagueId` (SetNull) BEFORE the league row is removed so teams
 * survive. A STARTED league is immutable: DELETE returns 409 and performs no
 * mutation (teams and fixtures remain). A foreign league id returns 404.
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
  if (league.status === "started") {
    return NextResponse.json(
      { error: "A started league cannot be deleted" },
      { status: 409 },
    );
  }

  // Clear membership before deleting the league so member teams survive.
  await prisma.team.updateMany({
    where: { leagueId: id },
    data: { leagueId: null },
  });
  await prisma.league.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
