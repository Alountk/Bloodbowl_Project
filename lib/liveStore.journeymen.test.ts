import { describe, expect, it, vi } from "vitest";
import { hireJourneymanLiveMatch, type StoreDeps } from "./liveStore";
import { PE_MVP } from "./rules/pe";
import { getRaceById } from "@/features/teams/data/races";
import { computeSpendableBalance } from "@/features/teams/roster";

/**
 * RAU-14 hire-command store tests: the post-resolve journeyman (Novato)
 * decision. `hire: true` pays the race Lineman cost from the treasury,
 * appends the journeyman's persisted name to the roster (`positionalKey` = the
 * race Lineman) and CREATEs the matching Player row carrying the PE earned
 * during the match + every casualty band suffered (read from the persisted
 * `MatchResult` snapshot — RAU-13); `hire: false` ("Dejar ir") only removes
 * the option and leaves a clean slate. Guards: 404 no row/team, 400 unknown
 * journeyman, 409 not-resolved / already hired-or-gone / roster at 16 /
 * insufficient spendable balance, and the optimistic `seq` guard against a
 * concurrent decision on the same id.
 */

const JOURNEYMEN = {
  home: [{ id: "journeyman-home-t-1", name: "Aldric Martillo" }],
  away: [],
};

/** A persisted snapshot whose home side shows the journeyman's earned PE + a
 * lasting injury — the hire must carry both into the new Player row. */
const MATCH_SNAPSHOT = {
  home: {
    pe: [{ rosterPlayerId: "journeyman-home-t-1", pe: 3 }],
    casualties: [
      { team: "home", rosterPlayerId: "journeyman-home-t-1", outcome: { kind: "apaleado" } },
    ],
  },
  away: { pe: [], casualties: [] },
};

const COACHING = { rerolls: 2, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false };

