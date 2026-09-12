import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/devGuard";

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]/proposals
 * Returns the full negotiation history (date, author, acceptedAt, closedAt) for
 * a fixture, newest-first. Visible to the fixture's two participants, the league
 * owner, and a `leagues.manage` holder (developer/admin); everyone else gets 404
 * (no existence leak). 401 unauth.
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
  // Participants/admin, or a `leagues.manage` holder (developer/admin). A failed
  // check maps to 404 (no existence leak).
  if (!isParticipant && !isAdmin) {
    const guard = await requirePermission("leagues.manage");
    if (!guard.ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const proposals = await prisma.scheduleProposal.findMany({
    where: { fixtureId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(proposals);
}
