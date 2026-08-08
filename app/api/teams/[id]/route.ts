import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/teams/[id]
 * Archives (soft-deletes) a team owned by the session user by setting
 * `archivedAt`. A foreign team id (owned by another user) is treated as 404 so
 * the existence of other users' teams is not leaked.
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

  const team = await prisma.team.findFirst({ where: { id, userId } });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.team.update({
    where: { id },
    data: { archivedAt: new Date() },
  });
  return new NextResponse(null, { status: 204 });
}
