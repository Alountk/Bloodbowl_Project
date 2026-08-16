import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildRoundRobin, type FixtureDraft } from "@/lib/roundRobin";

/**
 * POST /api/leagues/[id]/start
 * Starts a round-robin season for an OPEN league owned by the session user.
 *
 * Guards: owner-only (foreign → 404), the league must be OPEN (started → 409),
 * at least 2 member teams must exist (409), and `seasonLength` must be a valid
 * integer in `1..teams-1` (400 for a non-integer, 409 out of range). When the
 * body omits `seasonLength` it defaults to `teams - 1` (a perfect round-robin).
 *
 * On success, in ONE Prisma transaction: the team ids are shuffled, the circle
 * method produces the requested number of rounds, the fixtures are created
 * (createMany) and the league flips to `started` with `seasonLength` and
 * `startedAt` — atomically. Returns the started league with its fixtures.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owner-only: a foreign league id returns 404 (no existence leak).
  const league = await prisma.league.findFirst({ where: { id, ownerId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.status === "started" || league.status === "finished") {
    return NextResponse.json(
      { error: "This league has already started" },
      { status: 409 },
    );
  }

  // Member teams are the players in the season.
  const memberTeams = await prisma.team.findMany({
    where: { leagueId: id, archivedAt: null },
    select: { id: true },
  });
  const teamIds = memberTeams.map((team) => team.id);
  if (teamIds.length < 2) {
    return NextResponse.json(
      { error: "A season needs at least two member teams" },
      { status: 409 },
    );
  }

  // Resolve + validate seasonLength (defaults to a perfect round-robin).
  let requested: unknown;
  try {
    const body = (await req.json().catch(() => ({}))) as { seasonLength?: unknown };
    requested = body.seasonLength;
  } catch {
    requested = undefined;
  }
  const seasonLength =
    requested === undefined || requested === "" || requested === null
      ? teamIds.length - 1
      : requested;
  if (typeof seasonLength !== "number" || !Number.isInteger(seasonLength)) {
    return NextResponse.json(
      { error: "seasonLength must be an integer between 1 and teams - 1" },
      { status: 400 },
    );
  }
  if (seasonLength < 1 || seasonLength > teamIds.length - 1) {
    return NextResponse.json(
      {
        error: `seasonLength must be between 1 and ${teamIds.length - 1}`,
      },
      { status: 409 },
    );
  }

  // Shuffle + circle + fixture inserts + league flip, atomically.
  const started = await prisma.$transaction(async (tx) => {
    const fixtures = buildRoundRobin(teamIds, seasonLength);
    await tx.fixture.createMany({
      data: fixtures.map((draft: FixtureDraft) => ({
        leagueId: id,
        round: draft.round,
        homeTeamId: draft.homeTeamId,
        awayTeamId: draft.awayTeamId,
      })),
    });
    const updated = await tx.league.update({
      where: { id },
      data: { status: "started", seasonLength, startedAt: new Date() },
    });
    return { league: updated, fixtures };
  });

  return NextResponse.json({
    ...started.league,
    status: started.league.status,
    fixtures: started.fixtures,
  });
}
