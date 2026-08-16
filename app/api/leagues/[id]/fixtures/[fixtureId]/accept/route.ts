import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/accept
 * Lets the OTHER participant accept the fixture's active proposal, scheduling
 * the match: sets the proposal's `acceptedAt` and the fixture's `scheduledAt`
 * to the proposed date in a single `$transaction`.
 *
 * Authorization guards (no existence leak):
 *   - unauthenticated → 401
 *   - fixture missing, league not started, or caller not a participant → 404
 *   - the proposal's creator cannot self-accept → 409
 * Returns `{ fixture }` (the updated fixture plus owner/proposal enrichment).
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
      league: true,
      homeTeam: { select: { id: true, userId: true, name: true } },
      awayTeam: { select: { id: true, userId: true, name: true } },
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

  const isParticipant =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  if (!isParticipant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // A PLAYED (or result-loaded) fixture is locked — 409. A merely SCHEDULED
  // fixture may be re-accepted (rejornar): accept updates scheduledAt.
  const played =
    fixture.winnerId != null || fixture.homeScore != null || fixture.awayScore != null;
  if (played) {
    return NextResponse.json(
      { error: "This fixture is already played" },
      { status: 409 },
    );
  }

  let body: { proposalId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
  if (!proposalId) {
    return NextResponse.json({ error: "proposalId is required" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    // The proposal must belong to THIS fixture. If it does not exist at all it
    // is a foreign/missing id → 404; if it exists but is closed/accepted it is a
    // state conflict → 409. Distinguishing these avoids leaking other fixtures'
    // proposals while still reporting the "already settled" conflict.
    const proposal = await tx.scheduleProposal.findFirst({
      where: { id: proposalId, fixtureId },
    });
    if (!proposal) {
      return { error: "Not found" as const };
    }
    if (proposal.acceptedAt != null || proposal.closedAt != null) {
      return { error: "This proposal is no longer active" as const, status: 409 as const };
    }
    // The proposal's OWNER cannot accept their own proposal.
    if (proposal.userId === userId) {
      return { error: "You cannot accept your own proposal" as const, status: 409 as const };
    }
    // Re-check the fixture is still schedulable inside the transaction (only a
    // PLAYED fixture is blocked — a scheduled one may be re-scheduled).
    const current = await tx.fixture.findFirst({ where: { id: fixtureId } });
    if (
      current &&
      (current.winnerId != null ||
        current.homeScore != null ||
        current.awayScore != null)
    ) {
      return { error: "This fixture is already played" as const, status: 409 as const };
    }

    await tx.scheduleProposal.update({
      where: { id: proposalId },
      data: { acceptedAt: new Date() },
    });
    const updatedFixture = await tx.fixture.update({
      where: { id: fixtureId },
      data: { scheduledAt: proposal.date },
      include: {
        league: true,
        homeTeam: { select: { id: true, userId: true, name: true } },
        awayTeam: { select: { id: true, userId: true, name: true } },
      },
    });
    return { fixture: updatedFixture };
  });

  if (updated && "fixture" in updated) {
    return NextResponse.json(updated.fixture);
  }
  if (updated && "status" in updated) {
    return NextResponse.json({ error: updated.error }, { status: updated.status });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
