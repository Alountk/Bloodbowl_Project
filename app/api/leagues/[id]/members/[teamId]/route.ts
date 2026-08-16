import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/leagues/[id]/members/[teamId]
 * Removes a member team from an OPEN league by clearing its `leagueId`.
 *
 * Authorization: the league owner (admin) may expel ANY member team; the owner
 * of a member team may remove their own team (self-leave). Both paths work only
 * while the league is OPEN — a started league returns 409 (immutable). A
 * nonexistent league, a non-member team, or a foreign caller with no admin or
 * team-owner right returns 404 (no existence leak). No mutation on any
 * rejected path.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const { id, teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The league is public while open — look it up by id.
  const league = await prisma.league.findFirst({ where: { id } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.status === "started" || league.status === "finished") {
    return NextResponse.json(
      { error: "A started league locks its members" },
      { status: 409 },
    );
  }

  // The team must currently be a member of THIS league.
  const member = await prisma.team.findFirst({
    where: { id: teamId, leagueId: id },
  });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the league owner (admin) or the member team's owner may remove it.
  const isAdmin = league.ownerId === userId;
  const isTeamOwner = member.userId === userId;
  if (!isAdmin && !isTeamOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { leagueId: null },
  });
  return NextResponse.json(updated);
}
