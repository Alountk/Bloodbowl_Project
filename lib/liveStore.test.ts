import { describe, expect, it, vi } from "vitest";
import {
  consentLiveMatch,
  retractLiveConsent,
  beginLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
  proposeConcedeLiveMatch,
  declineConcedeLiveMatch,
  acceptConcedeLiveMatch,
  proposeCasualtyLiveMatch,
  confirmCasualtyLiveMatch,
  liveMatchRowToState,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatchState, TeamSide } from "./liveMatch";

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
    pendingCasualty: null,
    mvpNominations: { home: null, away: null },
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
    liveMatch: { updateMany, create: liveMatchCreate, findUnique: liveMatchFindUnique },
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
      liveMatch: { create: liveMatchCreate, findFirst: liveMatchFindFirst },
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
      pendingCasualty: null,
      mvpNominations: null,
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
      pendingCasualty: null,
      mvpNominations: null,
    });
    expect(state.concedeProposedBy).toBe("home");
  });

  it("maps a persisted pendingCasualty JSON value onto the pure state and nulls malformed JSON (RAU-39)", () => {
    const base = {
      id: "lm-1",
      fixtureId: "f-1",
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "home",
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
      concedeProposedBy: null,
      mvpNominations: null,
    } as const;
    const parsed = liveMatchRowToState({
      ...base,
      pendingCasualty: { proposerSide: "home", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13, roll6: 4 },
    });
    expect(parsed.pendingCasualty).toEqual({
      proposerSide: "home",
      victimRosterId: "p9",
      causerRosterId: "p1",
      cause: "blitz",
      roll16: 13,
      roll6: 4,
    });
    // Malformed JSON (not an object / missing fields) collapses to null — never crash.
    expect(liveMatchRowToState({ ...base, pendingCasualty: "garbage" }).pendingCasualty).toBeNull();
    expect(liveMatchRowToState({ ...base, pendingCasualty: { proposerSide: "nope", victimRosterId: 1 } }).pendingCasualty).toBeNull();
    expect(liveMatchRowToState({ ...base, pendingCasualty: null }).pendingCasualty).toBeNull();
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
      pendingCasualty: null,
      mvpNominations: { home: ["h1", "h2", "h3", "h4", "h5", "h6"], away: null },
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
      pendingCasualty: null,
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
      pendingCasualty: null,
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
          pendingCasualty: null,
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
      pendingCasualty: null,
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

describe("proposeCasualtyLiveMatch — persists pendingCasualty under the seq guard (RAU-39)", () => {
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
      pendingCasualty: null,
      ...overrides,
    };
  }

  const proposal = {
    liveMatchId: "lm-1",
    fixtureId: "f-1",
    side: "home" as const,
    victimRosterId: "p9",
    causerRosterId: "p1",
    cause: "blitz" as const,
    roll16: 13,
    roll6: 4,
    now: 2000,
  };

  it("persists pendingCasualty = the proposal, bumps the seq and publishes", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(liveRow());

    const result = await proposeCasualtyLiveMatch(proposal, deps);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 5 },
        data: expect.objectContaining({
          seq: 6,
          pendingCasualty: { proposerSide: "home", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13, roll6: 4 },
        }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 6, pendingCasualty: expect.objectContaining({ proposerSide: "home" }) }),
    );
    expect(result.view.pendingCasualty).toEqual(expect.objectContaining({ victimRosterId: "p9" }));
  });

  it("maps a state-machine rejection (double-propose / non-live / non-active) to 409 with no mutation", async () => {
    const { deps, liveMatchFindFirst, updateMany, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(
      liveRow({ pendingCasualty: { proposerSide: "home", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13 } }),
    );

    await expect(proposeCasualtyLiveMatch(proposal, deps)).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns 404 when no LiveMatch row exists", async () => {
    const { deps } = makeDeps(1);
    await expect(proposeCasualtyLiveMatch(proposal, deps)).rejects.toMatchObject({ status: 404 });
  });
});

describe("confirmCasualtyLiveMatch — persists the casualty event atomically and clears the proposal (RAU-39)", () => {
  /** Home proposed a blitz casualty (roll16 13 → permanent, roll6 4 → ps). */
  const pendingRow = {
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
    pendingCasualty: { proposerSide: "home", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13, roll6: 4 },
  };

  it("persists the casualty event + pendingCasualty null in the SAME transaction, then publishes", async () => {
    const { deps, liveMatchFindFirst, updateMany, liveEventCreate, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);

    const result = await confirmCasualtyLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 },
      deps,
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1", seq: 5 },
        data: expect.objectContaining({ seq: 6, pendingCasualty: null }),
      }),
    );
    // The casualty event row commits atomically with the cleared proposal.
    expect(liveEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          liveMatchId: "lm-1",
          seq: 6,
          kind: "casualty",
          side: "away",
          playerRosterId: "p9",
          payload: {
            victimRosterId: "p9",
            causerRosterId: "p1",
            cause: "blitz",
            roll16: 13,
            roll6: 4,
            band: "permanent",
            permanentAttribute: "ps",
          },
        }),
      }),
    );
    expect(publish).toHaveBeenCalledWith(
      "f-1",
      expect.objectContaining({ seq: 6, pendingCasualty: null }),
    );
    expect(result.view.pendingCasualty).toBeNull();
  });

  it("maps a confirm with no pending proposal / proposer-self to 409 with no mutation", async () => {
    const { deps, liveMatchFindFirst, updateMany, liveEventCreate, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue({ ...pendingRow, pendingCasualty: null });

    await expect(
      confirmCasualtyLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 }, deps),
    ).rejects.toMatchObject({ status: 409 });
    expect(updateMany).not.toHaveBeenCalled();
    expect(liveEventCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("rolls back the whole transaction when the event row fails (atomicity)", async () => {
    const { deps, liveMatchFindFirst, liveEventCreate, publish } = makeDeps(1);
    liveMatchFindFirst.mockResolvedValue(pendingRow);
    liveEventCreate.mockRejectedValue(Object.assign(new Error("db down"), { code: "P2028" }));

    await expect(
      confirmCasualtyLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away", now: 2500 }, deps),
    ).rejects.toMatchObject({ code: "P2028" });
    expect(publish).not.toHaveBeenCalled();
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
      pendingCasualty: null,
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
      },
    });
    expect(teamFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["home-t", "away-t"] } },
      select: {
        id: true,
        raceId: true,
        roster: true,
        coaching: true,
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
      pendingCasualty: null,
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
