import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/propose
 * Lets either participant (owner of the fixture's home or away team) propose a
 * match date for a STARTED-league fixture that is `pending` OR `scheduled` but
 * not yet played (rejornar: a scheduled date can be re-negotiated before play).
 *
 * Authorization guards (no existence leak):
 *   - unauthenticated  → 401
 *   - fixture missing, league not started, or caller not a participant → 404
 * Body: `{ date }` where date is an ISO timestamp (UTC). Missing/invalid → 400.
 *
 * One-active-proposal invariant: the route closes the current active proposal
 * (acceptedAt null AND closedAt null) and inserts the new one in a SINGLE
 * `$transaction`, re-checking the active state inside the transaction so
 * concurrent proposes still yield exactly one active proposal.
 *
 * A fixture that is already `played` (winnerId/scores set) is locked → 409,
 * no proposal stored (no double-result drift).
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

  // Resolve the fixture with its league and the owners of both teams. A missing
  // fixture or a non-started league returns 404 (no existence leak).
  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId },
    include: {
      league: true,
      homeTeam: { select: { id: true, userId: true } },
      awayTeam: { select: { id: true, userId: true } },
    },
  });
  if (!fixture || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // RAU-40: a finished league is definitive — no negotiation after the season.
  if (fixture.league.status === "finished") {
    return NextResponse.json({ error: "League is finished" }, { status: 409 });
  }
  if (fixture.league.status !== "started") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the home or away team owner may negotiate.
  const isParticipant =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  if (!isParticipant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { date?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date =
    typeof body.date === "string"
      ? new Date(body.date)
      : null;
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  // A PLAYED (or result-loaded) fixture is locked — 409, no proposal stored. A
  // merely SCHEDULED fixture may be re-negotiated (rejornar) before play.
  const played = fixture.winnerId != null || fixture.homeScore != null || fixture.awayScore != null;
  if (played) {
    return NextResponse.json(
      { error: "This fixture is already played" },
      { status: 409 },
    );
  }

  // The fixture id is bound to the league in the URL (defensive consistency).
  if (fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const proposal = await prisma.$transaction(async (tx) => {
    // Re-check the current active proposal inside the transaction so concurrent
    // proposes cannot both leave an active row behind.
    const active = await tx.scheduleProposal.findFirst({
      where: { fixtureId, acceptedAt: null, closedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (active) {
      await tx.scheduleProposal.updateMany({
        where: { id: active.id },
        data: { closedAt: new Date() },
      });
    }
    return tx.scheduleProposal.create({
      data: { fixtureId, userId, date },
    });
  });

  return NextResponse.json(proposal);
}
