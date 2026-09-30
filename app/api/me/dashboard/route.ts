import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isReadyToImprove } from "@/lib/rules/improvements";
// Status comes from the helper SHARED with the league detail route
// (`app/api/leagues/[id]/route.ts`): reuse, never copy, so the two views
// of the same fixture can never disagree on pending/scheduled/played.
import { deriveFixtureStatus } from "@/app/api/leagues/[id]/route";
import type { FixtureStatus } from "@/features/leagues/api";

/** One fixture as the home dashboard renders it — narrow by design. */
export type DashboardFixture = {
  fixtureId: string;
  leagueId: string;
  leagueName: string;
  round: number;
  scheduledAt: string | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  viewerSide: "home" | "away";
  status: FixtureStatus;
  /** Active proposal authored by the RIVAL, awaiting the viewer's response. */
  pendingProposal: { id: string; date: string; createdAt: string } | null;
  live: { status: string; homeScore: number; awayScore: number; half: number; turnNumber: number } | null;
};

/** The single server-computed aggregate GET /api/me/dashboard returns. */
export type DashboardPayload = {
  proposals: DashboardFixture[];
  live: DashboardFixture[];
  resultsPending: DashboardFixture[];
  nextMatch: DashboardFixture | null;
  teams: { count: number; readyToImprove: number; squadPe: number };
};

/** The base query's raw row — only the fields the derivations read (no rosters). */
interface RawFixture {
  id: string;
  leagueId: string;
  round: number;
  scheduledAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
  league: { id: string; name: string };
  homeTeam: { id: string; name: string; userId: string };
  awayTeam: { id: string; name: string; userId: string };
  result: { id: string } | null;
  liveMatch: DashboardFixture["live"];
  proposals: { id: string; date: Date; createdAt: Date; userId: string }[];
}

/** Deterministic order: earliest date first (undated last), then fixture id. */
function byScheduleThenId(a: DashboardFixture, b: DashboardFixture): number {
  if (a.scheduledAt !== b.scheduledAt) {
    if (a.scheduledAt === null) return 1;
    if (b.scheduledAt === null) return -1;
    return a.scheduledAt < b.scheduledAt ? -1 : 1;
  }
  return a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0;
}

/** Projects one raw row into the payload shape (viewer-relative, ISO dates). */
function projectFixture(row: RawFixture, me: string): DashboardFixture {
  const proposal = row.proposals[0];
  const status = deriveFixtureStatus(row);
  return {
    fixtureId: row.id,
    leagueId: row.leagueId,
    leagueName: row.league.name,
    round: row.round,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    homeTeam: { id: row.homeTeam.id, name: row.homeTeam.name },
    awayTeam: { id: row.awayTeam.id, name: row.awayTeam.name },
    viewerSide: row.homeTeam.userId === me ? "home" : "away",
    status,
    // The query's `NOT: { userId }` already excludes my own proposals; the
    // explicit re-check states the rival-only invariant so it survives any
    // future relaxation of the where clause. `status !== "played"` is the other
    // half of "awaiting your response": the result routes never close a
    // ScheduleProposal, so a match played without accepting still carries an
    // ACTIVE rival row — and `accept` would answer 409. Surfacing it would hand
    // the dashboard a dead card (issue #305).
    pendingProposal:
      proposal && proposal.userId !== me && status !== "played"
        ? { id: proposal.id, date: proposal.date.toISOString(), createdAt: proposal.createdAt.toISOString() }
        : null,
    live: row.liveMatch,
  };
}

/**
 * GET /api/me/dashboard — one server-computed aggregate for the home page
 * (pending proposals, live fixtures, results I still owe, next dated fixture,
 * teams summary) so the client never fetches N league details. 401 without a
 * session; every read is scoped by the session id, so a foreign fixture is
 * never SELECTED — unreachable, with no 404/existence path.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Two reads in parallel (budget ≤ 4): the fixture base set and active squads.
  const fixtureRows: Promise<RawFixture[]> = prisma.fixture.findMany({
    where: {
      league: { status: "started" },
      OR: [{ homeTeam: { userId } }, { awayTeam: { userId } }],
    },
    select: {
      id: true,
      leagueId: true,
      round: true,
      scheduledAt: true,
      homeScore: true,
      awayScore: true,
      league: { select: { id: true, name: true } },
      homeTeam: { select: { id: true, name: true, userId: true } },
      awayTeam: { select: { id: true, name: true, userId: true } },
      result: { select: { id: true } },
      liveMatch: { select: { status: true, homeScore: true, awayScore: true, half: true, turnNumber: true } },
      // Exactly one ACTIVE rival-authored proposal per fixture — never the history.
      proposals: {
        where: { acceptedAt: null, closedAt: null, NOT: { userId } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, date: true, createdAt: true, userId: true },
      },
    },
  });
  // Dashboard shows ACTIVE squads only (career stats are the lifetime view).
  const squadRows = prisma.team.findMany({
    where: { userId, archivedAt: null },
    select: { id: true, players: { select: { pe: true, alive: true, improvements: true } } },
  });
  const [rows, teamRows] = await Promise.all([fixtureRows, squadRows]);

  const entries = rows.map((row) => ({ row, fixture: projectFixture(row, userId) }));

  const proposals = entries
    .filter((e) => e.fixture.pendingProposal !== null)
    .map((e) => e.fixture)
    .sort(byScheduleThenId);

  const live = entries
    .filter((e) => e.fixture.live?.status === "live")
    .map((e) => e.fixture)
    .sort(byScheduleThenId);

  // Still owed when a scheduled fixture never went live, or when a finished
  // live row has no persisted MatchResult yet (result entry pending).
  const resultsPending = entries
    .filter(
      (e) =>
        (e.fixture.status === "scheduled" && e.fixture.live?.status !== "live") ||
        (e.fixture.live?.status === "finished" && e.row.result == null),
    )
    .map((e) => e.fixture)
    .sort(byScheduleThenId);

  const nextMatch =
    entries
      .filter((e) => e.fixture.status !== "played" && e.fixture.scheduledAt !== null)
      .map((e) => e.fixture)
      .sort(byScheduleThenId)[0] ?? null;

  let squadPe = 0;
  let readyToImprove = 0;
  for (const team of teamRows) {
    for (const player of team.players) {
      squadPe += player.pe;
      if (
        isReadyToImprove({
          pe: player.pe,
          alive: player.alive,
          // `Player.improvements` stores the acquisition HISTORY (Json[]); the
          // rule takes the COUNT — same conversion as the progression route.
          improvements: Array.isArray(player.improvements) ? player.improvements.length : 0,
        })
      ) {
        readyToImprove += 1;
      }
    }
  }

  const payload: DashboardPayload = {
    proposals,
    live,
    resultsPending,
    nextMatch,
    teams: { count: teamRows.length, readyToImprove, squadPe },
  };
  return NextResponse.json(payload);
}
