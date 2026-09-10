import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeEventLiveMatch,
  consentLiveMatch,
  retractLiveConsent,
  beginLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
  proposeConcedeLiveMatch,
  declineConcedeLiveMatch,
  acceptConcedeLiveMatch,
  purchaseInducements,
  resetLiveMatch,
  expireStaleLiveMatches,
  isStaleLiveMatch,
  STALE_LIVE_MS,
  liveMatchRowToState,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatchState, TeamSide } from "./liveMatch";
import { EMPTY_RESOLUTION_STATE } from "./liveMatch";

/**
 * Store tests — consent/begin persistence (D16), optimistic `seq` guard (409 on
 * 0 rows), atomic event append, publish-after-commit, the repurposed
 * pause/resume unified-clock segment handling (LM-7), and the RAU-38
 * concede propose/decline/accept persistence (victory in the SAME tx).
 */

/**
 * Start-target fixtures (LM-3): an agreed date is NOT required — an unscheduled
 * fixture with no score/result is a valid start target. Only a played or
 * result-loaded fixture is rejected.
 */
const startableFixture = { played: false, result: false };
const playedFixture = { played: true, result: false };
const resultedFixture = { played: false, result: true };

function fakeRow(): LiveMatchState {
  return {
    seq: 5,
    status: "live" as const,
    half: 1,
    turnNumber: 1,
    activeSide: "home" as TeamSide,
    homeConsented: true,
    awayConsented: true,
    startedAt: 1000,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: 1000,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: EMPTY_RESOLUTION_STATE,
    lastTurnReason: null,
    events: [],
  };
}

