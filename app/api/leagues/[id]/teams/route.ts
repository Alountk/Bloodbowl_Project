import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/leagues/[id]/teams
 * Assigns an owned team to a league (one team per league).
 *
 * Guards (spec): the team must be owned by the session user and currently
 * unassigned (`leagueId: null`) and non-archived. A foreign league or foreign
 * team returns 404; an already-member or archived team returns 409. No mutation
 * occurs on any rejected path.
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

  let body: { teamId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  if (!teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  }

  // The target league must belong to the session user.
  const league = await prisma.league.findFirst({ where: { id, ownerId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The team must be owned by the session user (foreign → 404).
  const team = await prisma.team.findFirst({ where: { id: teamId, userId: ownerId } });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // It must be non-archived and currently unassigned.
  if (team.archivedAt != null) {
    return NextResponse.json({ error: "Archived team cannot be assigned" }, { status: 409 });
  }
  if (team.leagueId != null) {
    return NextResponse.json({ error: "Team already belongs to a league" }, { status: 409 });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { leagueId: id },
  });
  return NextResponse.json(updated);
}
