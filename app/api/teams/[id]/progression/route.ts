import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PlayerProgressionCore } from "@/features/teams/types";

/**
 * GET /api/teams/[teamId]/progression
 * Returns the team owner's Player progression rows (pe, skills, injuries,
 * valueBonus, alive, improvements) mapped to `PlayerProgressionCore[]`, keyed for
 * the ProgressionPanel by `rosterPlayerId`. Owned team only: a foreign or
 * archived team id returns 404 (no existence leak), unauthenticated 401. When the
 * team has no Player rows yet (no result recorded), the payload is an empty list —
 * the page then renders the roster without the Progresión controls, matching the
 * read-only rival view.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const players = await prisma.player.findMany({
    where: { teamId },
    select: {
      rosterPlayerId: true,
      pe: true,
      skills: true,
      injuries: true,
      valueBonus: true,
      alive: true,
      improvements: true,
    },
  });

  const payload: PlayerProgressionCore[] = players.map((p) => ({
    rosterPlayerId: p.rosterPlayerId,
    pe: p.pe,
    skills: Array.isArray(p.skills) ? (p.skills as string[]) : [],
    injuries: Array.isArray(p.injuries) ? (p.injuries as string[]) : [],
    valueBonus: p.valueBonus,
    alive: p.alive,
    improvements: Array.isArray(p.improvements) ? p.improvements.length : 0,
  }));

  return NextResponse.json(payload);
}
