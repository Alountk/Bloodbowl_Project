import { describe, expect, it, vi } from "vitest";
import {
  nominateMvpLiveMatch,
  resolveLiveMatch,
  rollLiveMvp,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatch, LiveEvent, Prisma } from "@prisma/client";

/**
 * RAU-49 store tests: `resolveLiveMatch` — the ONE-transaction closure of a
 * finished live match (MVP 1D6 roll, PE awards from the live events, treasury
 * winnings, post-match FF snapshot, the `MatchResult` row, the idempotent
 * fixture close and `maybeCloseLeague`), its guards (not-finished /
 * already-resolved / invalid MVP nominations), and the concede path (fixture
 * already closed → awards + report still write). `rollLiveMvp` covers the
 * read-only preview roll. The fake tx mirrors the liveStore.test.ts harness.
 */

/** Returns successive values in call order (each call consumes the next roll). */
function fixedRolls(rolls: number[]): () => number {
  let i = 0;
  return () => rolls[i++];
}

interface ResolveDeps {
  deps: StoreDeps;
  liveMatchFindFirst: ReturnType<typeof vi.fn>;
  matchResultFindUnique: ReturnType<typeof vi.fn>;
  matchResultCreate: ReturnType<typeof vi.fn>;
  fixtureFindUnique: ReturnType<typeof vi.fn>;
  fixtureUpdate: ReturnType<typeof vi.fn>;
  fixtureFindMany: ReturnType<typeof vi.fn>;
  teamFindMany: ReturnType<typeof vi.fn>;
  teamUpdateMany: ReturnType<typeof vi.fn>;
  liveEventAggregate: ReturnType<typeof vi.fn>;
  liveEventCreateMany: ReturnType<typeof vi.fn>;
  liveMatchUpdateMany: ReturnType<typeof vi.fn>;
  playerFindMany: ReturnType<typeof vi.fn>;
  playerUpdateMany: ReturnType<typeof vi.fn>;
  leagueFindUnique: ReturnType<typeof vi.fn>;
  leagueUpdate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

const homeRoster = ["h1", "h2", "h3", "h4", "h5", "h6"].map((id, i) => ({
  id,
  name: `Home ${i + 1}`,
  positionalKey: "lineman",
}));
const awayRoster = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) => ({
  id,
  name: `Away ${i + 1}`,
  positionalKey: "lineman",
}));

const coaching = { rerolls: 2, dedicatedFans: 2, assistantCoaches: 0, cheerleaders: 0, apothecary: false };

function teamRow(side: "home" | "away") {
  const ids = side === "home" ? homeRoster.map((p) => p.id) : awayRoster.map((p) => p.id);
  return {
    id: `${side}-t`,
    raceId: "human",
    roster: side === "home" ? homeRoster : awayRoster,
    coaching: side === "home" ? coaching : { ...coaching, dedicatedFans: 1 },
    players: ids.map((rosterPlayerId) => ({
      rosterPlayerId,
      valueBonus: 0,
      alive: true,
      missNextMatch: false,
    })),
  };
}

