import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Team } from "@/features/teams/types";
import { DEFAULT_COACHING, isCoachingStaff } from "@/features/teams/types";
import { getRaceById } from "@/features/teams/data/races";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeCoachingCost,
  computeRosterCostFromPlayers,
} from "@/features/teams/roster";

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
 *
 * Optional `leagueId` (RAU-56): creates the team ALREADY assigned to the
 * league, enforcing its ruleset server-side when present — the league must be
 * OPEN, the user must not already hold a member team (RAU-54), the race must
 * be in the ruleset's allowed races, the roster must respect its min/max
 * bounds, and the roster+coaching cost must fit its starting treasury and TV
 * cap (when set). The team's `startingTreasury` is stored so later hire/fire
 * balance math uses the ruleset base. Without `leagueId` the team is a
 * standalone pickup team under the rulebook defaults.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<Team> & { leagueId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.raceId) {
    return NextResponse.json({ error: "Team name and race are required" }, { status: 400 });
  }

  // RAU-56: resolve the league + ruleset before validating the roster.
  const rawLeagueId = typeof body.leagueId === "string" ? body.leagueId.trim() : "";
  const leagueId = rawLeagueId || null;
  let startingTreasury = STARTING_TREASURY;
  let minPlayers = MIN_PLAYERS;
  let maxPlayers = MAX_PLAYERS;
  let allowedRaces: string[] | null = null;
  let tvCap: number | null = null;

  if (leagueId) {
    const league = await prisma.league.findFirst({
      where: { id: leagueId },
      include: { ruleset: true },
    });
    if (!league) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Mirrors POST /api/leagues/[id]/teams: only an OPEN league takes members.
    if (league.status === "started" || league.status === "finished") {
      return NextResponse.json(
        { error: "A started league does not accept new teams" },
        { status: 409 },
      );
    }
    // One user = one team per league (RAU-54) — checked BEFORE creating so a
    // rejected second team never mutates anything.
    const existingMember = await prisma.team.findFirst({
      where: { leagueId, userId, archivedAt: null },
      select: { id: true },
    });
    if (existingMember) {
      return NextResponse.json(
        { error: "Ya tienes un equipo en esta liga" },
        { status: 409 },
      );
    }
    if (league.ruleset) {
      allowedRaces = Array.isArray(league.ruleset.races)
        ? league.ruleset.races.map((entry) => String(entry))
        : null;
      startingTreasury = league.ruleset.startingTreasury;
      minPlayers = league.ruleset.minPlayers;
      maxPlayers = league.ruleset.maxPlayers;
      tvCap = league.ruleset.tvCap;
    }
  }

  const race = getRaceById(body.raceId);
  if (!race) {
    return NextResponse.json({ error: "Unknown race" }, { status: 400 });
  }
  if (allowedRaces && !allowedRaces.includes(body.raceId)) {
    return NextResponse.json(
      { error: "This race is not allowed by the league ruleset" },
      { status: 400 },
    );
  }

  // Server-side roster bounds: the league ruleset's min/max when the team joins
  // a ruleset league; the BB2025 global bounds otherwise. A direct POST must
  // never create an out-of-bounds team.
  const roster = Array.isArray(body.roster) ? body.roster : [];
  if (roster.length < minPlayers || roster.length > maxPlayers) {
    return NextResponse.json(
      { error: `A team needs between ${minPlayers} and ${maxPlayers} players` },
      { status: 400 },
    );
  }

  // Budget + TV cap against the (ruleset or default) starting treasury.
  const coaching = isCoachingStaff(body.coaching) ? body.coaching : DEFAULT_COACHING;
  const totalCost =
    computeRosterCostFromPlayers(race, roster) + computeCoachingCost(race, coaching);
  if (totalCost > startingTreasury) {
    return NextResponse.json(
      { error: "The team cost exceeds the starting treasury" },
      { status: 400 },
    );
  }
  if (tvCap !== null && totalCost > tvCap) {
    return NextResponse.json(
      { error: "The team cost exceeds the league TV cap" },
      { status: 400 },
    );
  }

  const team = await prisma.team.create({
    data: {
      userId,
      name: body.name,
      raceId: body.raceId,
      leagueId,
      roster: roster as object,
      coaching: coaching as object,
      startingTreasury,
    },
  });
  return NextResponse.json(team, { status: 201 });
}
