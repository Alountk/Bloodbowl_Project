import { describe, expect, it, vi } from "vitest";
import {
  allFixturesPlayed,
  championFromStandings,
  computeStandings,
  maybeCloseLeague,
  type LeagueCloseTx,
  type StandingsFixture,
  type StandingsRow,
} from "./standings";

/** Builds a recorded fixture. `score` null keeps the fixture pending/ignored. */
function fx(
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number | null,
  awayScore: number | null,
): StandingsFixture {
  const winnerId =
    homeScore != null && awayScore != null
      ? homeScore === awayScore
        ? null
        : homeScore > awayScore
          ? homeTeamId
          : awayTeamId
      : null;
  return { homeTeamId, awayTeamId, homeScore, awayScore, winnerId };
}

function row(
  teamId: string,
  over: Partial<StandingsRow> = {},
): StandingsRow {
  return {
    teamId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    tdFor: 0,
    tdAgainst: 0,
    tdDiff: 0,
    ...over,
  };
}

describe("computeStandings — 3/1/0 scoring", () => {
  it("awards 3 points for a win and 0 for a loss, with full aggregates", () => {
    const rows = computeStandings([fx("t1", "t2", 2, 1)]);
    expect(rows[0]).toEqual(
      row("t1", { played: 1, wins: 1, losses: 0, points: 3, tdFor: 2, tdAgainst: 1, tdDiff: 1 }),
    );
    expect(rows[1]).toEqual(
      row("t2", { played: 1, wins: 0, losses: 1, points: 0, tdFor: 1, tdAgainst: 2, tdDiff: -1 }),
    );
  });

  it("awards 1 point to BOTH teams on a draw (draws count)", () => {
    const rows = computeStandings([fx("t1", "t2", 1, 1)]);
    expect(rows[0]).toEqual(row("t1", { played: 1, draws: 1, points: 1, tdFor: 1, tdAgainst: 1, tdDiff: 0 }));
    expect(rows[1]).toEqual(row("t2", { played: 1, draws: 1, points: 1, tdFor: 1, tdAgainst: 1, tdDiff: 0 }));
  });

  it("aggregates across a full season (3 teams round-robin)", () => {
    const rows = computeStandings([
      fx("t1", "t2", 2, 0),
      fx("t2", "t3", 1, 1),
      fx("t3", "t1", 0, 3),
    ]);
    const byId = new Map(rows.map((r) => [r.teamId, r]));
    expect(byId.get("t1")).toEqual(
      row("t1", { played: 2, wins: 2, points: 6, tdFor: 5, tdAgainst: 0, tdDiff: 5 }),
    );
    expect(byId.get("t2")).toEqual(
      row("t2", { played: 2, draws: 1, losses: 1, points: 1, tdFor: 1, tdAgainst: 3, tdDiff: -2 }),
    );
    expect(byId.get("t3")).toEqual(
      row("t3", { played: 2, draws: 1, losses: 1, points: 1, tdFor: 1, tdAgainst: 4, tdDiff: -3 }),
    );
  });

  it("ignores fixtures without both scores (winnerId-only does not count)", () => {
    const rows = computeStandings([
      fx("t1", "t2", null, null),
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, winnerId: "t1" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].played).toBe(1);
  });

  it("does not mutate the input fixtures", () => {
    const fixtures = [fx("t1", "t2", 2, 0)];
    const snapshot = JSON.stringify(fixtures);
    computeStandings(fixtures);
    expect(JSON.stringify(fixtures)).toBe(snapshot);
  });
});