function makeDeps(updateCount: number, rollD3?: () => number): {
  deps: StoreDeps;
  updateMany: ReturnType<typeof vi.fn>;
  liveEventCreate: ReturnType<typeof vi.fn>;
  liveMatchCreate: ReturnType<typeof vi.fn>;
  liveMatchFindFirst: ReturnType<typeof vi.fn>;
  liveMatchFindUnique: ReturnType<typeof vi.fn>;
  liveMatchDeleteMany: ReturnType<typeof vi.fn>;
  liveMatchFindMany: ReturnType<typeof vi.fn>;
  teamUpdateMany: ReturnType<typeof vi.fn>;
  teamFindMany: ReturnType<typeof vi.fn>;
  fixtureUpdate: ReturnType<typeof vi.fn>;
  fixtureFindMany: ReturnType<typeof vi.fn>;
  fixtureFindUnique: ReturnType<typeof vi.fn>;
  leagueFindUnique: ReturnType<typeof vi.fn>;
  leagueUpdate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
} {
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  const liveEventCreate = vi.fn().mockResolvedValue({ id: "ev-1" });
  const liveMatchCreate = vi.fn();
  const liveMatchFindFirst = vi.fn().mockResolvedValue(null);
  // RAU-44 default finish-tx reads: no persisted winnings yet, a known fixture,
  // and both teams' coaching JSON (dedicated fans 2 home / 1 away).
  const liveMatchFindUnique = vi.fn().mockResolvedValue({ winnings: null });
  const liveMatchDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const liveMatchFindMany = vi.fn().mockResolvedValue([]);
  const teamUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const teamFindMany = vi.fn().mockResolvedValue([
    { id: "home-t", coaching: { rerolls: 2, dedicatedFans: 2, assistantCoaches: 0, cheerleaders: 0, apothecary: false } },
    { id: "away-t", coaching: { rerolls: 3, dedicatedFans: 1, assistantCoaches: 1, cheerleaders: 0, apothecary: false } },
  ]);
  const fixtureUpdate = vi.fn().mockResolvedValue({ id: "f-1" });
  const fixtureFindMany = vi.fn().mockResolvedValue([]);
  const fixtureFindUnique = vi.fn().mockResolvedValue({ homeTeamId: "home-t", awayTeamId: "away-t" });
  const leagueFindUnique = vi.fn().mockResolvedValue({ status: "started" });
  const leagueUpdate = vi.fn().mockResolvedValue({});
  const publish = vi.fn();
  const tx = {
    liveMatch: { updateMany, create: liveMatchCreate, findUnique: liveMatchFindUnique, deleteMany: liveMatchDeleteMany },
    liveEvent: { create: liveEventCreate },
    team: { updateMany: teamUpdateMany, findMany: teamFindMany },
    fixture: { update: fixtureUpdate, findMany: fixtureFindMany, findUnique: fixtureFindUnique },
    league: { findUnique: leagueFindUnique, update: leagueUpdate },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const deps: StoreDeps = {
    prisma: {
      $transaction,
      liveMatch: { create: liveMatchCreate, findFirst: liveMatchFindFirst, findMany: liveMatchFindMany },
      liveEvent: { findFirst: vi.fn(), update: vi.fn() },
    },
    hub: { publish },
    ...(rollD3 ? { rollD3 } : {}),
  };
  return {
    deps,
    updateMany,
    liveEventCreate,
    liveMatchCreate,
    liveMatchFindFirst,
    liveMatchFindUnique,
    liveMatchDeleteMany,
    liveMatchFindMany,
    teamUpdateMany,
    teamFindMany,
    fixtureUpdate,
    fixtureFindMany,
    fixtureFindUnique,
    leagueFindUnique,
    leagueUpdate,
    publish,
  };
}

describe("liveMatchRowToState", () => {
  it("maps a LiveMatch row to a pure state including the new unified-clock fields", () => {
    const state = liveMatchRowToState({
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: false,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 1,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
      concedeProposedBy: null,
      mvpNominations: null,
      resolutionState: null,
    });
    expect(state.status).toBe("ready");
    expect(state.homeConsented).toBe(true);
    expect(state.awayConsented).toBe(false);
    expect(state.startedAt).toBeNull();
    expect(state.homeTurnMs).toBe(0);
    expect(state.awayTurnMs).toBe(0);
    expect(state.concedeProposedBy).toBeNull();
  });

  it("maps a pending concedeProposedBy side onto the pure state (RAU-38)", () => {
    const state = liveMatchRowToState({
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "away",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 9,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
      concedeProposedBy: "home",
      mvpNominations: null,
      resolutionState: null,
    });
    expect(state.concedeProposedBy).toBe("home");
  });

  it("maps the persisted per-side mvpNominations JSON onto the pure state (RAU-51)", () => {
    const parsed = liveMatchRowToState({
      id: "lm-1",
      fixtureId: "f-1",
      status: "finished",
      half: 2,
      turnNumber: 8,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 1,
      awayScore: 0,
      seq: 9,
      paused: false,
      clockStartedAt: null,
      finishedAt: new Date(5000),
      concedeProposedBy: null,
      mvpNominations: { home: ["h1", "h2", "h3", "h4", "h5", "h6"], away: null },
      resolutionState: null,
    });
    expect(parsed.mvpNominations).toEqual({ home: ["h1", "h2", "h3", "h4", "h5", "h6"], away: null });
    // A null/absent/foreign column parses to both sides "not nominated".
    expect(liveMatchRowToState({ id: "lm-1", mvpNominations: null } as never).mvpNominations).toEqual({
      home: null,
      away: null,
    });
    expect(liveMatchRowToState({ id: "lm-1", mvpNominations: "garbage" } as never).mvpNominations).toEqual({
      home: null,
      away: null,
    });
    expect(
      liveMatchRowToState({ id: "lm-1", mvpNominations: { home: 1, away: [{ x: 1 }] } } as never).mvpNominations,
    ).toEqual({ home: null, away: null });
  });

  it("maps the persisted per-side resolution wizard state onto the pure state (resume cursor)", () => {
    const parsed = liveMatchRowToState({
      id: "lm-1",
      fixtureId: "f-1",
      status: "finished",
      half: 2,
      turnNumber: 8,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 1,
      awayScore: 0,
      seq: 9,
      paused: false,
      clockStartedAt: null,
      finishedAt: new Date(5000),
      concedeProposedBy: null,
      mvpNominations: null,
      resolutionState: {
        home: { step: "casualties", fansDone: true, fans: { roll: 4, before: 2, after: 3, direction: "up" }, mvpConfirmed: true, mvpRolled: true, casualtiesDone: false, journeymenDone: false },
        away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      },
    });
    expect(parsed.resolutionState.home.step).toBe("casualties");
    expect(parsed.resolutionState.home.mvpConfirmed).toBe(true);
    expect(parsed.resolutionState.home.fans).toEqual({ roll: 4, before: 2, after: 3, direction: "up" });
    expect(parsed.resolutionState.away).toEqual(EMPTY_RESOLUTION_STATE.away);
    // A null/absent column parses to the EMPTY per-side state (step "winnings").
    expect(liveMatchRowToState({ id: "lm-1", resolutionState: null } as never).resolutionState).toEqual(
      EMPTY_RESOLUTION_STATE,
    );
  });
});

describe("consentLiveMatch — create-on-first-consent, ready on second (LM-11, D16)", () => {
  it("creates the LiveMatch row with the consent boolean on the FIRST coach's consent", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    liveMatchCreate.mockResolvedValue({ id: "lm-new" });

    // An unscheduled fixture (no agreed date, `{ played: false, result: false }`)
    // IS a valid start target — the date negotiation never gates the start.
    const result = await consentLiveMatch(
      { fixtureId: "f-1", fixture: startableFixture, side: "home", now: 500 },
      deps,
    );

    expect(liveMatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fixtureId: "f-1", status: "pending", homeConsented: true, awayConsented: false }),
      }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "pending", homeConsented: true }));
    expect(result.liveMatchId).toBe("lm-new");
  });

  it("applies the SECOND consent to the existing row → ready, no new row", async () => {
    const { deps, liveMatchCreate, updateMany, liveMatchFindFirst, publish } = makeDeps(1);
    const existingRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "pending",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: false,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 1,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(existingRow);

    const result = await consentLiveMatch(
      { fixtureId: "f-1", fixture: startableFixture, side: "away", now: 600 },
      deps,
    );

    expect(liveMatchCreate).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lm-1", seq: 1 } }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "ready", homeConsented: true, awayConsented: true, seq: 2 }));
    expect(result.liveMatchId).toBe("lm-1");
  });

  it("rejects consent on a played fixture with 409 and creates nothing", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    await expect(
      consentLiveMatch({ fixtureId: "f-1", fixture: playedFixture, side: "home", now: 500 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(liveMatchCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects consent on a result-loaded fixture with 409 and creates nothing", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    await expect(
      consentLiveMatch({ fixtureId: "f-1", fixture: resultedFixture, side: "away", now: 500 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(liveMatchCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("retractLiveConsent — clears the boolean and returns to pending (LM-11)", () => {
  it("updates the existing ready row back to pending with the consent cleared", async () => {
    const { deps, updateMany, liveMatchFindFirst, publish } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);

    await retractLiveConsent({ liveMatchId: "lm-1", fixtureId: "f-1", side: "home", now: 700 }, deps);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 2 },
        data: expect.objectContaining({ seq: 3, status: "pending", homeConsented: false }),
      }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "pending", homeConsented: false }));
  });

  it("is a no-op when the side never consented (no bump, no publish)", async () => {
    const { deps, updateMany, liveMatchFindFirst, publish } = makeDeps(1);
    const pendingRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "pending",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: false,
      awayConsented: false,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 1,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(pendingRow);

    await retractLiveConsent({ liveMatchId: "lm-1", fixtureId: "f-1", side: "home", now: 700 }, deps);

    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("beginLiveMatch — ready→live ONLY via the first turn (LM-3)", () => {
  it("runs beginMatch and persists the live state alongside the start + turnStart events", async () => {
    const { deps, updateMany, liveEventCreate, liveMatchFindFirst, publish } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);

    const result = await beginLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", now: 1000 }, deps);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 2 },
        // begin emits TWO events (start + turnStart, seq 3 & 4), so the row seq
        // advances to the highest event seq (4), not just currentSeq+1 — that is
        // what prevents the next transition's event from colliding (P2002).
        data: expect.objectContaining({ seq: 4, status: "live", startedAt: new Date(1000), clockStartedAt: new Date(1000), activeSide: "home" }),
      }),
    );
    // The start + turnStart events are appended in the same transaction.
    const createCalls = liveEventCreate.mock.calls.map((c: { data: { kind: string } }[]) => c[0].data.kind);
    expect(createCalls).toContain("start");
    expect(createCalls).toContain("turnStart");
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "live", startedAt: 1000 }));
    expect(result.view.status).toBe("live");
  });

  it("builds the kickoff events and commits the treasury decrements in the SAME $transaction (LM-23)", async () => {
    const { deps, updateMany, liveEventCreate, liveMatchFindFirst, teamUpdateMany, publish } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);

    const result = await beginLiveMatch(
      {
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        now: 1000,
        kickoff: {
          now: 1000,
          half: 1,
          turnNumber: 1,
          home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
          away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
          dice: {
            home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
            away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
          },
        },
      },
      deps,
    );

    // begin emits 5 events (em-home, em-away, fan_factor, start, turnStart),
    // so the row seq advances from 2 to 7.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lm-1", seq: 2 }, data: expect.objectContaining({ seq: 7, status: "live" }) }),
    );
    // The event rows appended in the SAME tx include the 3 kickoff kinds + start + turnStart.
    const createCalls = liveEventCreate.mock.calls.map((c: { data: { kind: string } }[]) => c[0].data.kind);
    expect(createCalls).toEqual(["expensive_mistake", "expensive_mistake", "fan_factor", "start", "turnStart"]);
    // The treasury decrements commit in the SAME transaction (LM-23 atomicity).
    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: { id: "home-t" },
      data: { treasury: { decrement: 20000 } },
    });
    expect(teamUpdateMany).toHaveBeenCalledWith({
      where: { id: "away-t" },
      data: { treasury: { decrement: 400000 } },
    });
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "live" }));
    expect(result.view.status).toBe("live");
  });

  it("persists the journeyman join events ahead of the kickoff rows when sides field novatos (RAU-13)", async () => {
    const { deps, updateMany, liveEventCreate, liveMatchFindFirst, publish } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);

    await beginLiveMatch(
      {
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        now: 1000,
        kickoff: {
          now: 1000,
          half: 1,
          turnNumber: 1,
          home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
          away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
          dice: {
            home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
            away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
          },
          journeymen: { home: { count: 1, names: ["Aldric Martillo"] } },
        },
      },
      deps,
    );

    // 6 events (home journeyman + em-home + em-away + fan_factor + start +
    // turnStart) → the row seq advances from 2 to 8.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lm-1", seq: 2 }, data: expect.objectContaining({ seq: 8 }) }),
    );
    const createCalls = liveEventCreate.mock.calls.map((c: { data: { kind: string } }[]) => c[0].data.kind);
    expect(createCalls).toEqual(["journeyman", "expensive_mistake", "expensive_mistake", "fan_factor", "start", "turnStart"]);
    expect(liveEventCreate.mock.calls[0][0].data).toMatchObject({
      kind: "journeyman",
      side: "home",
      playerRosterId: null,
      payload: { count: 1, names: ["Aldric Martillo"] },
    });
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "live" }));
  });

  it("persists the fielded journeymen on the LiveMatch row at begin (RAU-14)", async () => {
    const { deps, updateMany, liveMatchFindFirst } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);

    await beginLiveMatch(
      {
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        now: 1000,
        kickoff: {
          now: 1000,
          half: 1,
          turnNumber: 1,
          home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
          away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
          dice: {
            home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
            away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
          },
        },
        // RAU-14: the route derives these from the SAME served rosters that
        // name the `journeyman` events — home fields one Novato, away none.
        journeymen: {
          home: [{ id: "journeyman-home-t-1", name: "Aldric Martillo" }],
          away: [],
        },
      },
      deps,
    );

    // The begin write carries the journeymen JSON atomically with the event rows.
    const beginCall = updateMany.mock.calls.find((c) => c[0].data.journeymen != null);
    expect(beginCall).toBeTruthy();
    expect(beginCall![0].data).toMatchObject({
      journeymen: { home: [{ id: "journeyman-home-t-1", name: "Aldric Martillo" }], away: [] },
    });
  });

  it("rolls back the whole transaction (events + treasury) when an event row fails (LM-23 atomicity)", async () => {
    const { deps, liveEventCreate, liveMatchFindFirst, teamUpdateMany, publish } = makeDeps(1);
    const readyRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 2,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(readyRow);
    // The failure mock aborts `$transaction` BEFORE the treasury update writes.
    liveEventCreate.mockRejectedValue(Object.assign(new Error("db down"), { code: "P2028" }));

    await expect(
      beginLiveMatch(
        {
          liveMatchId: "lm-1",
          fixtureId: "f-1",
          now: 1000,
          kickoff: {
            now: 1000,
            half: 1,
            turnNumber: 1,
            home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
            away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
            dice: {
              home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
              away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
            },
          },
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: "P2028" });
    // Neither the treasury decrement nor a publish happened (whole tx aborted).
    expect(teamUpdateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("maps a retried begin on an already-live match to a 409 (LM-21 idempotency)", async () => {
    const { deps, liveMatchFindFirst, teamUpdateMany, publish } = makeDeps(1);
    const liveRow = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 7,
      paused: false,
      clockStartedAt: new Date(1000).toISOString(),
      finishedAt: null,
    };
    liveMatchFindFirst.mockResolvedValue(liveRow);

    await expect(
      beginLiveMatch(
        {
          liveMatchId: "lm-1",
          fixtureId: "f-1",
          now: 2000,
          kickoff: {
            now: 2000,
            half: 1,
            turnNumber: 1,
            home: { teamId: "home-t", treasury: 234000, dedicatedFans: 2 },
            away: { teamId: "away-t", treasury: 500000, dedicatedFans: 1 },
            dice: {
              home: { em: 1, d3: 2, keep: [0, 0] as [number, number], fan: 3 },
              away: { em: 1, d3: 0, keep: [4, 6] as [number, number], fan: 6 },
            },
          },
        },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(teamUpdateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("applyTransition — optimistic seq + atomic event + publish-after-commit", () => {
  it("bumps the seq via updateMany and creates the delta event atomically, then publishes after commit", async () => {
    const { deps, updateMany, liveEventCreate, publish } = makeDeps(1);
    const current = fakeRow();
    const next: LiveMatchState = {
      ...current,
      activeSide: "away",
      turnNumber: 2,
      events: [
        {
          seq: 6,
          kind: "turn" as const,
          side: null,
          playerRosterId: null,
          half: 1,
          turnNumber: 2,
          payload: {},
          at: 2000,
        },
      ],
    };

    const result = await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next, now: 2000 },
      deps,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, activeSide: "away", turnNumber: 2 }),
    });
    expect(liveEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ liveMatchId: "lm-1", seq: 6, kind: "turn" }),
      }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ seq: 6 }));
    expect(result).not.toBeNull();
  });

  it("publishes the delta events alongside the view so SSE frames carry the timeline", async () => {
    const { deps, publish } = makeDeps(1);
    const current = fakeRow();
    const next: LiveMatchState = {
      ...current,
      activeSide: "away",
      turnNumber: 2,
      events: [
        {
          seq: 6,
          kind: "turn" as const,
          side: null,
          playerRosterId: null,
          half: 1,
          turnNumber: 2,
          payload: {},
          at: 2000,
        },
        {
          seq: 7,
          kind: "turnStart" as const,
          side: "away",
          playerRosterId: null,
          half: 1,
          turnNumber: 2,
          payload: {},
          at: 2000,
        },
      ],
    };

    await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next, now: 2000 },
      deps,
    );

    // The fan-out frame carries ONLY the delta events of this transition so the
    // receiving client can append them to its timeline (dedupe by seq) without a
    // reload or a second DB read.
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({
        seq: 7,
        events: [
          expect.objectContaining({ seq: 6, kind: "turn" }),
          expect.objectContaining({ seq: 7, kind: "turnStart", side: "away" }),
        ],
      }),
    );
  });

  it("rejects with 409 (double-action) when updateMany reports 0 rows and creates/publishes nothing", async () => {
    const { deps, liveEventCreate, publish } = makeDeps(0);
    const current = fakeRow();

    await expect(
      applyTransition({ liveMatchId: "lm-1", fixtureId: "f-1", current, next: current, now: 2000 }, deps),
    ).rejects.toMatchObject({ status: 409 });

    expect(liveEventCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("resetLiveMatch — delete row + clear fixture, publish live:null (LMR-2)", () => {
  it("deletes the fixture LiveMatch, nulls scores/winner, and publishes live:null at prevSeq+1", async () => {
    const { deps, liveMatchDeleteMany, fixtureUpdate, publish } = makeDeps(1);

    await resetLiveMatch({ fixtureId: "f-1", prevSeq: 5 }, deps);

    expect(liveMatchDeleteMany).toHaveBeenCalledWith({ where: { fixtureId: "f-1" } });
    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { winnerId: null, homeScore: null, awayScore: null },
    });
    // The SSE frame drops the live view; seq must exceed the snapshot cursor.
    expect(publish).toHaveBeenCalledWith("f-1", { seq: 6, live: null });
  });

  it("preserves scheduledAt (never writes it) and derives the seq from prevSeq", async () => {
    const { deps, fixtureUpdate, publish } = makeDeps(1);

    await resetLiveMatch({ fixtureId: "f-9", prevSeq: 0 }, deps);

    const [updateArgs] = fixtureUpdate.mock.calls[0] as [{ data: Record<string, unknown> }];
    expect(updateArgs.data).not.toHaveProperty("scheduledAt");
    expect(publish).toHaveBeenCalledWith("f-9", { seq: 1, live: null });
  });
});

describe("isStaleLiveMatch — only a `live` row older than 8h is stale (LMR-3)", () => {
  const NOW = 1_000_000_000_000;

  it("is true for a live row started more than 8h ago", () => {
    expect(
      isStaleLiveMatch({ status: "live", startedAt: new Date(NOW - STALE_LIVE_MS - 1) }, NOW),
    ).toBe(true);
  });

  it("is false for a live row under 8h old", () => {
    expect(
      isStaleLiveMatch({ status: "live", startedAt: new Date(NOW - STALE_LIVE_MS + 1) }, NOW),
    ).toBe(false);
  });

  it("is false for ready/pending/finished rows and a live row with no startedAt", () => {
    const old = new Date(NOW - STALE_LIVE_MS - 1);
    expect(isStaleLiveMatch({ status: "ready", startedAt: old }, NOW)).toBe(false);
    expect(isStaleLiveMatch({ status: "pending", startedAt: old }, NOW)).toBe(false);
    expect(isStaleLiveMatch({ status: "finished", startedAt: old }, NOW)).toBe(false);
    expect(isStaleLiveMatch({ status: "live", startedAt: null }, NOW)).toBe(false);
  });
});

describe("expireStaleLiveMatches — lazy 8h freeze, seq-guarded (LMR-3/LMR-4/LMR-5)", () => {
  const NOW = 1_000_000_000_000;

  /** A persisted stale `live` row as `findMany` returns it. */
  function staleRow(over: Record<string, unknown> = {}) {
    return {
      id: "lm-1",
      fixtureId: "f-1",
      seq: 5,
      status: "live",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(NOW - STALE_LIVE_MS - 1000),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 2,
      awayScore: 1,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
      concedeProposedBy: null,
      mvpNominations: null,
      resolutionState: null,
      ...over,
    };
  }

  it("freezes the row, records the live scoreboard + derived winner, closes the league and publishes finished", async () => {
    const { deps, updateMany, fixtureUpdate, fixtureFindUnique, fixtureFindMany, leagueUpdate, publish, liveMatchFindMany } =
      makeDeps(1);
    liveMatchFindMany.mockResolvedValue([staleRow()]);
    fixtureFindUnique.mockResolvedValue({
      homeTeamId: "home-t",
      awayTeamId: "away-t",
      homeScore: null,
      awayScore: null,
      winnerId: null,
      leagueId: "league-1",
    });
    // A fully-played season so maybeCloseLeague actually flips the league.
    fixtureFindMany.mockResolvedValue([
      { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: 2, awayScore: 1, winnerId: "home-t" },
    ]);

    const closed = await expireStaleLiveMatches(deps, { leagueId: "league-1" }, NOW);

    expect(closed).toBe(1);
    expect(liveMatchFindMany).toHaveBeenCalledWith({
      where: {
        status: "live",
        startedAt: { lt: new Date(NOW - STALE_LIVE_MS) },
        fixture: { leagueId: "league-1" },
      },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5, status: "live" },
      data: { status: "finished", finishedAt: new Date(NOW), seq: 6 },
    });
    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { winnerId: "home-t", homeScore: 2, awayScore: 1 },
    });
    expect(leagueUpdate).toHaveBeenCalledWith({
      where: { id: "league-1" },
      data: { status: "finished", championTeamId: "home-t" },
    });
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 6, status: "finished", homeScore: 2, awayScore: 1 }),
    );
  });

  it("leaves winnerId null on a draw", async () => {
    const { deps, fixtureUpdate, fixtureFindUnique, liveMatchFindMany } = makeDeps(1);
    liveMatchFindMany.mockResolvedValue([staleRow({ homeScore: 1, awayScore: 1 })]);
    fixtureFindUnique.mockResolvedValue({
      homeTeamId: "home-t",
      awayTeamId: "away-t",
      homeScore: null,
      awayScore: null,
      winnerId: null,
      leagueId: "league-1",
    });

    const closed = await expireStaleLiveMatches(deps, { fixtureId: "f-1" }, NOW);

    expect(closed).toBe(1);
    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { winnerId: null, homeScore: 1, awayScore: 1 },
    });
  });

  it("scopes the query by fixtureId when given a fixture scope", async () => {
    const { deps, liveMatchFindMany } = makeDeps(1);

    await expireStaleLiveMatches(deps, { fixtureId: "f-9" }, NOW);

    expect(liveMatchFindMany).toHaveBeenCalledWith({
      where: { status: "live", startedAt: { lt: new Date(NOW - STALE_LIVE_MS) }, fixtureId: "f-9" },
    });
  });

  it("no-ops on a lost seq race (0 rows) without writing the fixture or publishing", async () => {
    const { deps, fixtureUpdate, fixtureFindUnique, publish, liveMatchFindMany } = makeDeps(0);
    liveMatchFindMany.mockResolvedValue([staleRow()]);
    fixtureFindUnique.mockResolvedValue({
      homeTeamId: "home-t",
      awayTeamId: "away-t",
      homeScore: null,
      awayScore: null,
      winnerId: null,
      leagueId: "league-1",
    });

    const closed = await expireStaleLiveMatches(deps, { leagueId: "league-1" }, NOW);

    expect(closed).toBe(0);
    expect(fixtureUpdate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("is idempotent — a re-run finds no live rows and does nothing", async () => {
    const { deps, updateMany } = makeDeps(1);
    // Already-finished rows are not `live`, so the sweep query returns nothing.
    deps.prisma.liveMatch.findMany = vi.fn().mockResolvedValue([]);

    const closed = await expireStaleLiveMatches(deps, { leagueId: "league-1" }, NOW);

    expect(closed).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("skips a returned row that is not actually stale (defensive predicate)", async () => {
    const { deps, updateMany, liveMatchFindMany } = makeDeps(1);
    liveMatchFindMany.mockResolvedValue([staleRow({ startedAt: new Date(NOW - 1000) })]);

    const closed = await expireStaleLiveMatches(deps, { leagueId: "league-1" }, NOW);

    expect(closed).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("pause/resume — unified clock segment handling (LM-7, D18)", () => {
  it("pause bumps the ACTIVE accumulator by the in-flight segment then nulls the segment start", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const current = fakeRow(); // home active, clockStartedAt=1000, now=2000 → +1000ms

    await pauseLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", current, now: 2000 }, deps);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, paused: true, clockStartedAt: null, homeTurnMs: 1000 }),
    });
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ paused: true, homeTurnMs: 1000 }));
  });

  it("is a no-op when already paused (no seq bump, no publish)", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const alreadyPaused = { ...fakeRow(), paused: true, clockStartedAt: null };

    await pauseLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", current: alreadyPaused, now: 2000 }, deps);

    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("resume restarts the segment at now: clears pause, sets clockStartedAt, does NOT accumulate", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const paused = { ...fakeRow(), paused: true, clockStartedAt: null, homeTurnMs: 1000 };

    await resumeLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", current: paused, now: 3000 }, deps);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, paused: false, clockStartedAt: new Date(3000), homeTurnMs: 1000 }),
    });
    expect(publish).toHaveBeenCalled();
  });
});

