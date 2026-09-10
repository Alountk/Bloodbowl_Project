import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/devGuard";
import { liveHub } from "@/lib/liveHub";
import { resetLiveMatch } from "@/lib/liveStore";

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/reset
 * Manually recovers a stranded live match (LMR-1/LMR-2): deletes the fixture's
 * LiveMatch (LiveEvents cascade) and returns the fixture to `scheduled`/`pending`
 * with no winner, so the match is replayable. The reset is authorized for the
 * league owner OR a developer/admin holding the new `live.manage` permission.
 *
 * Guards, in order:
 *   - unauthenticated → 401
 *   - missing fixture / one in another league → 404 (no existence leak)
 *   - finished league → 409 (definitive)
 *   - not-started (open) league → 404
 *   - not the owner and no `live.manage`: a member participant/spectator → 403,
 *     a foreign non-member → 404 (no existence leak)
 *   - fixture already played (scores, winner, or a persisted result) → 409
 *   - no LiveMatch on the fixture → 409
 *   - LiveMatch already `finished` → 409 (that is the resolution wizard's turf)
 *   - otherwise → 200 `{ ok: true }` and the `live: null` SSE frame is published.
 */
export async function POST(
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
    where: { id: fixtureId, leagueId: id },
    include: {
      league: {
        select: {
          id: true,
          status: true,
          ownerId: true,
          teams: { select: { userId: true } },
        },
      },
      result: true,
    },
  });
  // Missing fixture or one in another league → 404 (no existence leak).
  if (!fixture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // A finished league is definitive — nothing may be reset.
  if (fixture.league.status === "finished") {
    return NextResponse.json({ error: "League is finished" }, { status: 409 });
  }
  // Reset only exists for a started league; an open league is not leaked.
  if (fixture.league.status !== "started") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Owner-first: the league owner may always reset. Otherwise the caller needs
  // the `live.manage` permission (developer/admin). A league member who is not
  // the owner → 403; a foreign non-member → 404 (no existence leak).
  if (fixture.league.ownerId !== userId) {
    const guard = await requirePermission("live.manage");
    if (!guard.ok) {
      if (guard.status === 401) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const isMember = fixture.league.teams.some((team) => team.userId === userId);
      return NextResponse.json(
        { error: isMember ? "Forbidden" : "Not found" },
        { status: isMember ? 403 : 404 },
      );
    }
  }

  // A fixture with a recorded outcome (scores, winner, or a persisted result)
  // is played — there is nothing to reset.
  if (
    fixture.winnerId != null ||
    fixture.homeScore != null ||
    fixture.awayScore != null ||
    fixture.result != null
  ) {
    return NextResponse.json({ error: "This fixture already has a result" }, { status: 409 });
  }

  const liveMatch = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  if (!liveMatch) {
    return NextResponse.json({ error: "No live match to reset" }, { status: 409 });
  }
  // A finished LiveMatch is the resolution wizard's territory, never reset.
  if (liveMatch.status === "finished") {
    return NextResponse.json({ error: "Live match is finished" }, { status: 409 });
  }

  await resetLiveMatch({ fixtureId, prevSeq: liveMatch.seq }, { prisma, hub: liveHub });
  return NextResponse.json({ ok: true });
}
