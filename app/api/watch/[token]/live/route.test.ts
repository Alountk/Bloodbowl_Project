import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guest SSE route tests (MSL-5 / LM-32). The route is PUBLIC (token is the
 * capability): `auth()` is mocked to THROW, so every 200 assertion also proves
 * the route never consults a session. The hub is mocked so the test can drive
 * `notify` frames directly; the reducers (`lib/watchAccess`) stay REAL so the
 * whitelist assertions exercise production reduction.
 */

const prismaMock = vi.hoisted(() => ({
  fixture: { findUnique: vi.fn() },
  liveMatch: { findFirst: vi.fn() },
  liveEvent: { findMany: vi.fn() },
}));
const hubMock = vi.hoisted(() => ({
  subscribe: vi.fn(),
  publish: vi.fn(),
  unsubscribe: vi.fn(),
  startTicking: vi.fn(),
  stopTicking: vi.fn(),
}));
const liveMatchRowToStateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/liveHub", () => ({ liveHub: hubMock }));
vi.mock("@/lib/liveStore", () => ({ liveMatchRowToState: liveMatchRowToStateMock }));
vi.mock("@/auth", () => ({
  auth: () => {
    throw new Error("watch live route must not require a session");
  },
}));

import { GET } from "./route";

/** The generic no-leak body every inactive/unknown token shares (MSL-3). */
const GONE = { error: "Este link ya no está disponible" };

/** The lightweight token-resolution read (id + active-expiry fields). */
function resolveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    homeScore: null,
    awayScore: null,
    winnerId: null,
    result: null,
    ...overrides,
  };
}

/** A raw LiveMatch row carrying private fields the reducer MUST drop. */
function liveRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "lm1",
    fixtureId: "f1",
    seq: 5,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: new Date(1000),
    finishedAt: null,
    homeTurnMs: 700,
    awayTurnMs: 500,
    homeScore: 1,
    awayScore: 0,
    paused: false,
    clockStartedAt: new Date(2000),
    concedeProposedBy: "away",
    mvpNominations: { home: ["p1"], away: null },
    resolutionState: { home: { step: "winnings" }, away: { step: "winnings" } },
    inducements: { home: [{ id: "cheerleader", count: 1 }], away: [] },
    ...overrides,
  };
}

/** The full live state `liveMatchRowToState` returns (carries private fields). */
function liveState(overrides: Record<string, unknown> = {}) {
  return {
    seq: 5,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    startedAt: 1000,
    homeTurnMs: 700,
    awayTurnMs: 500,
    homeScore: 1,
    awayScore: 0,
    paused: false,
    clockStartedAt: 2000,
    finishedAt: null,
    concedeProposedBy: "away",
    mvpNominations: { home: ["p1"], away: null },
    resolutionState: {
      home: {
        step: "winnings",
        fansDone: false,
        fans: null,
        mvpConfirmed: false,
        mvpRolled: false,
        casualtiesDone: false,
        journeymenDone: false,
      },
      away: {
        step: "winnings",
        fansDone: false,
        fans: null,
        mvpConfirmed: false,
        mvpRolled: false,
        casualtiesDone: false,
        journeymenDone: false,
      },
    },
    lastTurnReason: null,
    events: [],
    ...overrides,
  };
}

/** A persisted LiveEvent row (Prisma `createdAt` is a Date). */
function persistedEvent(seq: number, kind: string) {
  return {
    seq,
    kind,
    side: kind === "td" ? "home" : null,
    playerRosterId: null,
    half: 1,
    turnNumber: 2,
    payload: {},
    createdAt: new Date(seq * 1000),
  };
}

/** The private-field markers that must never appear in ANY guest frame. */
const PRIVATE_MARKERS = [
  "mvpNominations",
  "resolutionState",
  "inducements",
  "homeConsented",
  "awayConsented",
  "concedeProposedBy",
];

