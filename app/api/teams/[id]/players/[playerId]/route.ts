import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PlayerEntry } from "@/features/teams/types";
import { getRaceById } from "@/features/teams/data/races";
import { MIN_PLAYERS } from "@/features/teams/roster";

const MAX_NAME_LENGTH = 50;

/**
 * PATCH /api/teams/[teamId]/players/[playerId]
 * Renames a roster player (owned team only; 404 for a foreign/archived team, no
 * existence leak; 401 unauthenticated). `[playerId]` is the roster player's
 * `rosterPlayerId`, resolved against the unique `(teamId, rosterPlayerId)` key.
 * The trimmed name must be non-empty and at most 50 characters (400 otherwise).
 *
 * The roster JSON is the identity source of truth for the team view
 * (`lib/players.ts`), while the `Player.name` row feeds the match views; both
 * are kept in sync inside one transaction so a rename is visible everywhere.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const { id: teamId, playerId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true, roster: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const player = await prisma.player.findUnique({
    where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
    select: { id: true },
  });
  if (!player) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).name : undefined;
  if (typeof name !== "string") {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: "Name must be between 1 and 50 characters" },
      { status: 400 },
    );
  }

  const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
  const nextRoster = roster.map((entry) =>
    entry.id === playerId ? { ...entry, name: trimmed } : entry,
  );

  await prisma.$transaction([
    prisma.player.update({
      where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
      data: { name: trimmed },
    }),
    prisma.team.update({
      where: { id: teamId },
      data: { roster: nextRoster as never },
    }),
  ]);

  return NextResponse.json({ name: trimmed });
}

/**
 * DELETE /api/teams/[teamId]/players/[playerId]
 * Fires/retires a roster player (RAU-10). BB2025 rule: firing gives NO refund —
 * the positional's catalog cost is lost, so the spendable balance
 * (`STARTING_TREASURY + treasury − roster − coaching`) must stay FLAT. This is
 * achieved by decrementing `Team.treasury` by that cost in the SAME
 * transaction as the roster removal.
 *
 * Guards: 401 unauthenticated; 404 foreign/archived team (no existence leak);
 * 409 when the `rosterPlayerId` is not on the roster; 409 when firing would
 * drop the roster below the BB2025 minimum (MIN_PLAYERS). Effect in ONE
 * transaction: the entry is removed from the roster JSON, the treasury is
 * decremented by the positional's cost, and the `Player` row for that
 * `rosterPlayerId` is deleted (cascading any `PlayerPendingRoll`).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const { id: teamId, playerId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true, raceId: true, roster: true, treasury: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
  const entry = roster.find((candidate) => candidate.id === playerId);
  if (!entry) {
    return NextResponse.json(
      { error: "This player is not on the team's roster" },
      { status: 409 },
    );
  }
  if (roster.length - 1 < MIN_PLAYERS) {
    return NextResponse.json(
      { error: `A team cannot drop below ${MIN_PLAYERS} players` },
      { status: 409 },
    );
  }

  const race = getRaceById(team.raceId);
  const cost = race?.positionals.find((p) => p.key === entry.positionalKey)?.cost ?? 0;
  const nextRoster = roster.filter((candidate) => candidate.id !== playerId);

  const updated = await prisma.$transaction(async (tx) => {
    const teamRow = await tx.team.update({
      where: { id: teamId },
      data: { roster: nextRoster as never, treasury: { decrement: cost } },
    });
    // deleteMany (not delete) because a fresh hire has no Player row until the
    // next result backfills it via ensurePlayersForTeam. PendingRolls cascade.
    await tx.player.deleteMany({
      where: { teamId, rosterPlayerId: playerId },
    });
    return teamRow;
  });

  return NextResponse.json({ roster: updated.roster, treasury: updated.treasury });
}
