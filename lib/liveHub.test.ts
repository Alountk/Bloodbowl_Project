import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createLiveHub, type HubSubscriber, type SubscribeInput } from "./liveHub";

/**
 * Hub unit tests — subscribe/publish fan-out, active-coach tracking with a 10s
 * grace pause, 1s ticker gated on the league's turn-clock option, and "publish
 * only when subs exist". The store/persistence seam is deferred to PR 3, so the
 * hub here is the narrow fan-out + ticker + grace skeleton the slice-2 SSE
 * route consumes.
 */

const configEnabled = { turnClockEnabled: true, turnClockSeconds: 240 };
const configDisabled = { turnClockEnabled: false, turnClockSeconds: 240 };

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
    channel: configEnabled,
    subscriber,
    onGraceExpired,
    ...overrides,
  });
  return { subscriber, onGraceExpired, dispose };
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

describe("liveHub — active-coach tracking + 10s grace", () => {
  let hub: ReturnType<typeof createLiveHub>;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createLiveHub();
  });
  afterEach(() => vi.useRealTimers());

  it("fires the fixture grace handler once when the active coach's last connection drops and the 10s window expires", () => {
    const graceHandler = vi.fn();
    // The fixture-level grace handler is set by the route's subscribe.
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

    // Active coach reconnects before the grace window closes.
    subscribeFor(hub, { coachId: "coach-a", onGraceExpired: graceHandler });
    vi.advanceTimersByTime(20_000);
    // The re-arm on reconnect is cancelled: no expiry fires.
    expect(graceHandler).not.toHaveBeenCalled();
  });

  it("never arms a grace timer when the league option disables clocks", () => {
    const graceHandler = vi.fn();
    const coachA = subscribeFor(hub, { channel: configDisabled, onGraceExpired: graceHandler });
    coachA.dispose();
    vi.advanceTimersByTime(30_000);
    // On a clocks-disabled league, no grace pause applies (LM-7).
    expect(graceHandler).not.toHaveBeenCalled();
  });
});

describe("liveHub — 1s ticker gated on the clock option", () => {
  let hub: ReturnType<typeof createLiveHub>;

  beforeEach(() => {
    vi.useFakeTimers();
    hub = createLiveHub();
  });
  afterEach(() => vi.useRealTimers());

  it("publishes a clock tick every second while the option is enabled", () => {
    const a = subscribeFor(hub);
    hub.startTicking("f-1", { seq: 10, activeSide: "home", homeClock: 240, awayClock: 240 });

    vi.advanceTimersByTime(1_000);
    // Active home clock decrements; away clock is untouched. The hub emits the
    // new server-derived clock values; the DB seq for the tick is attached by
    // the store when it persists (PR 3), never fabricated here (LM-6).
    expect(a.subscriber.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "tick",
        activeSide: "home",
        homeClock: 239,
        awayClock: 240,
      }),
    );
    expect(a.subscriber.notify.mock.calls[0][0]?.seq).toBe(10); // unchanged input seq
  });

  it("never ticks and never advances clocks when the option is disabled", () => {
    const a = subscribeFor(hub, { channel: configDisabled });
    hub.startTicking("f-2", { seq: 1, activeSide: "away", homeClock: 120, awayClock: 120 });
    vi.advanceTimersByTime(5_000);
    expect(a.subscriber.notify).not.toHaveBeenCalled();
  });

  it("stops ticking after stopTicking", () => {
    const a = subscribeFor(hub);
    hub.startTicking("f-1", { seq: 0, activeSide: "home", homeClock: 240, awayClock: 240 });
    vi.advanceTimersByTime(1_000);
    expect(a.subscriber.notify).toHaveBeenCalledTimes(1);

    hub.stopTicking("f-1");
    vi.advanceTimersByTime(3_000);
    expect(a.subscriber.notify).toHaveBeenCalledTimes(1);
  });

  it("fires onClockExpired once and stops ticking when the active clock reaches 0 (D4)", () => {
    subscribeFor(hub);
    const onClockExpired = vi.fn();
    // Active home clock starts at 1 → the next tick takes it to 0.
    hub.startTicking("f-1", { seq: 0, activeSide: "home", homeClock: 1, awayClock: 240 }, onClockExpired);

    vi.advanceTimersByTime(1_000);
    // The clock hit 0 → the auto-end seam fired exactly once.
    expect(onClockExpired).toHaveBeenCalledTimes(1);
    expect(onClockExpired).toHaveBeenCalledWith("f-1");
    // Further time does NOT re-fire (the ticker stopped; the caller restarts it).
    vi.advanceTimersByTime(3_000);
    expect(onClockExpired).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClockExpired while the active clock still has time", () => {
    subscribeFor(hub);
    const onClockExpired = vi.fn();
    hub.startTicking("f-1", { seq: 0, activeSide: "home", homeClock: 240, awayClock: 240 }, onClockExpired);
    vi.advanceTimersByTime(1_000);
    expect(onClockExpired).not.toHaveBeenCalled();
  });
});