function get(token = "tok-1") {
  return GET(new Request(`http://localhost/api/watch/${token}/live`), {
    params: Promise.resolve({ token }),
  } as never);
}

type SseReader = ReadableStreamDefaultReader<Uint8Array>;

async function readChunk(reader: SseReader): Promise<string> {
  return new TextDecoder().decode((await reader.read()).value);
}

describe("GET /api/watch/[token]/live — token gate (MSL-3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the generic 404 for an unknown token without subscribing", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(null);

    const res = await get("unknown-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
    expect(hubMock.subscribe).not.toHaveBeenCalled();
  });

  it("returns the IDENTICAL generic 404 for a played/expired fixture (expired == unknown)", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(
      resolveRow({ homeScore: 2, awayScore: 1, winnerId: "t1", result: { id: "r1" } }),
    );

    const res = await get("played-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
    expect(hubMock.subscribe).not.toHaveBeenCalled();
  });

  it("closes the link on a result-only fixture (legacy played marker)", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(resolveRow({ result: { id: "r1" } }));

    const res = await get("legacy-token");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual(GONE);
  });
});

describe("GET /api/watch/[token]/live — guest subscription (MSL-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("opens an SSE stream with no session and subscribes as a coach-less guest", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(resolveRow());
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);

    const res = await get();
    const reader = res.body!.getReader();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    // The guest never sends a coach identity and never installs a grace handler.
    expect(hubMock.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ fixtureId: "f1", coachId: null, activeCoachId: null }),
    );
    expect(hubMock.subscribe.mock.calls[0][0].onGraceExpired).toBeUndefined();
    await reader.cancel().catch(() => {});
  });

  it("emits a `live: null` snapshot when the fixture has no live match", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(resolveRow());
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);

    const res = await get();
    const reader = res.body!.getReader();
    const first = await readChunk(reader);

    expect(first).toContain("event: snapshot");
    expect(first).toContain('"live":null');
    await reader.cancel().catch(() => {});
  });

  it("starts the unified-clock ticker for a live match", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(resolveRow());
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow());
    liveMatchRowToStateMock.mockReturnValue(liveState());
    prismaMock.liveEvent.findMany.mockResolvedValue([]);

    const res = await get();
    const reader = res.body!.getReader();

    expect(hubMock.startTicking).toHaveBeenCalledWith(
      "f1",
      expect.objectContaining({ status: "live", activeSide: "home", seq: 5 }),
    );
    await reader.cancel().catch(() => {});
  });

  it("does not start the ticker when the fixture has no live match", async () => {
    prismaMock.fixture.findUnique.mockResolvedValueOnce(resolveRow());
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);

    const res = await get();
    const reader = res.body!.getReader();

    expect(hubMock.startTicking).not.toHaveBeenCalled();
    await reader.cancel().catch(() => {});
  });
});

