import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Team } from "@/features/teams/types";

/** Returns the session user id or null when the request is unauthenticated. */
async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * GET /api/teams
 * Lists the teams owned by the session user (oldest first), or 401 unauthenticated.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teams = await prisma.team.findMany({
    where: { userId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(teams);
}

/**
 * POST /api/teams
 * Creates a team owned by the session user. `userId` is injected from the
 * session, never read from the client payload.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<Team>;
  try {
    body = (await req.json()) as Partial<Team>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.raceId) {
    return NextResponse.json({ error: "Team name and race are required" }, { status: 400 });
  }

  const team = await prisma.team.create({
    data: {
      userId,
      name: body.name,
      raceId: body.raceId,
      leagueType: body.leagueType ?? "open",
      roster: (body.roster ?? []) as object,
      coaching: (body.coaching ?? {}) as object,
    },
  });
  return NextResponse.json(team, { status: 201 });
}