describe("proposeConcedeLiveMatch — persists the proposal under the seq guard (RAU-38)", () => {
  /** A live row with no pending proposal, as prisma would return it. */
  function liveRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 5,
      paused: false,
      clockStartedAt: new Date(1000).toISOString(),
      finishedAt: null,
      concedeProposedBy: null,
      ...overrides,
    };
  }

  it("persists concedeProposedBy = the proposing side, bumps the seq and publishes", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(liveRow());

    const result = await proposeConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "home", now: 2000 },
      deps,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 5 },
        data: expect.objectContaining({ seq: 6, concedeProposedBy: "home" }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 6, concedeProposedBy: "home" }),
    );
    expect(result.view.concedeProposedBy).toBe("home");
  });

  it("is an idempotent no-op when the SAME side retries (no seq bump, no publish)", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(liveRow({ concedeProposedBy: "home" }));

    const result = await proposeConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "home", now: 2000 },
      deps,
    );

    expect(result.view.concedeProposedBy).toBe("home");
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("maps a non-live / double-propose state-machine rejection to 409 with no mutation", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(liveRow({ concedeProposedBy: "home" }));

    await expect(
      proposeConcedeLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2000 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns 404 when no LiveMatch row exists", async () => {
    const { deps } = makeDeps(1);
    await expect(
      proposeConcedeLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", side: "home", now: 2000 }, deps),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("declineConcedeLiveMatch — clears the proposal so the match continues (RAU-38)", () => {
  it("persists concedeProposedBy = null when the NON-proposer declines", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue({
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 6,
      paused: false,
      clockStartedAt: new Date(1000).toISOString(),
      finishedAt: null,
      concedeProposedBy: "home",
    });

    const result = await declineConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 },
      deps,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 6 },
        data: expect.objectContaining({ seq: 7, concedeProposedBy: null, status: "live" }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 7, concedeProposedBy: null, status: "live" }),
    );
    expect(result.view.concedeProposedBy).toBeNull();
  });

  it("is a no-op when no proposal is pending (retry-safe)", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(liveRowForDecline());

    const result = await declineConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 },
      deps,
    );

    expect(result.view.concedeProposedBy).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("maps the proposer declining their own proposal to 409 with no mutation", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue({
      ...liveRowForDecline(),
      concedeProposedBy: "away",
    });

    await expect(
      declineConcedeLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  function liveRowForDecline(): Record<string, unknown> {
    return {
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 6,
      paused: false,
      clockStartedAt: new Date(1000).toISOString(),
      finishedAt: null,
      concedeProposedBy: null,
    };
  }
});