describe("GET /api/watch/[token]/live — reduced frames (MSL-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
    prismaMock.fixture.findUnique.mockResolvedValue(resolveRow());
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow());
    liveMatchRowToStateMock.mockReturnValue(liveState());
    prismaMock.liveEvent.findMany.mockResolvedValue([
      persistedEvent(1, "start"),
      persistedEvent(2, "turnStart"),
      persistedEvent(3, "td"),
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("emits the reduced snapshot with only display events and no private fields", async () => {
    const res = await get();
    const reader = res.body!.getReader();
    const first = await readChunk(reader);

    expect(first).toContain("event: snapshot");
    expect(first).toContain('"viewerSide":null');
    // Display filter: `start`/`td` survive, the internal `turnStart` does not.
    expect(first).toContain('"kind":"start"');
    expect(first).toContain('"kind":"td"');
    expect(first).not.toContain('"kind":"turnStart"');
    for (const secret of PRIVATE_MARKERS) expect(first).not.toContain(secret);
    await reader.cancel().catch(() => {});
  });

  it("reduces every hub frame so private fields never reach a guest frame", async () => {
    const res = await get();
    const reader = res.body!.getReader();
    await readChunk(reader); // snapshot

    const subscriber = hubMock.subscribe.mock.calls[0][0].subscriber;
    subscriber.notify({
      ...liveState({ seq: 6, turnNumber: 4, activeSide: "away" }),
      events: [
        { seq: 4, kind: "turn", side: null, playerRosterId: null, half: 1, turnNumber: 4, payload: {}, at: 4000 },
        { seq: 5, kind: "td", side: "away", playerRosterId: "p9", half: 1, turnNumber: 4, payload: {}, at: 5000 },
      ],
    });

    await vi.advanceTimersByTimeAsync(250);
    const second = await readChunk(reader);

    expect(second).toContain("event: event");
    expect(second).toContain('"activeSide":"away"');
    expect(second).toContain('"viewerSide":null');
    // Only the display `td` survives the reduction.
    expect(second).toContain('"kind":"td"');
    expect(second).not.toContain('"kind":"turn"');
    for (const secret of PRIVATE_MARKERS) expect(second).not.toContain(secret);
    await reader.cancel().catch(() => {});
  });

  it("never forwards a member-only `ack` frame to a guest", async () => {
    const res = await get();
    const reader = res.body!.getReader();
    await readChunk(reader); // snapshot

    const subscriber = hubMock.subscribe.mock.calls[0][0].subscriber;
    // An ack (seq 9) then a real transition (seq 10). If the ack were forwarded
    // it would be the FIRST flushed chunk; it must not be.
    subscriber.notify({
      kind: "ack",
      ...liveState({ seq: 9 }),
      event: {
        seq: 9,
        kind: "td",
        side: "home",
        playerRosterId: "p1",
        half: 1,
        turnNumber: 2,
        payload: {},
        at: 9000,
        ackStatus: "ok",
      },
    });
    subscriber.notify({ ...liveState({ seq: 10, turnNumber: 5, activeSide: "away" }), events: [] });

    await vi.advanceTimersByTimeAsync(250);
    const first = await readChunk(reader);

    expect(first).not.toContain('"kind":"ack"');
    expect(first).not.toContain("ackStatus");
    expect(first).toContain('"turnNumber":5');
    await reader.cancel().catch(() => {});
  });

  it("reduces a hub tick frame and keeps its kind discriminator", async () => {
    const res = await get();
    const reader = res.body!.getReader();
    await readChunk(reader); // snapshot

    const subscriber = hubMock.subscribe.mock.calls[0][0].subscriber;
    // A tick advances the cursor (seq > snapshot) so it clears the stale guard.
    subscriber.notify({
      kind: "tick",
      seq: 6,
      status: "live",
      activeSide: "home",
      homeConsented: true,
      awayConsented: true,
      startedAt: 1000,
      homeTurnMs: 1700,
      awayTurnMs: 500,
      elapsed: 2200,
      paused: false,
      homeScore: 1,
      awayScore: 0,
      finishedAt: null,
    });
    await vi.advanceTimersByTimeAsync(250);
    const second = await readChunk(reader);

    expect(second).toContain('"kind":"tick"');
    expect(second).toContain('"homeTurnMs":1700');
    expect(second).not.toContain("homeConsented");
    expect(second).not.toContain("awayConsented");
    await reader.cancel().catch(() => {});
  });

  it("forwards a reset frame so the guest drops the live view", async () => {
    const res = await get();
    const reader = res.body!.getReader();
    await readChunk(reader); // snapshot

    const subscriber = hubMock.subscribe.mock.calls[0][0].subscriber;
    subscriber.notify({ seq: 6, live: null });
    await vi.advanceTimersByTimeAsync(250);
    const second = await readChunk(reader);

    expect(second).toContain("event: event");
    expect(second).toContain('"live":null');
    await reader.cancel().catch(() => {});
  });
});
