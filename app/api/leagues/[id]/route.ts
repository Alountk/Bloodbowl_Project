import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { FixtureStatus } from "@/features/leagues/api";

/** The scheduling/result fields a fixture derives its lifecycle status from. */
export interface FixtureStatusInput {
  scheduledAt?: Date | string | null;
  winnerId?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  result?: unknown;
}

/**
 * Pure: derives a fixture's lifecycle status from its scheduling and result
 * fields.
 *
 * A fixture is `played` when a result has been recorded — scored via the result
 * route or a walkover (both write home/away scores) or when a persisted result
 * record is present. `scheduledAt` alone only schedules; `winnerId` alone is
 * display-only and no longer marks a match played (winnerId is derived from the
 * scores when a result loads). League-season delta: `played ⇔ scores present ∥
 * result present`.
 */
export function deriveFixtureStatus(fixture: FixtureStatusInput): FixtureStatus {
  if (fixture.homeScore != null || fixture.awayScore != null) return "played";
  // Forward-compat: a persisted result record marks the match played even if a
  // legacy row has no raw score on the fixture (result route always writes both).
  if (fixture.result) return "played";
  if (fixture.scheduledAt) return "scheduled";
  return "pending";
}

/** Pure: owner display name falls back to the email when no name is set. */
function ownerNameOf(user?: {
  name?: string | null;
  email?: string | null;
} | null): string | null {
  if (!user) return null;
  return user?.name ?? user?.email ?? null;
}

/** A raw Prisma fixture with the nested data the detail GET needs to enrich. */
interface FixtureWithMatchday {
  id: string;
  leagueId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  createdAt: Date | string;
  scheduledAt: Date | string | null;
  winnerId: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  result?: unknown;
  homeTeam?: { user?: { id: string; name: string | null; email: string | null; avatar?: string | null } | null } | null;
  awayTeam?: { user?: { id: string; name: string | null; email: string | null; avatar?: string | null } | null } | null;
  proposals?: unknown[];
  [key: string]: unknown;
}

/** Owner shape embedded on an enriched fixture. `avatar` is optional so a
 * user row without one (or an unresolvable nested user) enriches cleanly to an
 * owner with no avatar — MatchCard then shows nothing beside the name. */
export interface FixtureOwnerRef {
  id: string;
  name: string | null;
  avatar?: string | null;
}

/**
 * Pure: enriches a raw Prisma fixture (with nested homeTeam/awayTeam user and
 * proposals) into the shape the client expects — derived status, resolved
 * owner names, and its proposal history. Defensive: anything missing becomes
 * null/empty so plain fixture rows (no nested data) still enrich cleanly.
 */
export function enrichFixture(fixture: FixtureWithMatchday): FixtureWithMatchday & {
  status: FixtureStatus;
  homeOwner: FixtureOwnerRef | null;
  awayOwner: FixtureOwnerRef | null;
  proposals: unknown[];
} {
  const homeUser = fixture.homeTeam?.user ?? null;
  const awayUser = fixture.awayTeam?.user ?? null;
  return {
    ...fixture,
    status: deriveFixtureStatus(fixture),
    homeOwner: homeUser
      ? { id: homeUser.id, name: ownerNameOf(homeUser), avatar: homeUser.avatar ?? null }
      : null,
    awayOwner: awayUser
      ? { id: awayUser.id, name: ownerNameOf(awayUser), avatar: awayUser.avatar ?? null }
      : null,
    proposals: Array.isArray(fixture.proposals) ? fixture.proposals : [],
  };
}

/**
 * Pure: groups fixtures by round and computes each round's `complete` flag.
 * A round is complete only when EVERY fixture in it derives `played` (has a
 * recorded result — scores present or a result record). winnerId alone never
 * completes a round (league-season delta).
 */
export function buildRoundsWithCompletion(
  fixtures: (FixtureStatusInput & { id: string; round: number })[],
): { round: number; fixtures: string[]; complete: boolean }[] {
  const grouped = new Map<number, typeof fixtures>();
  for (const fixture of fixtures) {
    const list = grouped.get(fixture.round) ?? [];
    list.push(fixture);
    grouped.set(fixture.round, list);
  }
  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => ({
      round,
      fixtures: list.map((f) => f.id),
      complete: list.every((f) => deriveFixtureStatus(f) === "played"),
    }));
}

/**
 * GET /api/leagues/[id]
 * Returns a league together with its non-archived member teams, the owner's
 * name, and (when started) the season fixtures grouped by round (each fixture
 * carries its jornada `round` with labeled home/away teams).
 *
 * Visibility: an OPEN league is readable by any authenticated user; a STARTED
 * league is readable only by its owner or a current member. A foreign non-
 * member requesting a started league gets 404 (no existence/status leak), and
 * a nonexistent id returns 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findFirst({
    where: { id },
    include: {
      owner: { select: { id: true, email: true, name: true } },
      teams: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Started league: owner-only or member-only to shield fixture data.
  if (league.status === "started") {
    const isMember = league.teams.some((team) => team.userId === userId);
    if (league.ownerId !== userId && !isMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const fixtures =
    league.status === "started"
      ? await prisma.fixture.findMany({
          where: { leagueId: id },
          orderBy: [{ round: "asc" }, { createdAt: "asc" }],
          include: {
            homeTeam: { select: { id: true, user: { select: { id: true, name: true, email: true, avatar: true } } } },
            awayTeam: { select: { id: true, user: { select: { id: true, name: true, email: true, avatar: true } } } },
            proposals: { orderBy: { createdAt: "desc" } },
          },
        })
      : [];

  const { owner, ...rest } = league;
  return NextResponse.json({
    ...rest,
    status: rest.status,
    ownerName: owner?.name ?? owner?.email ?? null,
    fixtures: fixtures.map((fixture) => enrichFixture(fixture as FixtureWithMatchday)),
    rounds: buildRoundsWithCompletion(fixtures as never),
  });
}

/**
 * DELETE /api/leagues/[id]
 * Deletes an OPEN league owned by the session user, clearing each member
 * team's `leagueId` (SetNull) BEFORE the league row is removed so teams
 * survive. A STARTED league is immutable: DELETE returns 409 and performs no
 * mutation (teams and fixtures remain). A foreign league id returns 404.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const league = await prisma.league.findFirst({ where: { id, ownerId } });
  if (!league) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (league.status === "started") {
    return NextResponse.json(
      { error: "A started league cannot be deleted" },
      { status: 409 },
    );
  }

  // Clear membership before deleting the league so member teams survive.
  await prisma.team.updateMany({
    where: { leagueId: id },
    data: { leagueId: null },
  });
  await prisma.league.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
