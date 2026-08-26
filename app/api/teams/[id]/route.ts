import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { attachPeToTeams } from "@/lib/players";

/**
 * Pure visibility gate for the read-only scouting GET. A team is visible to:
 * 1. its OWNER,
 * 2. the OWNER of the league the team belongs to,
 * 3. any team that is a current member of that league.
 * Every other authenticated user is denied (the route maps denial to 404, so
 * the existence of foreign/archived teams is never leaked).
 *
 * Extracted as a pure function so the guard is unit-testable without mocks.
 */
export function canViewScoutedTeam(opts: {
  userId: string;
  teamUserId: string;
  teamLeagueId: string | null;
  leagueOwnerId: string | null;
  /** Whether the requesting user owns a current member team of the league. */
  leagueHasMemberUserId: boolean;
}): boolean {
  // Owner always sees their own team.
  if (opts.userId === opts.teamUserId) return true;
  // A team with no league is visible only to its owner (unassigned).
  if (opts.teamLeagueId == null) return false;
  // The league owner slots into the league.
  if (opts.leagueOwnerId != null && opts.userId === opts.leagueOwnerId) return true;
  // Any current member of the league may scout a rival.
  if (opts.leagueHasMemberUserId) return true;
  return false;
}

/**
 * GET /api/teams/[id]
 * Read-only scouting detail for a team: id, name, raceId, roster, coaching,
 * leagueId, treasury. No mutation affordances. Visibility follows
 * `canViewScoutedTeam`; every denied or archived caller receives 404 (no
 * existence leak), 401 unauth.
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

  // Fetch the non-archived team with its league; the league's member teams owned
  // by the caller tell us whether they are a current member of that league.
  const team = await prisma.team.findFirst({
    where: { id, archivedAt: null },
    include: {
      league: {
        select: {
          id: true,
          ownerId: true,
          teams: { where: { userId }, select: { id: true } },
        },
      },
    },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = canViewScoutedTeam({
    userId,
    teamUserId: team.userId,
    teamLeagueId: team.leagueId,
    leagueOwnerId: team.league?.ownerId ?? null,
    leagueHasMemberUserId: (team.league?.teams.length ?? 0) > 0,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Return strictly read-only fields; the relations must never leak. RAU-14:
  // the roster entries carry their Player `pe` so scouting shows experience.
  const [attached] = await attachPeToTeams([{ id: team.id, roster: team.roster }]);
  return NextResponse.json({
    id: team.id,
    name: team.name,
    raceId: team.raceId,
    roster: attached.roster,
    coaching: team.coaching,
    leagueId: team.leagueId,
    treasury: team.treasury,
  });
}

/**
 * DELETE /api/teams/[id]
 * Archives (soft-deletes) a team owned by the session user by setting
 * `archivedAt`. A foreign team id (owned by another user) is treated as 404 so
 * the existence of other users' teams is not leaked. A team that still belongs
 * to a league (`leagueId != null`) cannot be archived: the DELETE returns 409
 * and the row is left untouched.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({ where: { id, userId, archivedAt: null } });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (team.leagueId != null) {
    return NextResponse.json(
      { error: "This team still belongs to a league. Expel it first." },
      { status: 409 },
    );
  }

  await prisma.team.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return new NextResponse(null, { status: 204 });
}
