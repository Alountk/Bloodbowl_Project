import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
