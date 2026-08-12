import { describe, expect, it, vi } from "vitest";
import {
  consentLiveMatch,
  retractLiveConsent,
  beginLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
  liveMatchRowToState,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatchState, TeamSide } from "./liveMatch";

/**
 * Store tests — consent/begin persistence (D16), optimistic `seq` guard (409 on
 * 0 rows), atomic event append, publish-after-commit, and the repurposed
 * pause/resume unified-clock segment handling (LM-7).
 */

const scheduledFixture = { scheduled: true, played: false, result: false };
const playedFixture = { scheduled: true, played: true, result: false };

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
    events: [],
  };
}

function makeDeps(updateCount: number): {
  deps: StoreDeps;
  updateMany: ReturnType<typeof vi.fn>;
  liveEventCreate: ReturnType<typeof vi.fn>;
  liveMatchCreate: ReturnType<typeof vi.fn>;
  liveMatchFindFirst: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
} {
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  const liveEventCreate = vi.fn().mockResolvedValue({ id: "ev-1" });
  const liveMatchCreate = vi.fn();
  const liveMatchFindFirst = vi.fn().mockResolvedValue(null);
  const publish = vi.fn();
  const tx = {
    liveMatch: { updateMany, create: liveMatchCreate },
    liveEvent: { create: liveEventCreate },
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
  };
  return { deps, updateMany, liveEventCreate, liveMatchCreate, liveMatchFindFirst, publish };
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
    });
    expect(state.status).toBe("ready");
    expect(state.homeConsented).toBe(true);
    expect(state.awayConsented).toBe(false);
    expect(state.startedAt).toBeNull();
    expect(state.homeTurnMs).toBe(0);
    expect(state.awayTurnMs).toBe(0);
  });
});

describe("consentLiveMatch — create-on-first-consent, ready on second (LM-11, D16)", () => {
  it("creates the LiveMatch row with the consent boolean on the FIRST coach's consent", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    liveMatchCreate.mockResolvedValue({ id: "lm-new" });

    const result = await consentLiveMatch(
      { fixtureId: "f-1", fixture: scheduledFixture, side: "home", now: 500 },
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
      { fixtureId: "f-1", fixture: scheduledFixture, side: "away", now: 600 },
      deps,
    );

    expect(liveMatchCreate).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lm-1", seq: 1 } }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "ready", homeConsented: true, awayConsented: true, seq: 2 }));
    expect(result.liveMatchId).toBe("lm-1");
  });

  it("rejects consent on a played/result-loaded fixture with 409 and creates nothing", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    await expect(
      consentLiveMatch({ fixtureId: "f-1", fixture: playedFixture, side: "home", now: 500 }, deps),
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
