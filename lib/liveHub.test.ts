import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createLiveHub, type HubSubscriber, type SubscribeInput, type TickSnapshot } from "./liveHub";

/**
 * Hub unit tests — subscribe/publish fan-out, active-coach tracking with a 10s
 * grace pause (LM-7, unconditional on the removed clock option), and the 1s
 * ticker that derives + publishes the ACTIVE side's accumulation (LM-5,
 * informational: never auto-ends, no `onClockExpired`).
 */

function makeSubscriber(): HubSubscriber & { notify: Mock } {
  return { notify: vi.fn() };
}

function subscribeFor(
  hub: ReturnType<typeof createLiveHub>,
  overrides: Partial<SubscribeInput> = {},
): { subscriber: HubSubscriber & { notify: Mock }; onGraceExpired: Mock; dispose: () => void } {
  const subscriber = (overrides.subscriber ?? makeSubscriber()) as HubSubscriber & { notify: Mock };
  const onGraceExpired = (overrides.onGraceExpired ?? vi.fn()) as Mock;
  const dispose = hub.subscribe({
    fixtureId: "f-1",
    coachId: "coach-a",
    activeCoachId: "coach-a",
    subscriber,
    onGraceExpired,
    ...overrides,
  });
  return { subscriber, onGraceExpired, dispose };
}

function liveSnapshot(overrides: Partial<TickSnapshot> = {}): TickSnapshot {
  return {
    seq: 10,
    status: "live",
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: 0,
    homeTurnMs: 5000,
    awayTurnMs: 3000,
    homeScore: 0,
    awayScore: 0,
    finishedAt: null,
    paused: false,
    clockStartedAt: 1000,
    ...overrides,
  };
}

describe("liveHub — subscribe/publish fan-out", () => {
  const hub = createLiveHub();

  it("fans a publish out to every subscriber of that fixture", () => {
    const a = subscribeFor(hub);
    const b = subscribeFor(hub);

    hub.publish("f-1", { seq: 1, status: "live" });

    expect(a.subscriber.notify).toHaveBeenCalledWith({ seq: 1, status: "live" });
    expect(b.subscriber.notify).toHaveBeenCalledWith({ seq: 1, status: "live" });
  });

  it("publishes only to the fixture's channel (no cross-fixture leakage)", () => {
    const a = subscribeFor(hub, { fixtureId: "f-1" });
    hub.publish("f-2", { seq: 99 });
    expect(a.subscriber.notify).not.toHaveBeenCalled();
  });

  it("is a no-op when a fixture has no subscribers", () => {
    const a = subscribeFor(hub);
    a.dispose();
    expect(() => hub.publish("f-1", { seq: 2 })).not.toThrow();
    expect(a.subscriber.notify).not.toHaveBeenCalled();
  });

  it("removes only the unsubscribed subscriber", () => {
    const a = subscribeFor(hub);
    const b = subscribeFor(hub);
    a.dispose();
    hub.publish("f-1", { seq: 5 });
    expect(a.subscriber.notify).not.toHaveBeenCalled();
    expect(b.subscriber.notify).toHaveBeenCalledWith({ seq: 5 });
  });
});

describe("liveHub — active-coach tracking + 10s grace (LM-7, unconditional)", () => {
  let hub: ReturnType<typeof createLiveHub>;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createLiveHub();
  });
  afterEach(() => vi.useRealTimers());

  it("fires the fixture grace handler once when the active coach's last connection drops and the 10s window expires", () => {
    const graceHandler = vi.fn();
    const spectator = subscribeFor(hub, {
      coachId: "coach-b",
      onGraceExpired: graceHandler,
    });
    const active = subscribeFor(hub, {
      coachId: "coach-a",
      onGraceExpired: graceHandler,
    });

    active.dispose(); // active coach hangs up; spectator stays connected

    expect(graceHandler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(9_999);
    expect(graceHandler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); // t=10s → grace expires, exactly once
    expect(graceHandler).toHaveBeenCalledTimes(1);
    expect(spectator.subscriber.notify).not.toHaveBeenCalled();
  });

  it("cancels the grace timer when the active coach reconnects within 10s", () => {
    const graceHandler = vi.fn();
    const active = subscribeFor(hub, { onGraceExpired: graceHandler });
    active.dispose();
    vi.advanceTimersByTime(5_000);

    subscribeFor(hub, { coachId: "coach-a", onGraceExpired: graceHandler });
    vi.advanceTimersByTime(20_000);
    // The re-arm on reconnect is cancelled: no expiry fires.
    expect(graceHandler).not.toHaveBeenCalled();
  });
});

describe("liveHub — 1s ticker derives + publishes the active side's accumulation", () => {
  let hub: ReturnType<typeof createLiveHub>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    hub = createLiveHub();
  });
  afterEach(() => vi.useRealTimers());

  it("publishes a clock tick every second that accumulates the ACTIVE side's time, without auto-ending", () => {
    const a = subscribeFor(hub);
    // clockStartedAt = 10_000 (system time base); advancing 1s adds 1000ms in-flight.
    hub.startTicking("f-1", liveSnapshot({ clockStartedAt: 10_000 }) as never);

    vi.advanceTimersByTime(1_000);

    expect(a.subscriber.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tick",
        activeSide: "home",
        awayTurnMs: 3000,
        seq: 10,
      }),
    );
    const tick = a.subscriber.notify.mock.calls[0][0];
    expect(tick.homeTurnMs).toBe(6000); // 5000 persisted + 1000ms in-flight
  });

  it("never stops on zero (LM-5 informational — no auto-end) and keeps publishing", () => {
    const a = subscribeFor(hub);
    hub.startTicking("f-1", liveSnapshot() as never);
    vi.advanceTimersByTime(10_000); // run far beyond any former per-turn limit
    expect(a.subscriber.notify).toHaveBeenCalledTimes(10); // still ticking, never auto-ends
  });

  it("stops ticking after stopTicking", () => {
    const a = subscribeFor(hub);
    hub.startTicking("f-1", liveSnapshot() as never);
    vi.advanceTimersByTime(1_000);
    expect(a.subscriber.notify).toHaveBeenCalledTimes(1);

    hub.stopTicking("f-1");
    vi.advanceTimersByTime(3_000);
    expect(a.subscriber.notify).toHaveBeenCalledTimes(1);
  });

  it("publishes a paused clock without accumulating in-flight time", () => {
    const a = subscribeFor(hub);
    hub.startTicking("f-1", liveSnapshot({ paused: true, clockStartedAt: null, homeTurnMs: 5000 }) as never);
    vi.advanceTimersByTime(1_000);
    const last = a.subscriber.notify.mock.calls.at(-1)?.[0];
    expect(last.homeTurnMs).toBe(5000); // no in-flight while paused
    expect(last.paused).toBe(true);
  });
});
