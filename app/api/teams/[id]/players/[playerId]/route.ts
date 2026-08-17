import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PlayerEntry } from "@/features/teams/types";

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

  const roster = Array.isArray(team.roster) ? (team.roster as PlayerEntry[]) : [];
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