describe("computeStandings — tiebreaker chain", () => {
  it("ranks higher points first", () => {
    const rows = computeStandings([
      fx("t1", "t3", 1, 0), // t1 win
      fx("t2", "t3", 2, 1), // t2 win
      fx("t1", "t2", 0, 1), // t2 win → t2 6pts, t1 3pts
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["t2", "t1", "t3"]);
    expect(rows[0].points).toBe(6);
  });

  it("breaks a points tie by TD difference (for − against)", () => {
    // Both 3 points; t1 has +2 (2-0), t2 has +1 (2-1).
    const rows = computeStandings([fx("t1", "t3", 2, 0), fx("t2", "t3", 2, 1)]);
    expect(rows[0].teamId).toBe("t1");
    expect(rows[0].tdDiff).toBe(2);
    expect(rows[1].teamId).toBe("t2");
    expect(rows[1].tdDiff).toBe(1);
  });

  it("breaks a points+tdDiff tie by TDs for", () => {
    // t1 wins vs t3 (2-1) and draws t4 (1-1) → 4pts, tdDiff +1, tdFor 3.
    // t2 wins vs t4 (1-0) and draws t3 (0-0) → 4pts, tdDiff +1, tdFor 1.
    // Points AND tdDiff tie; t1 ranks higher on TDs for.
    const rows = computeStandings([
      fx("t1", "t3", 2, 1),
      fx("t2", "t4", 1, 0),
      fx("t1", "t4", 1, 1),
      fx("t2", "t3", 0, 0),
    ]);
    const a = rows.find((r) => r.teamId === "t1")!;
    const b = rows.find((r) => r.teamId === "t2")!;
    expect(a.points).toBe(4);
    expect(b.points).toBe(4);
    expect(a.tdDiff).toBe(b.tdDiff);
    expect(a.tdFor).toBeGreaterThan(b.tdFor);
    expect(rows.map((r) => r.teamId)).toEqual(["t1", "t2", "t3", "t4"]);
  });
});

describe("computeStandings — head-to-head", () => {
  it("ranks the winner of the direct match higher when fully tied", () => {
    // t1 and t2 both end at 4pts / tdDiff 0 / tdFor 1 (each: a win, a loss and
    // a draw across their games); t1 beat t2 in the direct fixture, so the
    // head-to-head puts t1 first. t3 (3pts) and t4 (2pts) rank below.
    const rows = computeStandings([
      fx("t1", "t2", 1, 0), // direct: t1 wins
      fx("t1", "t3", 0, 1),
      fx("t2", "t3", 1, 0),
      fx("t1", "t4", 0, 0),
      fx("t2", "t4", 0, 0),
    ]);
    const a = rows.find((r) => r.teamId === "t1")!;
    const b = rows.find((r) => r.teamId === "t2")!;
    expect(a.points).toBe(4);
    expect(b.points).toBe(4);
    expect(a.tdDiff).toBe(0);
    expect(b.tdDiff).toBe(0);
    expect(a.tdFor).toBe(1);
    expect(b.tdFor).toBe(1);
    expect(rows.map((r) => r.teamId)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("keeps a drawn direct match adjacent (id order for a stable display)", () => {
    const rows = computeStandings([
      fx("t1", "t2", 1, 1),
      fx("t1", "t3", 1, 1),
      fx("t2", "t3", 1, 1),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["t1", "t2", "t3"]);
  });

  it("resolves a three-way primary tie from the direct mini-league (deterministic)", () => {
    // A>B, B>C, C>A cycle (each 2-0) plus one draw vs X each: all three end at
    // 4pts, tdDiff 0, tdFor 2 — a primary tie. The mini-league (direct matches
    // only) is itself a dead heat, so the id order breaks it deterministically.
    const rows = computeStandings([
      fx("A", "B", 2, 0),
      fx("B", "C", 2, 0),
      fx("C", "A", 2, 0),
      fx("A", "X", 0, 0),
      fx("B", "X", 0, 0),
      fx("C", "X", 0, 0),
    ]);
    const a = rows.find((r) => r.teamId === "A")!;
    const b = rows.find((r) => r.teamId === "B")!;
    const c = rows.find((r) => r.teamId === "C")!;
    expect(a.points).toBe(4);
    expect(b.points).toBe(4);
    expect(c.points).toBe(4);
    expect(a.tdDiff).toBe(0);
    expect(b.tdDiff).toBe(0);
    expect(c.tdDiff).toBe(0);
    expect(a.tdFor).toBe(2);
    expect(b.tdFor).toBe(2);
    expect(c.tdFor).toBe(2);
    expect(rows.slice(0, 3).map((r) => r.teamId)).toEqual(["A", "B", "C"]);
  });
});

describe("championFromStandings / allFixturesPlayed", () => {
  it("returns the first row's team id", () => {
    expect(
      championFromStandings([
        row("t1", { points: 6 }),
        row("t2", { points: 3 }),
      ]),
    ).toBe("t1");
  });

  it("returns null for a league with no results", () => {
    expect(championFromStandings([])).toBeNull();
  });

  it("allFixturesPlayed: true only when every fixture has both scores and at least one exists", () => {
    expect(allFixturesPlayed([])).toBe(false);
    expect(allFixturesPlayed([fx("t1", "t2", null, null)])).toBe(false);
    expect(allFixturesPlayed([fx("t1", "t2", 1, null)])).toBe(false);
    expect(allFixturesPlayed([fx("t1", "t2", 1, 0), fx("t3", "t4", 2, 2)])).toBe(true);
  });
});

describe("maybeCloseLeague — atomic league finish (RAU-40)", () => {
  function fakeTx(fixtures: StandingsFixture[], status: string) {
    const findUnique = vi.fn().mockResolvedValue({ status });
    const findMany = vi.fn().mockResolvedValue(fixtures);
    const update = vi.fn().mockResolvedValue({});
    const tx = { league: { findUnique, update }, fixture: { findMany } } as unknown as LeagueCloseTx;
    return { tx, findUnique, findMany, update };
  }

  it("flips a started league whose every fixture is played to finished with the champion", async () => {
    const fixtures = [fx("t1", "t2", 2, 1), fx("t3", "t4", 0, 0)];
    const { tx, update } = fakeTx(fixtures, "started");
    await maybeCloseLeague(tx, "l1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "finished", championTeamId: "t1" },
    });
  });

  it("is a no-op while any fixture is still unplayed", async () => {
    const fixtures = [fx("t1", "t2", 2, 1), fx("t3", "t4", null, null)];
    const { tx, update } = fakeTx(fixtures, "started");
    await maybeCloseLeague(tx, "l1");
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op when the league is already finished (idempotent)", async () => {
    const { tx, update } = fakeTx([fx("t1", "t2", 1, 0)], "finished");
    await maybeCloseLeague(tx, "l1");
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op for an open league", async () => {
    const { tx, update } = fakeTx([], "open");
    await maybeCloseLeague(tx, "l1");
    expect(update).not.toHaveBeenCalled();
  });

  it("is a no-op for a league with zero fixtures (nothing decides a season)", async () => {
    const { tx, update } = fakeTx([], "started");
    await maybeCloseLeague(tx, "l1");
    expect(update).not.toHaveBeenCalled();
  });

  it("resolves the champion through the tiebreaker chain (head-to-head wins)", async () => {
    // t1 and t2 fully tied but t1 won the direct match → t1 champion.
    const fixtures = [
      fx("t1", "t2", 2, 1),
      fx("t1", "t3", 1, 1),
      fx("t2", "t3", 2, 2),
    ];
    const { tx, update } = fakeTx(fixtures, "started");
    await maybeCloseLeague(tx, "l1");
    expect(update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "finished", championTeamId: "t1" },
    });
  });
});
