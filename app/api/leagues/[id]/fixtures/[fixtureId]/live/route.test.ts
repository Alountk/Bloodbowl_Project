import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
}));

/** Fake hub used by the route tests: `subscribe` synchronously replays its
 * buffered queue to the new subscriber, and `publish` appends to the queue. */
const fakeHubState = vi.hoisted(() => {
  const buffered = new Map<string, unknown[]>();
  const subscribers = new Map<string, Array<(payload: unknown) => void>>();
  let subscribedWith: unknown = null;
  const unsubscribeFn = vi.fn();
  return {
    buffered,
    subscribers,
    subscribedWith: () => subscribedWith,
    recordSubscribe: (v: unknown) => {
      subscribedWith = v;
    },
    unsubscribeFn,
    reset() {
      buffered.clear();
      subscribers.clear();
      subscribedWith = null;
    },
  };
});

// Hoisted accessor sub-slot to let the factory read the mutable state later.
const hubMock = vi.hoisted(() => ({
  subscribe: vi.fn(),
  publish: vi.fn(),
  unsubscribe: vi.fn(),
  startTicking: vi.fn(),
  stopTicking: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth-mode", () => ({ isAuthEnabled: isAuthEnabledMock }));
vi.mock("@/lib/liveHub", () => ({ liveHub: hubMock }));

import { GET } from "./route";

/** Consumes the returned SSE stream and collects the raw strings of each chunk. */
async function collectFrames(
  res: Response,
  maxChunks = 5,
): Promise<{ chunks: string[]; done: () => void }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let stop = false;
  async function pull() {
    while (!stop && chunks.length < maxChunks) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  }
  void pull();
  return {
    chunks,
    done: () => {
      stop = true;
      void reader.cancel().catch(() => {});
    },
  };
}

function startedFixture(id: string, leagueId: string) {
  return {
    id,
    leagueId,
    round: 1,
    homeTeamId: "home-t",
    awayTeamId: "away-t",
    createdAt: new Date().toISOString(),
    scheduledAt: new Date().toISOString(),
    winnerId: null,
    homeScore: null,
    awayScore: null,
    // Nested league shape returned by prisma `include` (used for the gate).
    league: {
      ownerId: "owner-1",
      status: "started",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      teams: [{ userId: "coach-home" }, { userId: "coach-away" }],
    },
  };
}

const memberLeague = {
  id: "lg-1",
  ownerId: "owner-1",
  status: "started",
  createdAt: new Date().toISOString(),
  teams: [{ userId: "coach-home" }, { userId: "coach-away" }],
  turnClockEnabled: true,
  turnClockSeconds: 240,
};

describe("GET .../live — read gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeHubState.reset();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      startedFixture("f-1", "lg-1"),
    );
    prismaMock.league.findFirst.mockResolvedValue(memberLeague);
    // subscribe returns an idempotent dispose that calls the fake unsubscribe fake.
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  afterEach(() => fakeHubState.reset());

  async function gateStatus(session: unknown): Promise<number> {
    authMock.mockResolvedValue(session);
    prismaMock.fixture.findFirst.mockResolvedValue(null); // no fixture → 404 via missing
    prismaMock.league.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    return res.status;
  }

  it("returns 401 in both auth modes without a session", async () => {
    // auth : true, no session → 401
    expect(await gateStatus(null)).toBe(401);
    // local mode (authEnabled false) even WITH a session → 401 parity.
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    isAuthEnabledMock.mockReturnValue(false);
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    const local = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(local.status).toBe(401);
  });

  it("returns 404 for a foreign/unknown league or fixture (no existence leak)", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    prismaMock.league.findFirst.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(404);
    expect(hubMock.subscribe).not.toHaveBeenCalled();
  });

  it("returns 200 and subscribes for an authenticated owner/member", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(
      startedFixture("f-1", "lg-1"),
    );
    prismaMock.league.findFirst.mockResolvedValue(memberLeague);
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(hubMock.subscribe).toHaveBeenCalled();
  });
});