/** The finished LiveMatch row (normal end: fixture NOT closed, score 1-0). */
function finishedRow(overrides: Partial<LiveMatch> = {}): LiveMatch & { events: LiveEvent[] } {
  return {
    id: "lm-1",
    fixtureId: "f-1",
    status: "finished",
    half: 2,
    turnNumber: 8,
    activeSide: "home",
    homeClock: 240,
    awayClock: 240,
    homeScore: 1,
    awayScore: 0,
    homeConsented: true,
    awayConsented: true,
    startedAt: new Date(0),
    homeTurnMs: 0,
    awayTurnMs: 0,
    seq: 12,
    paused: false,
    clockStartedAt: null,
    finishedAt: new Date(5000),
    concedeProposedBy: null,
    pendingCasualty: null,
    winnings: { home: 55000, away: 45000 },
    pendingResolution: null,
    // RAU-51: the default finished row carries BOTH sides' nominations so the
    // resolve/roll tests exercise the roll path; the both-sides guard tests
    // override one side to null.
    mvpNominations: {
      home: ["h1", "h2", "h3", "h4", "h5", "h6"],
      away: ["a1", "a2", "a3", "a4", "a5", "a6"],
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    events: [
      { id: "e1", liveMatchId: "lm-1", seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, createdAt: new Date(0) },
      { id: "e2", liveMatchId: "lm-1", seq: 2, kind: "td", side: "home", playerRosterId: "h1", half: 1, turnNumber: 3, payload: {}, createdAt: new Date(1000) },
      { id: "e3", liveMatchId: "lm-1", seq: 3, kind: "completion", side: "home", playerRosterId: "h2", half: 1, turnNumber: 4, payload: { spp: 1 }, createdAt: new Date(2000) },
      { id: "e4", liveMatchId: "lm-1", seq: 4, kind: "casualty", side: "home", playerRosterId: "h3", half: 1, turnNumber: 5, payload: { victimRosterId: "h3", causerRosterId: "a1", band: "apaleado" }, createdAt: new Date(3000) },
      { id: "e5", liveMatchId: "lm-1", seq: 5, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, createdAt: new Date(4000) },
    ],
    ...overrides,
  };
}

const homeNom = ["h1", "h2", "h3", "h4", "h5", "h6"];
const awayNom = ["a1", "a2", "a3", "a4", "a5", "a6"];

function makeResolveDeps(opts: {
  row?: LiveMatch & { events: LiveEvent[] };
  matchResult?: { id: string } | null;
  fixture?: { homeScore: number | null; awayScore: number | null; winnerId: string | null } | null;
  leagueStatus?: "open" | "started" | "finished";
  playerRows?: { teamId: string; rosterPlayerId: string; injuries: Prisma.JsonValue | null; alive: boolean }[];
  rolls?: { d3?: number[]; d6?: number[] };
} = {}): ResolveDeps {
  const {
    row = finishedRow(),
    matchResult = null,
    fixture = { homeScore: null, awayScore: null, winnerId: null },
    leagueStatus = "started",
    playerRows = [
      { teamId: "home-t", rosterPlayerId: "h3", injuries: [], alive: true },
      { teamId: "away-t", rosterPlayerId: "a1", injuries: [], alive: true },
    ],
    rolls = {},
  } = opts;

  const liveMatchFindFirst = vi.fn().mockResolvedValue(row);
  const matchResultFindUnique = vi.fn().mockResolvedValue(matchResult);
  const matchResultCreate = vi.fn().mockResolvedValue({ id: "mr-1" });
  const fixtureFindUnique = vi.fn().mockResolvedValue({
    homeTeamId: "home-t",
    awayTeamId: "away-t",
    homeScore: fixture?.homeScore ?? null,
    awayScore: fixture?.awayScore ?? null,
    winnerId: fixture?.winnerId ?? null,
  });
  const fixtureUpdate = vi.fn().mockResolvedValue({ id: "f-1" });
  const fixtureFindMany = vi.fn().mockResolvedValue([
    { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: 1, awayScore: 0, winnerId: "home-t" },
  ]);
  const teamFindMany = vi.fn().mockResolvedValue([teamRow("home"), teamRow("away")]);
  const teamUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const liveEventAggregate = vi.fn().mockResolvedValue({ _max: { seq: 5 } });
  const liveEventCreateMany = vi.fn().mockResolvedValue({ count: 2 });
  const liveMatchUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const playerFindMany = vi.fn().mockResolvedValue(playerRows);
  const playerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const leagueFindUnique = vi.fn().mockResolvedValue({ status: leagueStatus });
  const leagueUpdate = vi.fn().mockResolvedValue({});
  const publish = vi.fn();

  const tx = {
    liveMatch: { updateMany: liveMatchUpdateMany, create: vi.fn(), findUnique: vi.fn().mockResolvedValue({ winnings: null }) },
    liveEvent: { create: vi.fn(), aggregate: liveEventAggregate, createMany: liveEventCreateMany },
    team: { updateMany: teamUpdateMany, findMany: teamFindMany },
    matchResult: { findUnique: matchResultFindUnique, create: matchResultCreate },
    player: { findMany: playerFindMany, updateMany: playerUpdateMany },
    fixture: { update: fixtureUpdate, findMany: fixtureFindMany, findUnique: fixtureFindUnique },
    league: { findUnique: leagueFindUnique, update: leagueUpdate },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const deps: StoreDeps = {
    prisma: {
      $transaction,
      liveMatch: { create: vi.fn(), findFirst: liveMatchFindFirst },
    },
    hub: { publish },
    ...(rolls.d3 ? { rollD3: fixedRolls(rolls.d3) } : {}),
    ...(rolls.d6 ? { rollD6: fixedRolls(rolls.d6) } : {}),
  };

  return {
    deps,
    liveMatchFindFirst,
    matchResultFindUnique,
    matchResultCreate,
    fixtureFindUnique,
    fixtureUpdate,
    fixtureFindMany,
    teamFindMany,
    teamUpdateMany,
    liveEventAggregate,
    liveEventCreateMany,
    liveMatchUpdateMany,
    playerFindMany,
    playerUpdateMany,
    leagueFindUnique,
    leagueUpdate,
    publish,
  };
}

const resolveInput = {
  fixtureId: "f-1",
  leagueId: "l-1",
  homeTeamId: "home-t",
  awayTeamId: "away-t",
  loadedBy: "user-1",
  now: 6000,
};

describe("resolveLiveMatch", () => {
  it("RAU-12: clears both teams' served suspensions then flags the lasting-band casualty victims", async () => {
    const { deps, playerUpdateMany } = makeResolveDeps({
      rolls: { d3: [1, 2], d6: [3, 4, 5, 6] },
      // h3 carries a PREVIOUS lasting injury (band apaleado in the events) and
      // an already-flag from the match before — the resolution serves it.
      playerRows: [
        { teamId: "home-t", rosterPlayerId: "h3", injuries: [{ kind: "apaleado" }], alive: true },
        { teamId: "away-t", rosterPlayerId: "a1", injuries: [], alive: true },
      ],
    });

    await resolveLiveMatch(resolveInput, deps);

    const calls = playerUpdateMany.mock.calls.map((c) => c[0]);
    // Clear FIRST: every player of both teams becomes available again.
    expect(
      calls.some(
        (c) =>
          c.data.missNextMatch === false &&
          c.data.injuries === undefined &&
          JSON.stringify(c.where.teamId) === JSON.stringify({ in: ["home-t", "away-t"] }),
      ),
    ).toBe(true);
    // Set AFTER the clear: h3 (the apaleado victim of THIS match) is flagged
    // unavailable for the NEXT match.
    const h3 = calls.find(
      (c) => c.where.rosterPlayerId === "h3" && c.data.injuries !== undefined,
    );
    expect(h3?.data).toEqual(expect.objectContaining({ missNextMatch: true, alive: true }));
    const clearIndex = calls.findIndex(
      (c) => c.data.missNextMatch === false && c.data.injuries === undefined,
    );
    const setIndex = calls.indexOf(h3!);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeLessThan(setIndex);
  });

  it("resolves a normally-finished live match: MVP roll, PE, treasury, FF, closure, MatchResult, league close", async () => {
    // Rolls (call order): preFF home 1D3=1, preFF away 1D3=2, postFF home 1D6=3,
    // postFF away 1D6=4, MVP home 1D6=5, MVP away 1D6=6.
    const { deps, matchResultCreate, fixtureUpdate, leagueUpdate, leagueFindUnique, teamUpdateMany, playerUpdateMany, playerFindMany, liveEventCreateMany, liveEventAggregate } =
      makeResolveDeps({ rolls: { d3: [1, 2], d6: [3, 4, 5, 6] } });

    const outcome = await resolveLiveMatch(resolveInput, deps);

    // home FF = 1 + 2 = 3; away FF = 2 + 1 = 3. Home wins 1-0:
    // postFF home = roll6 3 >= 3 → 4; postFF away = loss, 4 < 3? no → 3.
    // MVP: home nom[4] = h5, away nom[5] = a6.
    expect(outcome).toEqual({
      fixtureId: "f-1",
      status: "played",
      homeScore: 1,
      awayScore: 0,
      winnerId: "home-t",
      winnings: { home: 55000, away: 45000 },
      postFf: { home: 4, away: 3 },
      mvp: { home: "h5", away: "a6" },
      resultId: "mr-1",
    });

    // The mvp events append + seq bump (LM-mvp parity), mirroring the result route.
    expect(liveEventAggregate).toHaveBeenCalledWith({
      where: { liveMatchId: "lm-1" },
      _max: { seq: true },
    });
    expect(liveEventCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ kind: "mvp", side: "home", playerRosterId: "h5", seq: 6 }),
          expect.objectContaining({ kind: "mvp", side: "away", playerRosterId: "a6", seq: 7 }),
        ],
      }),
    );

    // The fixture closes (normal finish: not yet closed).
    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { homeScore: 1, awayScore: 0, winnerId: "home-t" },
    });
    // The resolve IS the closure — the last fixture closes the league.
    expect(leagueFindUnique).toHaveBeenCalled();
    expect(leagueUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l-1" },
        data: expect.objectContaining({ status: "finished", championTeamId: "home-t" }),
      }),
    );

    // The MatchResult snapshot mirrors the result-route shape.
    expect(matchResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fixtureId: "f-1",
          loadedBy: "user-1",
          scores: {
            home: {
              score: 1,
              postFf: 4,
              winnings: 55000,
              casualties: [{ team: "home", rosterPlayerId: "h3", outcome: { kind: "apaleado" } }],
              pe: [
                { rosterPlayerId: "h1", pe: 3 },
                { rosterPlayerId: "h2", pe: 1 },
                { rosterPlayerId: "h5", pe: 4 },
              ],
            },
            away: {
              score: 0,
              postFf: 3,
              winnings: 45000,
              casualties: [],
              pe: [
                { rosterPlayerId: "a1", pe: 2 },
                { rosterPlayerId: "a6", pe: 4 },
              ],
            },
            winnerId: "home-t",
            mvp: { home: "h5", away: "a6" },
          },
        }),
      }),
    );

    // Treasury: the finish-time winnings are applied, never recomputed.
    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: { id: "home-t" },
      data: { treasury: { increment: 55000 } },
    });
    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: { id: "away-t" },
      data: { treasury: { increment: 45000 } },
    });

    // PE awards + casualty injury on the lazy Player rows.
    for (const [teamId, rosterPlayerId, pe] of [
      ["home-t", "h1", 3],
      ["home-t", "h2", 1],
      ["home-t", "h5", 4],
      ["away-t", "a1", 2],
      ["away-t", "a6", 4],
    ] as const) {
      expect(playerUpdateMany).toHaveBeenCalledWith({
        where: { teamId, rosterPlayerId },
        data: { pe: { increment: pe } },
      });
    }
    expect(playerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: expect.any(Array) },
      }),
    );
  });

  it("reuses the persisted pendingResolution (RAU-49 fix): committed MVP + FF EQUAL the previewed values, no re-roll", async () => {
    // The modal previewed h5/a6 + FF 4/3. The injected rolls would produce a
    // DIFFERENT fresh result (h1/a1 + FF 3/2), proving the commit does NOT roll.
    const { deps, matchResultCreate, liveEventCreateMany, playerUpdateMany } = makeResolveDeps({
      row: finishedRow({
        pendingResolution: { mvp: { home: "h5", away: "a6" }, postFf: { home: 4, away: 3 } },
      }),
      rolls: { d3: [1, 1], d6: [1, 1, 1, 1] },
    });

    const outcome = await resolveLiveMatch(resolveInput, deps);

    // The reported awards are the previewed ones — never a second roll.
    expect(outcome.mvp).toEqual({ home: "h5", away: "a6" });
    expect(outcome.postFf).toEqual({ home: 4, away: 3 });

    // The appended mvp events carry the previewed grantees (LM-mvp parity).
    expect(liveEventCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ kind: "mvp", side: "home", playerRosterId: "h5" }),
          expect.objectContaining({ kind: "mvp", side: "away", playerRosterId: "a6" }),
        ],
      }),
    );

    // The MatchResult snapshot's FF + MVP equal the previewed values.
    expect(matchResultCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scores: {
            home: { score: 1, postFf: 4, winnings: 55000, casualties: expect.any(Array), pe: expect.arrayContaining([{ rosterPlayerId: "h5", pe: 4 }]) },
            away: { score: 0, postFf: 3, winnings: 45000, casualties: [], pe: expect.arrayContaining([{ rosterPlayerId: "a6", pe: 4 }]) },
            winnerId: "home-t",
            mvp: { home: "h5", away: "a6" },
          },
        }),
      }),
    );

    // The +4 PE award lands on the previewed grantee.
    expect(playerUpdateMany).toHaveBeenCalledWith({
      where: { teamId: "home-t", rosterPlayerId: "h5" },
      data: { pe: { increment: 4 } },
    });
    expect(playerUpdateMany).toHaveBeenCalledWith({
      where: { teamId: "away-t", rosterPlayerId: "a6" },
      data: { pe: { increment: 4 } },
    });
  });

  it("rejects with 409 when the live row is not finished", async () => {
    const { deps } = makeResolveDeps({ row: finishedRow({ status: "live" as const }) });
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 409 when a MatchResult already exists (already resolved)", async () => {
    const { deps } = makeResolveDeps({ matchResult: { id: "mr-x" } });
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 400 when a team nominated fewer than six distinct players", async () => {
    const { deps } = makeResolveDeps({
      row: finishedRow({ mvpNominations: { home: ["h1"], away: awayNom } }),
    });
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 when a nomination is not in that team's roster", async () => {
    const { deps } = makeResolveDeps({
      row: finishedRow({
        mvpNominations: { home: ["h1", "h2", "h3", "h4", "h5", "x9"], away: awayNom },
      }),
    });
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 409 when a side has not nominated yet (RAU-51 both-sides gate)", async () => {
    const { deps } = makeResolveDeps({
      row: finishedRow({ mvpNominations: { home: homeNom, away: null } }),
    });
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 404 when no live row exists for the fixture", async () => {
    const { deps, liveMatchFindFirst } = makeResolveDeps();
    liveMatchFindFirst.mockResolvedValue(null);
    await expect(resolveLiveMatch(resolveInput, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("CONCEDE path: fixture already closed → skips the fixture-close but still writes awards + MatchResult", async () => {
    // The concede walkover already set winner + 2-0 scores at accept time; the
    // live state scoreboard stays 0-0, so the resolve uses the FIXTURE scores.
    const { deps, fixtureUpdate, matchResultCreate, teamUpdateMany } = makeResolveDeps({
      fixture: { homeScore: 2, awayScore: 0, winnerId: "home-t" },
      row: finishedRow({ homeScore: 0, awayScore: 0 }),
      rolls: { d3: [1, 2], d6: [1, 2, 3, 4] },
    });

    const outcome = await resolveLiveMatch(resolveInput, deps);

    expect(fixtureUpdate).not.toHaveBeenCalled();
    expect(outcome.homeScore).toBe(2);
    expect(outcome.awayScore).toBe(0);
    expect(outcome.winnerId).toBe("home-t");
    // The awards + report still write (the concede fixture has no MatchResult).
    expect(matchResultCreate).toHaveBeenCalled();
    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: { id: "home-t" },
      data: { treasury: { increment: 55000 } },
    });
  });

  it("keeps the league OPEN when fixtures remain (maybeCloseLeague no-op)", async () => {
    const { deps, fixtureFindMany, leagueUpdate } = makeResolveDeps({
      rolls: { d3: [1, 2], d6: [3, 4, 5, 6] },
    });
    fixtureFindMany.mockResolvedValue([
      { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: null, awayScore: null, winnerId: null },
    ]);
    await resolveLiveMatch(resolveInput, deps);
    expect(leagueUpdate).not.toHaveBeenCalled();
  });
});

