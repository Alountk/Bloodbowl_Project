import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/leagues/[id]/members/[teamId]
 * Expels a member team from the league by clearing its `leagueId`.
 *
 * Guards: the league must belong to the session user (foreign → 404) and the
 * team must be a member of THIS league (owned by the user and leagueId matches);
 * otherwise 404 with no mutation.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  const { id, teamId } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The league must belong to the session user.
  const league = await prisma.league.findFirst({ where: { id, ownerId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The team must currently be a member of THIS league.
  const member = await prisma.team.findFirst({
    where: { id: teamId, userId: ownerId, leagueId: id },
  });
  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { leagueId: null },
  });
  return NextResponse.json(updated);
}