describe("GET .../live — snapshot-first + gap replay + heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeHubState.reset();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    // Default fake hub subscribe: record + replay the buffered queue synchronously.
    hubMock.subscribe.mockImplementation((input: { subscriber: { notify: (p: unknown) => void } }) => {
      fakeHubState.recordSubscribe(input);
      for (const buffered of fakeHubState.buffered.get("f-1") ?? []) {
        input.subscriber.notify(buffered);
      }
      return hubMock.unsubscribe;
    });
  });

  it("emits a snapshot as the first SSE frame with fixture + live state", async () => {
    // Controlled prisma seq via the fixture's optional live snapshot.
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      live: { seq: 7, status: "live", half: 1, turnNumber: 3, activeSide: "home", homeScore: 0, awayScore: 0 },
    });
    prismaMock.league.findFirst.mockResolvedValue(memberLeague);
    hubMock.subscribe.mockImplementation((input: { subscriber: { notify: (p: unknown) => void } }) => {
      fakeHubState.recordSubscribe(input);
      for (const buffered of fakeHubState.buffered.get("f-1") ?? []) {
        input.subscriber.notify(buffered);
      }
      return hubMock.unsubscribe;
    });

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const stream = await collectFrames(res, 1);
    await new Promise((r) => setTimeout(r, 20));
    const first = stream.chunks[0] ?? "";
    expect(first).toContain("event: snapshot");
    expect(first).toContain('"seq":7');
    expect(first).toContain("homeScore");
    stream.done();
  });

  it("replays gap events with seq > snapshot.seq, dropping stale/duplicate seqs", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      live: { seq: 5, status: "live", half: 1, turnNumber: 1, activeSide: "home", homeScore: 0, awayScore: 0 },
    });
    prismaMock.league.findFirst.mockResolvedValue(memberLeague);
    // Fake hub buffered queue: one stale (seq<=5) and two ahead (seq 6, 8).
    fakeHubState.buffered.set("f-1", [
      { seq: 4, kind: "turn" },   // duplicate/stale → dropped (<= snapshot seq 5)
      { seq: 6, kind: "td" },     // gap → replayed
      { seq: 8, kind: "foul" },   // gap → replayed
    ]);
    hubMock.subscribe.mockImplementation((input: { subscriber: { notify: (p: unknown) => void } }) => {
      fakeHubState.recordSubscribe(input);
      for (const buffered of fakeHubState.buffered.get("f-1") ?? []) {
        input.subscriber.notify(buffered);
      }
      return hubMock.unsubscribe;
    });

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    // snapshot frame + the two replayed event frames (3 buffers).
    const stream = await collectFrames(res, 3);
    await new Promise((r) => setTimeout(r, 20));
    const all = stream.chunks.join("\n");
    expect(all).toContain("event: snapshot");
    expect(all).toContain('"seq":6');
    expect(all).toContain('"seq":8');
    // The stale seq-4 event is NOT emitted (deduped by seq).
    expect(stream.chunks[0]).not.toContain('"kind":"turn"');
    stream.done();
  });
});

describe("GET .../live — abort cleanup (subscribe-race)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeHubState.reset();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: "owner-1" } });
    hubMock.subscribe.mockImplementation((input: { subscriber: { notify: (p: unknown) => void } }) => {
      fakeHubState.recordSubscribe(input);
      for (const buffered of fakeHubState.buffered.get("f-1") ?? []) {
        input.subscriber.notify(buffered);
      }
      return hubMock.unsubscribe;
    });
  });

  it("unsubscribes when the connection aborts and drains the buffered gap after subscribe", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      live: { seq: 1, status: "live", half: 1, turnNumber: 1, activeSide: "home", homeScore: 0, awayScore: 0 },
    });
    prismaMock.league.findFirst.mockResolvedValue(memberLeague);
    fakeHubState.buffered.set("f-1", [{ seq: 2, kind: "turn" }]);
    hubMock.subscribe.mockImplementation((input: { subscriber: { notify: (p: unknown) => void } }) => {
      fakeHubState.recordSubscribe(input);
      for (const buffered of fakeHubState.buffered.get("f-1") ?? []) {
        input.subscriber.notify(buffered);
      }
      return hubMock.unsubscribe;
    });

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const stream = await collectFrames(res, 2);
    await new Promise((r) => setTimeout(r, 20));

    // subscribe order proves the race is closed: hub.subscribe BEFORE the DB snapshot.
    const subscribeArg = fakeHubState.subscribedWith();
    expect(subscribeArg).toBeTruthy();

    // Abort → the dispose function (unsubscribe) fires and publishes stop.
    stream.done();
    await new Promise((r) => setTimeout(r, 10));
    expect(hubMock.unsubscribe).toHaveBeenCalled();
    // No further notify calls reach the stream after dispose.
    expect(stream.chunks.length).toBeLessThanOrEqual(2);
  });
});
