import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COACHING, isCoachingStaff, type PlayerEntry } from "@/features/teams/types";
import { getRaceById } from "@/features/teams/data/races";
import { randomPlayerName } from "@/features/teams/data/playerNames";
import { createId } from "@/features/teams/id";
import { MAX_PLAYERS, computeSpendableBalance } from "@/features/teams/roster";

/**
 * POST /api/teams/[teamId]/players
 * Hires a new positional onto the roster (RAU-11). Body `{ positionalKey: string }`.
 * Guards (all server-side, never client-only):
 * - 401 unauthenticated; 404 foreign/archived team (no existence leak);
 * - 400 unknown `positionalKey` or a race absent from the catalog;
 * - 409 positional already at its `max`;
 * - 409 roster already at the global cap (MAX_PLAYERS);
 * - 409 insufficient spendable balance — computed as
 *   `STARTING_TREASURY + team.treasury − current rosterCost − coachingCost`.
 *
 * Effect: appends a `PlayerEntry { id: createId(), name: randomPlayerName(...),
 * positionalKey }` to the roster JSON and persists it. The treasury is NOT
 * mutated: the balance formula drops automatically because the roster cost
 * grows with the new entry.
 */
export async function POST(
  req: Request,
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
    select: { id: true, raceId: true, roster: true, coaching: true, treasury: true, startingTreasury: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const positionalKey =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>).positionalKey
      : undefined;
  if (typeof positionalKey !== "string" || positionalKey.length === 0) {
    return NextResponse.json({ error: "positionalKey is required" }, { status: 400 });
  }

  const race = getRaceById(team.raceId);
  if (!race) {
    return NextResponse.json({ error: "Unknown race" }, { status: 400 });
  }
  const positional = race.positionals.find((p) => p.key === positionalKey);
  if (!positional) {
    return NextResponse.json({ error: "Unknown positional" }, { status: 400 });
  }

  const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
  const countForPositional = roster.filter((entry) => entry.positionalKey === positionalKey).length;
  if (countForPositional >= positional.max) {
    return NextResponse.json(
      { error: `The team already has its maximum of ${positional.max} ${positional.name}` },
      { status: 409 },
    );
  }
  if (roster.length >= MAX_PLAYERS) {
    return NextResponse.json(
      { error: `A team cannot exceed ${MAX_PLAYERS} players` },
      { status: 409 },
    );
  }

  const balance = computeSpendableBalance(
    {
      treasury: team.treasury,
      roster,
      coaching: isCoachingStaff(team.coaching) ? team.coaching : DEFAULT_COACHING,
    },
    race,
  );
  if (positional.cost > balance) {
    return NextResponse.json(
      { error: "Not enough treasury to hire this player" },
      { status: 409 },
    );
  }

  const entry: PlayerEntry = {
    id: createId(),
    name: randomPlayerName(race.id, new Set(roster.map((p) => p.name))),
    positionalKey,
  };
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { roster: [...roster, entry] as never },
  });

  return NextResponse.json({ roster: updated.roster, treasury: updated.treasury });
}
