import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/forfeit
 * The league owner (admin) awards a walkover victory to one of the fixture's two
 * teams: sets the fixture's `winnerId` (deriving `played`) and closes any open
 * proposal in a single `$transaction`. This is the only match-resolution
 * mechanism in this iteration.
 *
 * Guards:
 *   - unauthenticated → 401
 *   - authenticated non-admin (participant, member, foreign) → 403
 *   - `winnerTeamId` not home or away → 400
 *   - fixture already `played` (winnerId set) → 409
 *   - scheduled or pending fixtures MAY be forfeited (scheduledAt is cleared).
 */
export async function POST(
  req: Request,
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
    },
  });
  if (!fixture || fixture.league.status !== "started" || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the league owner may award a forfeit.
  if (fixture.league.ownerId !== userId) {
    return NextResponse.json(
      { error: "Only the league owner can forfeit a match" },
      { status: 403 },
    );
  }

  if (fixture.winnerId != null) {
    return NextResponse.json(
      { error: "This fixture is already played" },
      { status: 409 },
    );
  }

  let body: { winnerTeamId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const winnerTeamId = typeof body.winnerTeamId === "string" ? body.winnerTeamId : "";
  if (winnerTeamId !== fixture.homeTeamId && winnerTeamId !== fixture.awayTeamId) {
    return NextResponse.json(
      { error: "winnerTeamId must be the home or away team" },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.scheduleProposal.updateMany({
      where: { fixtureId, acceptedAt: null, closedAt: null },
      data: { closedAt: new Date() },
    });
    return tx.fixture.update({
      where: { id: fixtureId },
      data: { winnerId: winnerTeamId, scheduledAt: null },
      include: {
        league: true,
        homeTeam: { select: { id: true, userId: true, name: true } },
        awayTeam: { select: { id: true, userId: true, name: true } },
      },
    });
  });

  return NextResponse.json(updated);
}