describe("acceptConcedeLiveMatch — finishes the match and awards the victory in the SAME tx (RAU-38)", () => {
  /** Home proposed; away (the acceptor) accepts. */
  const pendingRow = {
    id: "lm-1",
    fixtureId: "f-1",
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: new Date(1000).toISOString(),
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    seq: 8,
    paused: false,
    clockStartedAt: new Date(1000).toISOString(),
    finishedAt: null,
    concedeProposedBy: "home",
  };

  it("persists the finished state + the concede event AND closes the fixture (winner = acceptor) in the SAME $transaction", async () => {
    const { deps, liveMatchFindFirst, updateMany, liveEventCreate, fixtureUpdate, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);

    const result = await acceptConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
      deps,
    );

    // The live row becomes finished with the proposal cleared; the seq advances.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 8 },
        data: expect.objectContaining({
          seq: 9,
          status: "finished",
          finishedAt: new Date(2000),
          concedeProposedBy: null,
          paused: false,
          clockStartedAt: null,
        }),
      }),
    );
    // The `concede` event row persists with side = the SURRENDERING side (home).
    expect(liveEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          liveMatchId: "lm-1",
          seq: 9,
          kind: "concede",
          side: "home",
          payload: { winnerSide: "away" },
        }),
      }),
    );
    // The fixture closes in the SAME transaction: winner = the ACCEPTOR (away-t)
    // with the walkover-style 2-0 scores (forfeit precedent).
    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { winnerId: "away-t", homeScore: 0, awayScore: 2 },
    });
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 9, status: "finished", concedeProposedBy: null }),
    );
    expect(result.view.status).toBe("finished");
  });

  it("awards the home side when HOME is the acceptor", async () => {
    const { deps, liveMatchFindFirst, fixtureUpdate } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue({ ...pendingRow, concedeProposedBy: "away" });

    await acceptConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "home", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
      deps,
    );

    expect(fixtureUpdate).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: { winnerId: "home-t", homeScore: 2, awayScore: 0 },
    });
  });

  it("closes the season when the conceded fixture is the LAST one (RAU-40)", async () => {
    const { deps, liveMatchFindFirst, fixtureFindMany, leagueFindUnique, leagueUpdate } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);
    // The fixture was just updated in this tx; `findMany` sees the conceded
    // scores (0-2) — the season's only fixture → every fixture is played.
    fixtureFindMany.mockResolvedValue([
      { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: 0, awayScore: 2, winnerId: "away-t" },
    ]);

    await acceptConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
      deps,
    );

    expect(leagueFindUnique).toHaveBeenCalledWith({ where: { id: "l-1" }, select: { status: true } });
    expect(leagueUpdate).toHaveBeenCalledWith({
      where: { id: "l-1" },
      data: { status: "finished", championTeamId: "away-t" },
    });
  });

  it("does NOT close the season while other fixtures remain unplayed (RAU-40)", async () => {
    const { deps, liveMatchFindFirst, fixtureFindMany, leagueUpdate } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);
    fixtureFindMany.mockResolvedValue([
      { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: 0, awayScore: 2, winnerId: "away-t" },
      { homeTeamId: "x", awayTeamId: "y", homeScore: null, awayScore: null, winnerId: null },
    ]);

    await acceptConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
      deps,
    );

    expect(leagueUpdate).not.toHaveBeenCalled();
  });

  it("maps a retried accept (already finished) / no-proposal / own-proposal to 409 with no fixture write", async () => {
    const { deps, liveMatchFindFirst, fixtureUpdate, updateMany, publish } = makeDeps(1);
    // Already finished (the retry after a successful accept).
    liveMatchFindFirst.mockResolvedValue({
      ...pendingRow,
      status: "finished",
      finishedAt: new Date(2000).toISOString(),
      concedeProposedBy: null,
    });

    await expect(
      acceptConcedeLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2500 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(fixtureUpdate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rolls back the fixture write when the event row fails (atomicity, same tx)", async () => {
    const { deps, liveMatchFindFirst, liveEventCreate, fixtureUpdate, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);
    liveEventCreate.mockRejectedValue(Object.assign(new Error("db down"), { code: "P2028" }));

    await expect(
      acceptConcedeLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
        deps,
      ),
    ).rejects.toMatchObject({ code: "P2028" });
    // The fixture close never ran inside the aborted tx (atomic with the event).
    expect(fixtureUpdate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});



describe("acknowledgeEventLiveMatch — the rival marks a card ok/nok (design B, RAU-82)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeDeps(over: Partial<StoreDeps> = {}): StoreDeps {
    return {
      prisma: {
        $transaction: vi.fn(),
        liveMatch: { create: vi.fn(), findFirst: vi.fn() },
        liveEvent: { findFirst: vi.fn(), update: vi.fn() },
      },
      hub: { publish: vi.fn() },
      ...over,
    } as StoreDeps;
  }

  const liveRow = {
    id: "lm-1",
    fixtureId: "f-1",
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: new Date(1000),
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    seq: 5,
    paused: false,
    clockStartedAt: new Date(1000),
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: null,
    resolutionState: null,
    journeymen: null,
    pendingCasualty: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as never;

  it("persists the ack on the rival's side and publishes an ack frame (no seq bump)", async () => {
    const liveMatchFindFirst = vi.fn().mockResolvedValue(liveRow);
    const liveEventFindFirst = vi.fn().mockResolvedValue({
      id: "e2", liveMatchId: "lm-1", seq: 2, kind: "td", side: "home",
      playerRosterId: "p1", half: 1, turnNumber: 1, payload: {}, createdAt: new Date(1000),
      ackStatus: "pending", ackAt: null, ackedBy: null,
    });
    const liveEventUpdate = vi.fn().mockResolvedValue({
      id: "e2", liveMatchId: "lm-1", seq: 2, kind: "td", side: "home",
      playerRosterId: "p1", half: 1, turnNumber: 1, payload: {}, createdAt: new Date(1000),
      ackStatus: "ok", ackAt: new Date(2000), ackedBy: "u-away",
    });
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = liveMatchFindFirst;
    deps.prisma.liveEvent.findFirst = liveEventFindFirst;
    deps.prisma.liveEvent.update = liveEventUpdate;

    const result = await acknowledgeEventLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 2, side: "away", userId: "u-away", status: "ok", now: 2000 },
      deps,
    );
    expect(liveEventUpdate).toHaveBeenCalledWith({
      where: { id: "e2" },
      data: { ackStatus: "ok", ackAt: new Date(2000), ackedBy: "u-away" },
    });
    expect(result.event.ackStatus).toBe("ok");
    expect(result.event.ackedBy).toBe("u-away");
    // The ack frame rides the EVENT seq so live clients upsert the card.
    expect(deps.hub.publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({
        kind: "ack",
        seq: 2,
        activeSide: "home",
        event: expect.objectContaining({ seq: 2, ackStatus: "ok" }),
      }),
    );
  });

  it("rejects the AUTHOR acknowledging their own event (only the rival coteja)", async () => {
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = vi.fn().mockResolvedValue(liveRow);
    deps.prisma.liveEvent.findFirst = vi.fn().mockResolvedValue({
      id: "e2", liveMatchId: "lm-1", seq: 2, kind: "td", side: "home",
      playerRosterId: "p1", half: 1, turnNumber: 1, payload: {}, createdAt: new Date(1000),
      ackStatus: "pending", ackAt: null, ackedBy: null,
    });
    await expect(
      acknowledgeEventLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 2, side: "home", userId: "u-home", status: "ok", now: 2000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.hub.publish).not.toHaveBeenCalled();
  });

  it("404 when the event does not exist", async () => {
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = vi.fn().mockResolvedValue(liveRow);
    deps.prisma.liveEvent.findFirst = vi.fn().mockResolvedValue(null);
    await expect(
      acknowledgeEventLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 99, side: "away", userId: "u-away", status: "nok", now: 2000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("PASSES the payload causer (D2): the fallen player's coach acks a CAUSED casualty, never the recorder", async () => {
    // A caused casualty: victim side home, causer an away player (payload). The
    // author is the CAUSER's side (away) = the recorder; the HOME coach (the
    // fallen player's side) is the rival who may ack. Both asserts prove the
    // author is derived from `payload.causerRosterId`, not always the flipper.
    const causedEvent = {
      id: "e3", liveMatchId: "lm-1", seq: 3, kind: "casualty", side: "home",
      playerRosterId: "h1", half: 1, turnNumber: 1,
      payload: { victimRosterId: "h1", causerRosterId: "a1", cause: "block", band: "grave" },
      createdAt: new Date(1000), ackStatus: "pending", ackAt: null, ackedBy: null,
    };
    const update = vi.fn().mockResolvedValue({ ...causedEvent, ackStatus: "ok", ackAt: new Date(2000), ackedBy: "u-home" });
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = vi.fn().mockResolvedValue(liveRow);
    deps.prisma.liveEvent.findFirst = vi.fn().mockResolvedValue(causedEvent);
    deps.prisma.liveEvent.update = update;

    // The recorder (causer side = away) must NEVER self-ack.
    await expect(
      acknowledgeEventLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 3, side: "away", userId: "u-away", status: "ok", now: 2000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });

    // The fallen player's coach (victim's side = home) acks → persists.
    const result = await acknowledgeEventLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 3, side: "home", userId: "u-home", status: "ok", now: 2000 },
      deps,
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "e3" },
      data: { ackStatus: "ok", ackAt: new Date(2000), ackedBy: "u-home" },
    });
    expect(result.event.ackStatus).toBe("ok");
    expect(result.event.ackedBy).toBe("u-home");
  });

  it("rejects EVERY ack of a CAUSER-LESS casualty (author null → auto-verify only, LM-26)", async () => {
    // A self-inflicted dodge/crowd casualty: victim side away, NO causer. It has
    // no author, so no coach (recorder or rival) may ack it.
    const causerless = {
      id: "e4", liveMatchId: "lm-1", seq: 4, kind: "casualty", side: "away",
      playerRosterId: "a9", half: 1, turnNumber: 1,
      payload: { victimRosterId: "a9", cause: "dodge", band: "bruise" },
      createdAt: new Date(1000), ackStatus: "pending", ackAt: null, ackedBy: null,
    };
    const update = vi.fn();
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = vi.fn().mockResolvedValue(liveRow);
    deps.prisma.liveEvent.findFirst = vi.fn().mockResolvedValue(causerless);
    deps.prisma.liveEvent.update = update;

    for (const side of ["away", "home"] as const) {
      await expect(
        acknowledgeEventLiveMatch(
          { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 4, side, userId: "u-" + side, status: "ok", now: 2000 },
          deps,
        ),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect(update).not.toHaveBeenCalled();
    expect(deps.hub.publish).not.toHaveBeenCalled();
  });

  it("rejects an ack of a NON-ACKABLE kind (turnStart) with 409 and no mutation", async () => {
    // System/state cards (turnStart, mvp, expensive_mistake, ...) have no
    // recorder-author the rival verifies — the kind gate (shared ACKABLE_KINDS
    // with the UI) rejects the ack even for the "rival" side, no update/publish.
    const update = vi.fn();
    const deps = makeDeps();
    deps.prisma.liveMatch.findFirst = vi.fn().mockResolvedValue(liveRow);
    deps.prisma.liveEvent.findFirst = vi.fn().mockResolvedValue({
      id: "e5", liveMatchId: "lm-1", seq: 5, kind: "turnStart", side: "home",
      playerRosterId: null, half: 1, turnNumber: 4, payload: {}, createdAt: new Date(1000),
      ackStatus: "pending", ackAt: null, ackedBy: null,
    });
    deps.prisma.liveEvent.update = update;

    await expect(
      acknowledgeEventLiveMatch(
        { liveMatchId: "lm-1", fixtureId: "f-1", eventSeq: 5, side: "away", userId: "u-away", status: "nok", now: 2000 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(update).not.toHaveBeenCalled();
    expect(deps.hub.publish).not.toHaveBeenCalled();
  });
});

describe("RAU-44 — finish-time live winnings persisted by persistAndPublish", () => {
  /** A finished `next` state (auto-finish: endTurn / TD-on-half-2-turn-8 / endMatch). */
  function finishedNext(overrides: Partial<LiveMatchState> = {}): LiveMatchState {
    const base = fakeRow();
    return {
      ...base,
      status: "finished" as const,
      homeScore: 2,
      awayScore: 1,
      finishedAt: 2000,
      concedeProposedBy: null,
      events: [
        { seq: 6, kind: "endMatch" as const, side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 2000 },
      ],
      ...overrides,
    };
  }

  /** A roll source returning fixed values in call order (home roll, away roll). */
  function fixedRolls(rolls: number[]) {
    let i = 0;
    return () => rolls[i++];
  }

  it("persists deterministic winnings at auto-finish in the SAME tx (1D3 + dedicated fans; makeDeps defaults 2/1)", async () => {
    const { deps, updateMany, liveMatchFindUnique, fixtureFindUnique, teamFindMany } = makeDeps(
      1,
      fixedRolls([1, 3]),
    );
    const current = fakeRow(); // seq 5, live

    await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next: finishedNext(), now: 2000 },
      deps,
    );

    // home FF = roll 1 + fans 2 = 3; away FF = roll 3 + fans 1 = 4.
    // home = ((3+4)/2 + 2 TDs + 0) × 10k = 55k; away = ((4+3)/2 + 1 TD + 0) × 10k = 45k.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 5 },
        data: expect.objectContaining({
          seq: 6,
          status: "finished",
          winnings: { home: 55000, away: 45000 },
        }),
      }),
    );
    // The winnings read the fixture teams + coaching INSIDE the same transaction
    // as the finish event rows.
    expect(liveMatchFindUnique).toHaveBeenCalledWith({
      where: { id: "lm-1" },
      select: { winnings: true },
    });
    expect(fixtureFindUnique).toHaveBeenCalledWith({
      where: { id: "f-1" },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        winnerId: true,
        leagueId: true,
      },
    });
    expect(teamFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["home-t", "away-t"] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
        // RAU-14: the shared select now reads the treasury too (hire balance).
        treasury: true,
        players: { select: { rosterPlayerId: true, valueBonus: true, alive: true, missNextMatch: true } },
      },
    });
  });

  it("assumes heldBall true at live end (no +10k 'never held the ball' bonus)", async () => {
    const { deps, updateMany } = makeDeps(1, fixedRolls([2, 2]));
    const current = fakeRow();

    await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next: finishedNext({ homeScore: 0, awayScore: 0 }), now: 2000 },
      deps,
    );

    // Both FFs roll 2: home 2+2=4, away 2+1=3. Zero TDs + heldBall true →
    // ((4+3)/2 + 0 + 0) × 10k = 35k each (a heldBall false would be 45k).
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ winnings: { home: 35000, away: 35000 } }),
      }),
    );
  });

  it("persists winnings on the concede path (acceptConcedeLiveMatch) with the walkover scores", async () => {
    const { deps, updateMany, liveMatchFindFirst } = makeDeps(1, fixedRolls([2, 1]));
    liveMatchFindFirst.mockResolvedValue({
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 3,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq: 8,
      paused: false,
      clockStartedAt: new Date(1000).toISOString(),
      finishedAt: null,
      concedeProposedBy: "home",
    });

    // Away accepts the home proposal → home 0, away 2 (walkover scores).
    await acceptConcedeLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", homeTeamId: "home-t", awayTeamId: "away-t", leagueId: "l-1", now: 2000 },
      deps,
    );

    // home FF = 2 + 2 = 4; away FF = 1 + 1 = 2. AWAY accepts → AWAY wins the
    // walkover 0-2, and the walkover scoreboard drives the winnings even though
    // the live state's own scoreboard stays 0-0 on a concede:
    // away = ((2+4)/2 + 2 + 0) × 10k = 50k; home = ((4+2)/2 + 0 + 0) × 10k = 30k.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 8 },
        data: expect.objectContaining({ seq: 9, status: "finished", winnings: { home: 30000, away: 50000 } }),
      }),
    );
  });

  it("does NOT recompute or overwrite already-persisted winnings (idempotent)", async () => {
    const { deps, updateMany, liveMatchFindUnique, teamFindMany } = makeDeps(1);
    liveMatchFindUnique.mockResolvedValue({ winnings: { home: 11111, away: 22222 } });
    const current = fakeRow();

    await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next: finishedNext(), now: 2000 },
      deps,
    );

    // The guard short-circuits BEFORE the team/coaching read; the finish write
    // carries no `winnings` key.
    expect(teamFindMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ winnings: expect.anything() }),
      }),
    );
  });

  it("persists nothing on non-finished transitions (no reads, no winnings key)", async () => {
    const { deps, updateMany, liveMatchFindUnique, fixtureFindUnique, teamFindMany } = makeDeps(1);
    const current = fakeRow();
    const next: LiveMatchState = {
      ...current,
      activeSide: "away",
      turnNumber: 2,
      events: [
        { seq: 6, kind: "turn" as const, side: null, playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 2000 },
      ],
    };

    await applyTransition(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next, now: 2000 },
      deps,
    );

    expect(liveMatchFindUnique).not.toHaveBeenCalled();
    expect(fixtureFindUnique).not.toHaveBeenCalled();
    expect(teamFindMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ winnings: expect.anything() }),
      }),
    );
  });
});

