import { describe, expect, it, vi } from "vitest";
import {
  startLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
  liveMatchRowToState,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatchState, TeamSide } from "./liveMatch";

/**
 * Store tests — optimistic `seq` guard (409 on 0 rows), atomic event append,
 * and publish-after-commit. `prisma` and `hub` are injected (fake deps) so the
 * store logic is fully deterministic (no DB, no timers).
 */

const league = { turnClockEnabled: true, turnClockSeconds: 240 as const };

function fakeRow(): LiveMatchState {
  return {
    seq: 5,
    status: "live" as const,
    half: 1,
    turnNumber: 1,
    activeSide: "home" as TeamSide,
    homeClock: 240,
    awayClock: 240,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: 1000,
    finishedAt: null,
    league,
    events: [],
  };
}

function makeDeps(updateCount: number): {
  deps: StoreDeps;
  updateMany: ReturnType<typeof vi.fn>;
  liveEventCreate: ReturnType<typeof vi.fn>;
  liveMatchCreate: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
} {
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  const liveEventCreate = vi.fn().mockResolvedValue({ id: "ev-1" });
  const liveMatchCreate = vi.fn();
  const publish = vi.fn();
  const tx = {
    liveMatch: { updateMany, create: liveMatchCreate },
    liveEvent: { create: liveEventCreate },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const deps: StoreDeps = {
    prisma: { $transaction, liveMatch: { create: liveMatchCreate } },
    hub: { publish },
  };
  return { deps, updateMany, liveEventCreate, liveMatchCreate, publish };
}

describe("liveMatchRowToState", () => {
  it("maps a LiveMatch row to a pure state and converts timestamps to epoch ms", () => {
    const state = liveMatchRowToState(
      {
        id: "lm-1",
        fixtureId: "f-1",
        status: "live",
        half: 1,
        turnNumber: 1,
        activeSide: "home",
        homeClock: 240,
        awayClock: 240,
        homeScore: 0,
        awayScore: 0,
        seq: 5,
        paused: false,
        clockStartedAt: new Date(1000),
        finishedAt: null,
      },
      league,
    );
    expect(state.seq).toBe(5);
    expect(state.activeSide).toBe("home");
    expect(state.clockStartedAt).toBe(1000);
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
          kind: "turn",
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
      { liveMatchId: "lm-1", fixtureId: "f-1", current, next, league, now: 2000 },
      deps,
    );

    // Optimistic guard: WHERE seq = prev (5), data bumps to 6.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, activeSide: "away", turnNumber: 2 }),
    });
    // The delta event (seq 6) is created in the SAME transaction.
    expect(liveEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ liveMatchId: "lm-1", seq: 6, kind: "turn" }),
      }),
    );
    // Publish happens AFTER commit (after the $transaction resolves).
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ seq: 6 }));
    expect(result).not.toBeNull();
  });

  it("rejects with 409 (double-action) when updateMany reports 0 rows and creates/publishes nothing", async () => {
    const { deps, liveEventCreate, publish } = makeDeps(0);
    const current = fakeRow();

    await expect(
      applyTransition({ liveMatchId: "lm-1", fixtureId: "f-1", current, next: current, league, now: 2000 }, deps),
    ).rejects.toMatchObject({ status: 409 });

    expect(liveEventCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("startLiveMatch — start guard + insert + publish", () => {
  it("creates the LiveMatch row and start event and publishes the initial live view", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    liveMatchCreate.mockResolvedValue({ id: "lm-new" });

    const result = await startLiveMatch(
      { fixtureId: "f-1", fixture: { scheduled: true, played: false, result: false }, league, now: 500 },
      deps,
    );

    expect(liveMatchCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fixtureId: "f-1", status: "live", homeClock: 240 }),
      }),
    );
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ status: "live" }));
    expect(result.liveMatchId).toBe("lm-new");
  });

  it("rejects starting a played/result fixture (409 start guard)", async () => {
    const { deps, liveMatchCreate, publish } = makeDeps(1);
    await expect(
      startLiveMatch(
        { fixtureId: "f-1", fixture: { scheduled: true, played: true, result: false }, league, now: 500 },
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(liveMatchCreate).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("pauseLiveMatch / resumeLiveMatch — disconnect grace (LM-7)", () => {
  it("persists paused with a nulled clockStartedAt and publishes (grace expiry)", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const current = fakeRow(); // not paused, seq 5

    await pauseLiveMatch(
      { liveMatchId: "lm-1", fixtureId: "f-1", current, league, now: 2000 },
      deps,
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, paused: true, clockStartedAt: null }),
    });
    expect(publish).toHaveBeenCalledWith("f-1", expect.objectContaining({ paused: true }));
  });

  it("is a no-op when already paused (no seq bump, no publish)", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const alreadyPaused = { ...fakeRow(), paused: true, clockStartedAt: null };

    await pauseLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", current: alreadyPaused, league, now: 2000 }, deps);

    expect(updateMany).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("resumes on reconnect: clears pause, restarts the clock at now, publishes", async () => {
    const { deps, updateMany, publish } = makeDeps(1);
    const paused = { ...fakeRow(), paused: true, clockStartedAt: null };

    await resumeLiveMatch({ liveMatchId: "lm-1", fixtureId: "f-1", current: paused, league, now: 3000 }, deps);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "lm-1", seq: 5 },
      data: expect.objectContaining({ seq: 6, paused: false, clockStartedAt: new Date(3000) }),
    });
    expect(publish).toHaveBeenCalled();
  });
});
