import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Valid per-turn clock durations (seconds) enforced server-side (AC-10). */
const TURN_CLOCK_SECONDS = [120, 240, 360] as const;
type TurnClockSeconds = (typeof TURN_CLOCK_SECONDS)[number];

function isTurnClockSeconds(value: number): value is TurnClockSeconds {
  return (TURN_CLOCK_SECONDS as readonly number[]).includes(value);
}

/**
 * GET /api/leagues
 * Returns ALL open leagues (any user) PLUS the session user's own leagues in
 * any status (foreign started leagues are hidden), each enriched with the
 * owner's name (falls back to the email) and a server-computed member count
 * (non-archived member teams) — the count comes from the query, not a per-item
 * detail fetch (kills the N+1). 401 unauthenticated.
 */
export async function GET() {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const leagues = await prisma.league.findMany({
    where: {
      // Open leagues are public to all authenticated users; each user's own
      // leagues (including started) always appear.
      OR: [{ status: "open" }, { ownerId }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      _count: {
        select: { teams: { where: { archivedAt: null } } },
      },
    },
  });
  return NextResponse.json(
    leagues.map(({ owner, _count, ...league }) => ({
      ...league,
      ownerName: owner?.name ?? owner?.email ?? null,
      memberCount: _count.teams,
    })),
  );
}

/**
 * POST /api/leagues
 * Creates a league owned by the session user. `ownerId` is injected from the
 * session, never read from the client. Returns 409 when the league name already
 * exists globally (Prisma unique-constraint error P2002). When the turn-clock
 * option is omitted it defaults to enabled@240 (League DB defaults); when
 * disabled only the duration defaults apply and the duration is ignored; an
 * invalid duration (not exactly 120, 240 or 360) returns 400 BEFORE any write
 * (no partial league rows). The option is immutable: this route has no update
 * path, so it can never be altered after creation (AC-10).
 */
export async function POST(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    name?: unknown;
    description?: unknown;
    turnClockEnabled?: unknown;
    turnClockSeconds?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "League name is required" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description : null;

  const turnClockEnabled =
    typeof body.turnClockEnabled === "boolean" ? body.turnClockEnabled : true;
  let turnClockSeconds = 240;
  if (typeof body.turnClockSeconds === "number") {
    turnClockSeconds = body.turnClockSeconds;
  }
  if (turnClockEnabled && !isTurnClockSeconds(turnClockSeconds)) {
    return NextResponse.json(
      { error: "Turn clock duration must be 120, 240 or 360 seconds" },
      { status: 400 },
    );
  }

  try {
    const league = await prisma.league.create({
      data: { ownerId, name, description, turnClockEnabled, turnClockSeconds },
    });
    return NextResponse.json(league, { status: 201 });
  } catch (error) {
    // Prisma unique constraint on League.name (global) → duplicate name.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "League name already exists" }, { status: 409 });
    }
    throw error;
  }
}