/**
 * purchaseInducements (LM-30): a ready-phase cart write for the LOWER-TV side.
 * The server derives each side's TV from the persisted team rows
 * (`raceTvParts` + `computeTeamTv`), gives the |ΔTV| budget to the lower side,
 * validates the cart (IND-3) and REPLACES that side's persisted cart under the
 * optimistic `seq` guard, then publishes the new view to the hub.
 *
 * TV fixtures: home = 8 orc linemen @50k = 400k; away = 5 goblin linemen @40k
 * (=200k) + a 50k player valueBonus = 250k → |ΔTV| = 150k → AWAY is the
 * lower-TV side with a 150k budget (goblin also carries bribery-and-corruption,
 * so bribes cost 50k each).
 */
describe("purchaseInducements — ready-phase cart write (LM-30)", () => {
  const zeroCoaching = { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false };
  const orcTeam = {
    id: "home-t",
    raceId: "orc",
    roster: Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, name: `Orc ${i}`, positionalKey: "lineman" })),
    coaching: zeroCoaching,
    treasury: 1_000_000,
    players: [],
  };
  const goblinTeam = {
    id: "away-t",
    raceId: "goblin",
    roster: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, name: `Goblin ${i}`, positionalKey: "goblin-lineman" })),
    coaching: zeroCoaching,
    treasury: 1_000_000,
    players: [{ rosterPlayerId: "g1", valueBonus: 50_000, alive: true, missNextMatch: false }],
  };
  /** home = away TV (both 400k) → equal TVs, zero budget, no eligible side. */
  const equalTeams = [orcTeam, { ...orcTeam, id: "away-t" }];

  function readyRow(seq: number, inducements: unknown = null): Record<string, unknown> {
    return {
      id: "lm-1",
      fixtureId: "f-1",
      status: "ready",
      half: 1,
      turnNumber: 1,
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: null,
      homeTurnMs: 0,
      awayTurnMs: 0,
      homeScore: 0,
      awayScore: 0,
      seq,
      paused: false,
      clockStartedAt: null,
      finishedAt: null,
      concedeProposedBy: null,
      mvpNominations: null,
      resolutionState: null,
      lastTurnReason: null,
      inducements,
    };
  }

  function rowOf(overrides: Record<string, unknown>): Record<string, unknown> {
    return { ...readyRow(5), ...overrides };
  }

  const baseInput = {
    fixtureId: "f-1",
    homeTeamId: "home-t",
    awayTeamId: "away-t",
    side: "away" as const,
    items: [{ id: "bribes", count: 3 }],
    now: 2000,
  };

  it("404s when no LiveMatch row exists (no cart write)", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    await expect(purchaseInducements(baseInput, deps)).rejects.toMatchObject({ status: 404 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("409s unless the match is ready (pending/live rows are rejected)", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(rowOf({ status: "pending" }));
    await expect(purchaseInducements(baseInput, deps)).rejects.toMatchObject({ status: 409 });
    liveMatchFindFirst.mockResolvedValue(rowOf({ status: "live" }));
    await expect(purchaseInducements(baseInput, deps)).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("persists the lower-TV side's cart (replace semantics) and publishes the new view", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(readyRow(5));
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);

    const result = await purchaseInducements(baseInput, deps);

    expect(result.seq).toBe(6);
    expect(result.view.inducements).toEqual({ home: [], away: [{ id: "bribes", count: 3 }] });
    // The dedicated row-scoped write touches ONLY the cart column + the seq bump.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: { inducements: { home: [], away: [{ id: "bribes", count: 3 }] }, seq: 6 },
    });
    // Hub publish after commit: the view carries the cart + no events.
    expect(publish).toHaveBeenCalledTimes(1);
    const payload = publish.mock.calls[0];
    expect(payload[0]).toBe("f-1");
    expect(payload[1]).toMatchObject({ seq: 6, inducements: { home: [], away: [{ id: "bribes", count: 3 }] }, events: [] });
  });

  it("gives the |ΔTV| budget to the lower side (away 150k here — bribes @ 50k fit)", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, updateMany } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(readyRow(5));
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);
    // 3 bribes @ 50k = exactly the 150k |ΔTV| budget → accepted.
    await expect(purchaseInducements(baseInput, deps)).resolves.toMatchObject({ seq: 6 });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("409s the higher-TV or equal-TV side (only the lower-TV coach may buy)", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(readyRow(5));
    // Higher-TV side (home, 400k) tries to buy on its own team.
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);
    await expect(
      purchaseInducements({ ...baseInput, side: "home" }, deps),
    ).rejects.toMatchObject({ status: 409 });
    // Equal TVs (both 400k) → no eligible side, even for a would-be away buyer.
    teamFindMany.mockResolvedValue(equalTeams);
    await expect(purchaseInducements(baseInput, deps)).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rejects an over-budget / invalid cart with 400 and no mutation", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(readyRow(5));
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);
    // 2× extra-training @ 100k = 200k > 150k budget.
    await expect(
      purchaseInducements({ ...baseInput, items: [{ id: "extra-training", count: 2 }] }, deps),
    ).rejects.toMatchObject({ status: 400 });
    // Unknown id.
    await expect(
      purchaseInducements({ ...baseInput, items: [{ id: "star-player-griff", count: 1 }] }, deps),
    ).rejects.toMatchObject({ status: 400 });
    // Rule-gated entry for an ineligible race (plague-doctor for goblin).
    await expect(
      purchaseInducements({ ...baseInput, items: [{ id: "plague-doctor", count: 1 }] }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("REPLACES the side's cart while preserving the rival side's persisted cart", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(
      readyRow(5, { home: [{ id: "bribes", count: 1 }], away: [] }),
    );
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);

    await purchaseInducements(
      { ...baseInput, items: [{ id: "biased-referee", count: 1 }] },
      deps,
    );

    // away REPLACED; the rival's home cart survives untouched.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: {
        inducements: { home: [{ id: "bribes", count: 1 }], away: [{ id: "biased-referee", count: 1 }] },
        seq: 6,
      },
    });
    expect(publish).toHaveBeenCalledTimes(1);

    // An EMPTY list clears the side's cart (replace-cart), again keeping home.
    liveMatchFindFirst.mockResolvedValue(
      readyRow(5, { home: [{ id: "bribes", count: 1 }], away: [{ id: "biased-referee", count: 1 }] }),
    );
    updateMany.mockClear();
    await purchaseInducements({ ...baseInput, items: [] }, deps);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: { inducements: { home: [{ id: "bribes", count: 1 }], away: [] }, seq: 6 },
    });
  });

  it("409s on a stale seq (0 rows → concurrent purchase/begin won the race)", async () => {
    const { deps, liveMatchFindFirst, teamFindMany, publish } = makeDeps(0);
    liveMatchFindFirst.mockResolvedValue(readyRow(5));
    teamFindMany.mockResolvedValue([orcTeam, goblinTeam]);
    await expect(purchaseInducements(baseInput, deps)).rejects.toMatchObject({ status: 409 });
    expect(publish).not.toHaveBeenCalled();
  });
});
