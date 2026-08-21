import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/leagues/[id]/teams
 * Joins a team to a league (one team per league). ANY authenticated user can
 * join an OPEN league (public join), not only the owner.
 *
 * Guards (spec): the league must be OPEN (a started league is immutable → 409);
 * the team must be owned by the session user, currently unassigned
 * (`leagueId: null`) and non-archived. A nonexistent league or a foreign team
 * returns 404; an already-member or archived team returns 409. One user = one
 * team per league (RAU-54): if the session user ALREADY owns a member team in
 * this league, joining a second one returns 409 and the team row is untouched.
 * No mutation occurs on any rejected path.
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

  // The league is public while open — look it up by id, not by owner.
  const league = await prisma.league.findFirst({ where: { id } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.status === "started" || league.status === "finished") {
    return NextResponse.json(
      { error: "A started league does not accept new teams" },
      { status: 409 },
    );
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

  // One user = one team per league (RAU-54): the session user may hold at most
  // one member team in a league. Checked BEFORE the update so a rejected second
  // join never mutates the team. (The team being joined is unassigned and its
  // own leagueId is null, so it can never match this query.)
  const existingMember = await prisma.team.findFirst({
    where: { leagueId: id, userId: ownerId, archivedAt: null },
    select: { id: true },
  });
  if (existingMember) {
    return NextResponse.json(
      { error: "Ya tienes un equipo en esta liga" },
      { status: 409 },
    );
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { leagueId: id },
  });
  return NextResponse.json(updated);
}
