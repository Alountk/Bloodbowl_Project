import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enrichFixture } from "@/app/api/leagues/[id]/route";

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]
 * Returns a single fixture together with its persisted `MatchResult` snapshot
 * and both teams' enriched rosters. The fixture is enriched via `enrichFixture`
 * (derived status + resolved owner refs) and its nested `homeTeam`/`awayTeam`
 * are stripped (D3) so the response is normalized: `{ fixture, result,
 * homeTeam, awayTeam }`.
 *
 * Visibility follows the league detail gate (D6): unauthenticated → 401; the
 * fixture is looked up scoped to the league (`findFirst({id, leagueId})`) so a
 * missing fixture or one in another league → 404 with no existence leak; a
 * STARTED league is visible only to the league owner or any current member,
 * else 404 (identical body, no status leak); an OPEN league is visible to any
 * authenticated user (defensive — no fixtures exist while open).
 *
 * A walkover (fixture forfeited: scores set, no `MatchResult` row) returns
 * `result: null` (MV-2). Read-only, identical in both `AUTH_MODE` variants —
 * the route never reads the env, only `auth()`.
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
    where: { id: fixtureId, leagueId: id },
    include: {
      league: {
        select: {
          status: true,
          ownerId: true,
          teams: { select: { userId: true }, where: { archivedAt: null } },
        },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
          raceId: true,
          userId: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          players: {
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              valueBonus: true,
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          raceId: true,
          userId: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          players: {
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              valueBonus: true,
            },
          },
        },
      },
      result: true,
    },
  });
  // Missing fixture or one in another league → 404 (no existence leak).
  if (!fixture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Started league: owner or any current member only, else identical 404.
  if (fixture.league.status === "started") {
    const isMember = fixture.league.teams.some((team) => team.userId === userId);
    if (fixture.league.ownerId !== userId && !isMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // D3: `fixture` = enriched output with nested teams stripped; `result` stays
  // top-level (null for a walkover); teams carry the normalized roster/coach.
  // `FixtureWithMatchday` is not exported from the detail route — cast the raw
  // row structurally (D7).
  const enriched = enrichFixture(fixture as never);
  const { homeTeam, awayTeam } = fixture;
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    homeTeam: _strippedHome,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    awayTeam: _strippedAway,
    ...fixtureRest
  } = enriched;

  return NextResponse.json({
    fixture: fixtureRest,
    result: fixture.result ?? null,
    homeTeam,
    awayTeam,
  });
}