function linemanRoster(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Jugador ${i + 1}`,
    positionalKey: "lineman",
  }));
}

function makeDeps(opts: {
  row?: Record<string, unknown> | null;
  matchResult?: { id: string; scores?: unknown } | null;
  team?: { id: string; raceId: string; roster: unknown; coaching: unknown; treasury: number };
  updateCount?: number;
} = {}): {
  deps: StoreDeps;
  liveMatchUpdate: ReturnType<typeof vi.fn>;
  teamUpdate: ReturnType<typeof vi.fn>;
  teamFind: ReturnType<typeof vi.fn>;
  matchResultFind: ReturnType<typeof vi.fn>;
  playerCreate: ReturnType<typeof vi.fn>;
} {
  const liveMatchUpdate = vi.fn().mockResolvedValue({ count: opts.updateCount ?? 1 });
  const teamUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const teamFind = vi.fn().mockResolvedValue([
    opts.team ?? {
      id: "home-t",
      raceId: "human",
      roster: linemanRoster(11),
      coaching: COACHING,
      treasury: 500_000,
    },
  ]);
  const matchResultFind = vi
    .fn()
    .mockResolvedValue(
      opts.matchResult === undefined
        ? { id: "mr-1", scores: MATCH_SNAPSHOT }
        : opts.matchResult,
    );
  const playerCreate = vi.fn().mockResolvedValue({ id: "pl-1" });
  const tx = {
    liveMatch: { updateMany: liveMatchUpdate },
    team: { updateMany: teamUpdate, findMany: teamFind },
    matchResult: { findUnique: matchResultFind },
    player: { create: playerCreate },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const liveMatchFindFirst = vi.fn().mockResolvedValue(
    opts.row !== undefined
      ? opts.row
      : {
          id: "lm-1",
          fixtureId: "f-1",
          seq: 12,
          journeymen: JOURNEYMEN,
        },
  );
  const deps: StoreDeps = {
    prisma: {
      $transaction,
      liveMatch: { create: vi.fn(), findFirst: liveMatchFindFirst },
      liveEvent: { findFirst: vi.fn(), update: vi.fn() },
    },
    hub: { publish: vi.fn() },
  };
  return { deps, liveMatchUpdate, teamUpdate, teamFind, matchResultFind, playerCreate };
}

describe("hireJourneymanLiveMatch — HIRE", () => {
  it("pays the lineman cost, appends the persisted journeyman to the roster and CREATEs their Player row with the match's earned PE + injuries in ONE transaction", async () => {
    const { deps, liveMatchUpdate, teamUpdate, playerCreate } = makeDeps();

    const result = await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
      deps,
    );

    // The option is gone from the persisted list.
    expect(result.journeymen).toEqual({ home: [], away: [] });
    // The roster gained a player with the PERSISTED journeyman name + the race
    // Lineman positional (RAU-11 style). RAU-52: the hire is PAID IN CASH from
    // the treasury — the ledger is decremented by the lineman cost (50.000)
    // AFTER the resolve collected the match winnings.
    const teamCall = teamUpdate.mock.calls[0][0];
    expect(teamCall).toMatchObject({ where: { id: "home-t" } });
    expect(teamCall.data.treasury).toEqual({ decrement: 50_000 });
    const nextRoster = teamCall.data.roster;
    expect(nextRoster).toHaveLength(12);
    expect(nextRoster[11]).toMatchObject({ name: "Aldric Martillo", positionalKey: "lineman", hired: true });
    const newRosterId = nextRoster[11].id;
    expect(typeof newRosterId).toBe("string");
    // The list removal + seq bump ride the SAME transaction as the team write.
    expect(liveMatchUpdate).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 12 },
      data: { journeymen: { home: [], away: [] }, seq: 13 },
    });
    expect(result.team.treasury).toBe(450_000);

    // RAU-13: the journeyman's Player row is created keyed to the NEW roster id
    // with the PE they EARNED during the match (the snapshot is the single
    // source of truth) + the lasting injury they suffered (missNextMatch).
    expect(playerCreate).toHaveBeenCalledTimes(1);
    expect(playerCreate).toHaveBeenCalledWith({
      data: {
        teamId: "home-t",
        rosterPlayerId: newRosterId,
        name: "Aldric Martillo",
        positionalKey: "lineman",
        pe: 3,
        skills: [],
        injuries: [{ kind: "apaleado" }],
        alive: true,
        missNextMatch: true,
        valueBonus: 0,
        improvements: [],
        attributeIncreases: {},
      },
    });
  });

  it("a hire drops the spendable balance by the lineman cost ONCE (hired flag skips the roster recount)", async () => {
    const { deps, teamUpdate } = makeDeps();
    const race = getRaceById("human")!;
    // 11 drafted linemen (550k) + 2 rerolls (100k) + 500k treasury.
    const before = computeSpendableBalance(
      { treasury: 500_000, roster: linemanRoster(11), coaching: COACHING },
      race,
    );

    const result = await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
      deps,
    );

    // The appended entry is flagged `hired: true` so the spendable formula
    // does NOT count its cost again on top of the treasury decrement.
    const teamCall = teamUpdate.mock.calls[0][0];
    expect(teamCall.data.roster[11]).toMatchObject({ positionalKey: "lineman", hired: true });
    // Treasury 450k, roster 12 (1 hired) → balance drops by exactly 50 000,
    // never by the double-charged 100 000.
    const after = computeSpendableBalance(
      { treasury: result.team.treasury, roster: result.team.roster, coaching: COACHING },
      race,
    );
    expect(after).toBe(before - 50_000);
  });

  it("a hire with no earned PE in the snapshot still creates a fresh 0-PE row with no injuries", async () => {
    const { deps, playerCreate } = makeDeps({
      matchResult: {
        id: "mr-1",
        scores: { home: { pe: [], casualties: [] }, away: { pe: [], casualties: [] } },
      },
    });

    await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
      deps,
    );

    // The snapshot records nothing for the journeyman (they recorded no action
    // and suffered no injury) → the row starts at 0, hale and ready.
    const createCall = playerCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      pe: 0,
      injuries: [],
      alive: true,
      missNextMatch: false,
    });
  });

  it("a hire carries a DEAD band into the new row (alive:false, missNextMatch irrelevant)", async () => {
    const { deps, playerCreate } = makeDeps({
      matchResult: {
        id: "mr-1",
        scores: {
          home: {
            pe: [{ rosterPlayerId: "journeyman-home-t-1", pe: 3 }],
            casualties: [
              { team: "home", rosterPlayerId: "journeyman-home-t-1", outcome: { kind: "dead" } },
            ],
          },
          away: { pe: [], casualties: [] },
        },
      },
    });

    await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
      deps,
    );

    const createCall = playerCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      pe: 3,
      injuries: [{ kind: "dead" }],
      alive: false,
      missNextMatch: false,
    });
  });

  it("409s on a seq conflict (a concurrent decision won) and writes nothing", async () => {
    const { deps, teamUpdate, playerCreate } = makeDeps({ updateCount: 0 });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(teamUpdate).not.toHaveBeenCalled();
    expect(playerCreate).not.toHaveBeenCalled();
  });

  it("409s when the roster is at the 16 cap", async () => {
    const { deps, teamUpdate, playerCreate } = makeDeps({
      team: { id: "home-t", raceId: "human", roster: linemanRoster(16), coaching: COACHING, treasury: 500_000 },
    });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "roster full" });
    expect(teamUpdate).not.toHaveBeenCalled();
    expect(playerCreate).not.toHaveBeenCalled();
  });

  it("409s when the treasury cannot cover the lineman cost (RAU-52 cash payment)", async () => {
    // The team's treasury (0) cannot pay the 50.000 lineman cost — the hire is
    // a CASH payment from the treasury, not a spendable-balance formula.
    const roster = [
      ...linemanRoster(11),
      { id: "b1", name: "Blitzer 1", positionalKey: "blitzer" },
      { id: "b2", name: "Blitzer 2", positionalKey: "blitzer" },
      { id: "c1", name: "Catcher 1", positionalKey: "catcher" },
      { id: "c2", name: "Catcher 2", positionalKey: "catcher" },
    ];
    const { deps, teamUpdate, playerCreate } = makeDeps({
      team: { id: "home-t", raceId: "human", roster, coaching: COACHING, treasury: 0 },
    });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "not enough treasury" });
    expect(teamUpdate).not.toHaveBeenCalled();
    expect(playerCreate).not.toHaveBeenCalled();
  });
});

describe("hireJourneymanLiveMatch — guards", () => {
  it("returns 404 when no LiveMatch row exists", async () => {
    const { deps } = makeDeps({ row: null });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("400s an unknown journeyman when the match never persisted journeymen", async () => {
    const { deps } = makeDeps({ row: { id: "lm-1", fixtureId: "f-1", seq: 12, journeymen: null } });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("409s an already hired-or-gone journeyman (id no longer in the persisted list)", async () => {
    const { deps } = makeDeps({ row: { id: "lm-1", fixtureId: "f-1", seq: 12, journeymen: { home: [], away: [] } } });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "journeyman already hired or gone" });
  });

  it("409s when the match is NOT resolved yet (no MatchResult row)", async () => {
    const { deps, teamUpdate } = makeDeps({ matchResult: null });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "journeymen step first" });
    expect(teamUpdate).not.toHaveBeenCalled();
  });

  it("400s an unknown race / missing lineman positional", async () => {
    const { deps } = makeDeps({
      team: { id: "home-t", raceId: "ghost-race", roster: linemanRoster(11), coaching: COACHING, treasury: 500_000 },
    });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("hireJourneymanLiveMatch — the WIZARD hire (step 5, BEFORE the close)", () => {
  it("hires at the side's 'journeymen' step with NO MatchResult yet, carrying the EVENTS-derived PE + MVP +4 + injuries", async () => {
    // The wizard hire runs pre-close: no MatchResult, but the side's cursor is
    // at "journeymen" and the reveal already persisted the MVP grantees.
    const row = {
      id: "lm-1",
      fixtureId: "f-1",
      seq: 12,
      journeymen: JOURNEYMEN,
      resolutionState: {
        home: { step: "journeymen", fansDone: true, fans: null, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: false },
        away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      },
      pendingResolution: { mvp: { home: "journeyman-home-t-1", away: "a1" } },
      events: [
        { kind: "td", side: "home", playerRosterId: "journeyman-home-t-1", payload: {} },
        { kind: "casualty", side: "home", playerRosterId: "journeyman-home-t-1", payload: { victimRosterId: "journeyman-home-t-1", band: "apaleado" } },
      ],
    };
    const { deps, playerCreate } = makeDeps({ row: row as never, matchResult: null });

    const result = await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: true, now: 1000 },
      deps,
    );

    expect(result.journeymen).toEqual({ home: [], away: [] });
    // TD ★3 + MVP +4 = 7 PE; the lasting band is carried into the new row.
    expect(playerCreate).toHaveBeenCalledTimes(1);
    const data = playerCreate.mock.calls[0][0].data as {
      pe: number;
      injuries: { kind: string }[];
      missNextMatch: boolean;
    };
    expect(data.pe).toBe(3 + PE_MVP);
    expect(data.injuries).toEqual([{ kind: "apaleado" }]);
    expect(data.missNextMatch).toBe(true);
  });
});

describe("hireJourneymanLiveMatch — Dejar ir (hire: false)", () => {
  it("removes the option from the persisted list WITHOUT touching the team or creating a Player row (clean slate)", async () => {
    const { deps, teamUpdate, teamFind, playerCreate } = makeDeps();

    const result = await hireJourneymanLiveMatch(
      { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: false, now: 1000 },
      deps,
    );

    expect(result.journeymen).toEqual({ home: [], away: [] });
    // No roster/treasury mutation — the team is never even loaded; the let-go
    // journeyman leaves no Player row, no PE anywhere.
    expect(teamFind).not.toHaveBeenCalled();
    expect(teamUpdate).not.toHaveBeenCalled();
    expect(playerCreate).not.toHaveBeenCalled();
  });

  it("applies the same guards (not-resolved, unknown, already-gone) as a hire", async () => {
    const { deps } = makeDeps({ matchResult: null });
    await expect(
      hireJourneymanLiveMatch(
        { fixtureId: "f-1", teamId: "home-t", side: "home", journeymanId: "journeyman-home-t-1", hire: false, now: 1000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409, message: "journeymen step first" });
  });
});