describe("rollLiveMvp", () => {
  it("returns the server-rolled MVP grantees + post-match FF over the PERSISTED per-side nominations (RAU-51) and PERSISTS them as pendingResolution (same tx)", async () => {
    const { deps, liveMatchUpdateMany, matchResultCreate, fixtureUpdate, teamUpdateMany } =
      makeResolveDeps({
        rolls: { d3: [1, 2], d6: [3, 4, 5, 6] },
      });
    const roll = await rollLiveMvp(
      { fixtureId: "f-1", homeTeamId: "home-t", awayTeamId: "away-t", now: 6000 },
      deps,
    );
    // rollLiveMvp rolls MVP FIRST (1D6=3 → home nom[2] = h3, 1D6=4 → away
    // nom[3] = a4), then the post-FF 1D6 (5/6): home FF 3 win → 4, away FF 3
    // loss, 6 < 3? no → 3.
    expect(roll).toEqual({
      mvp: { home: "h3", away: "a4" },
      postFf: { home: 4, away: 3 },
    });
    // RAU-49 fix: the previewed resolution is persisted in the SAME transaction
    // so `resolveMatch` commits EXACTLY these values (never a second roll).
    expect(liveMatchUpdateMany).toHaveBeenCalledWith({
      where: { id: "lm-1" },
      data: {
        pendingResolution: { mvp: { home: "h3", away: "a4" }, postFf: { home: 4, away: 3 } },
      },
    });
    // No closure writes: the preview only persists pendingResolution.
    expect(matchResultCreate).not.toHaveBeenCalled();
    expect(fixtureUpdate).not.toHaveBeenCalled();
    expect(teamUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects with 409 when the match is already resolved (same guard as resolve)", async () => {
    const { deps } = makeResolveDeps({ matchResult: { id: "mr-x" } });
    await expect(
      rollLiveMvp(
        { fixtureId: "f-1", homeTeamId: "home-t", awayTeamId: "away-t", now: 6000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 409 until BOTH sides have nominated (RAU-51 roll gate)", async () => {
    const { deps } = makeResolveDeps({
      row: finishedRow({ mvpNominations: { home: homeNom, away: null } }),
    });
    await expect(
      rollLiveMvp(
        { fixtureId: "f-1", homeTeamId: "home-t", awayTeamId: "away-t", now: 6000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "both sides must nominate first" });
  });

  it("rejects invalid persisted nominations with 400 and a not-finished match with 409", async () => {
    const invalid = makeResolveDeps({
      row: finishedRow({ mvpNominations: { home: ["h1"], away: awayNom } }),
    });
    await expect(
      rollLiveMvp(
        { fixtureId: "f-1", homeTeamId: "home-t", awayTeamId: "away-t", now: 6000 },
        invalid.deps,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const unfinished = makeResolveDeps({ row: finishedRow({ status: "live" as const }) });
    await expect(
      rollLiveMvp(
        { fixtureId: "f-1", homeTeamId: "home-t", awayTeamId: "away-t", now: 6000 },
        unfinished.deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("nominateMvpLiveMatch", () => {
  const nominateInput = {
    fixtureId: "f-1",
    teamId: "home-t",
    side: "home" as const,
    players: homeNom,
    now: 6000,
  };

  it("persists the side's six nominations (replacing a previous submission) with a seq bump and publishes the new view", async () => {
    const { deps, liveMatchUpdateMany, publish } = makeResolveDeps({
      row: finishedRow({ mvpNominations: { home: ["h6", "h5", "h4", "h3", "h2", "h1"], away: awayNom } }),
    });

    const result = await nominateMvpLiveMatch(nominateInput, deps);

    // Replace-on-resubmit: the AWAY side is preserved, the HOME side overwritten.
    expect(liveMatchUpdateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 12 },
      data: { mvpNominations: { home: homeNom, away: awayNom }, seq: 13 },
    });
    // The optimistic guard bump + the published view carry the new nominations.
    expect(result.seq).toBe(13);
    expect(result.view.mvpNominations).toEqual({ home: homeNom, away: awayNom });
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 13, mvpNominations: { home: homeNom, away: awayNom }, events: [] }),
    );
  });

  it("rejects with 404 when no live row exists for the fixture", async () => {
    const { deps, liveMatchFindFirst } = makeResolveDeps();
    liveMatchFindFirst.mockResolvedValue(null);
    await expect(nominateMvpLiveMatch(nominateInput, deps)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects with 409 when the live match is not finished", async () => {
    const { deps } = makeResolveDeps({ row: finishedRow({ status: "live" as const }) });
    await expect(nominateMvpLiveMatch(nominateInput, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 409 when a MatchResult already exists (already resolved)", async () => {
    const { deps } = makeResolveDeps({ matchResult: { id: "mr-x" } });
    await expect(nominateMvpLiveMatch(nominateInput, deps)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects with 400 when the six are not distinct roster ids of that side's team", async () => {
    const dup = makeResolveDeps();
    await expect(
      nominateMvpLiveMatch(
        { ...nominateInput, players: ["h1", "h1", "h2", "h3", "h4", "h5"] },
        dup.deps,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const foreign = makeResolveDeps();
    await expect(
      nominateMvpLiveMatch(
        { ...nominateInput, players: ["h1", "h2", "h3", "h4", "h5", "x9"] },
        foreign.deps,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const short = makeResolveDeps();
    await expect(
      nominateMvpLiveMatch({ ...nominateInput, players: ["h1"] }, short.deps),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 a DEAD nominee (RAU-12 availability guard)", async () => {
    const { deps, teamFindMany } = makeResolveDeps();
    teamFindMany.mockResolvedValue([
      {
        ...teamRow("home"),
        players: [
          { rosterPlayerId: "h1", valueBonus: 0, alive: false, missNextMatch: false },
          ...teamRow("home").players.slice(1).map((p) => ({ ...p, alive: true, missNextMatch: false })),
        ],
      },
      teamRow("away"),
    ]);
    await expect(
      nominateMvpLiveMatch(
        { ...nominateInput, players: ["h1", "h2", "h3", "h4", "h5", "h6"] },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects with 400 a SUSPENDED nominee (RAU-12 missNextMatch guard)", async () => {
    const { deps, teamFindMany } = makeResolveDeps();
    teamFindMany.mockResolvedValue([
      {
        ...teamRow("home"),
        players: [
          { rosterPlayerId: "h1", valueBonus: 0, alive: true, missNextMatch: true },
          ...teamRow("home").players.slice(1).map((p) => ({ ...p, alive: true, missNextMatch: false })),
        ],
      },
      teamRow("away"),
    ]);
    await expect(
      nominateMvpLiveMatch(
        { ...nominateInput, players: ["h1", "h2", "h3", "h4", "h5", "h6"] },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
