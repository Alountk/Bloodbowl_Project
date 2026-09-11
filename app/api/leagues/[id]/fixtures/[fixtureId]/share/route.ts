import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/devGuard";
import { ensureShareToken } from "@/lib/watchAccess";

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/share
 * Mints (or returns) the fixture's stable public share token (MSL-2). The token
 * is generated lazily on first share and NEVER rotated; a repeat share returns
 * the same value.
 *
 * RBAC: the home/away team owner, the league owner, or a `live.manage` holder
 * (developer/admin) may share. Guards, in order:
 *   - unauthenticated → 401
 *   - missing fixture / one in another league → 404 (no existence leak)
 *   - a spectator member → 403, a foreign non-member → 404 (no existence leak)
 *   - otherwise → 200 `{ token }`
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId, leagueId: id },
    select: {
      id: true,
      league: {
        select: {
          ownerId: true,
          // Member teams (owner ids) — used only to tell a spectator (403) from
          // a foreign non-member (404) without leaking existence.
          teams: { select: { userId: true } },
        },
      },
      homeTeam: { select: { userId: true } },
      awayTeam: { select: { userId: true } },
    },
  });
  // Missing fixture or one in another league → 404 (no existence leak).
  if (!fixture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isParticipant =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  const isLeagueOwner = fixture.league.ownerId === userId;

  if (!isParticipant && !isLeagueOwner) {
    // Otherwise the caller needs `live.manage` (developer/admin). A league
    // member who is not a participant/owner → 403; a foreign non-member → 404.
    const guard = await requirePermission("live.manage");
    if (!guard.ok) {
      const isMember = fixture.league.teams.some((team) => team.userId === userId);
      return NextResponse.json(
        { error: isMember ? "Forbidden" : "Not found" },
        { status: isMember ? 403 : 404 },
      );
    }
  }

  const token = await ensureShareToken(fixtureId, { prisma, randomBytes });
  return NextResponse.json({ token });
}
