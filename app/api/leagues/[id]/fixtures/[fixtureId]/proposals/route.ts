import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]/proposals
 * Returns the full negotiation history (date, author, acceptedAt, closedAt) for
 * a fixture, newest-first. Visible only to the fixture's two participants and
 * the league owner; everyone else gets 404 (no existence leak). 401 unauth.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId },
    include: {
      league: { select: { id: true, status: true, ownerId: true } },
      homeTeam: { select: { id: true, userId: true } },
      awayTeam: { select: { id: true, userId: true } },
    },
  });
  if (!fixture || fixture.league.status !== "started" || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isParticipant =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  const isAdmin = fixture.league.ownerId === userId;
  if (!isParticipant && !isAdmin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const proposals = await prisma.scheduleProposal.findMany({
    where: { fixtureId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(proposals);
}
