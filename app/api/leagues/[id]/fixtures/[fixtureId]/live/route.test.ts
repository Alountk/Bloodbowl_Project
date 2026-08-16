import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const rollD6Mock = vi.hoisted(() => vi.fn());
const rollD3Mock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
  team: { findMany: vi.fn() },
  player: { findMany: vi.fn() },
  liveMatch: { findFirst: vi.fn() },
  liveEvent: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
}));

const consentLiveMatchMock = vi.hoisted(() => vi.fn());
const retractLiveConsentMock = vi.hoisted(() => vi.fn());
const beginLiveMatchMock = vi.hoisted(() => vi.fn());
const applyTransitionMock = vi.hoisted(() => vi.fn());
const liveMatchRowToStateMock = vi.hoisted(() => vi.fn());
const pauseLiveMatchMock = vi.hoisted(() => vi.fn());
const resumeLiveMatchMock = vi.hoisted(() => vi.fn());
const proposeConcedeLiveMatchMock = vi.hoisted(() => vi.fn());
const declineConcedeLiveMatchMock = vi.hoisted(() => vi.fn());
const acceptConcedeLiveMatchMock = vi.hoisted(() => vi.fn());
const proposeCasualtyLiveMatchMock = vi.hoisted(() => vi.fn());
const confirmCasualtyLiveMatchMock = vi.hoisted(() => vi.fn());

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
// Server-owned dice are deterministic under the mocked random so the route's
// fabricate-body-rolls test can assert the kickoff dice derive from the server.
vi.mock("@/lib/random", () => ({ rollD6: rollD6Mock, rollD3: rollD3Mock }));
vi.mock("@/lib/liveHub", () => ({
  liveHub: hubMock,
}));
// The route's store calls are mocked so POST cases control guard/transition
// outcomes; the route's own pure-transition mapping (lib/liveMatch) stays real.
vi.mock("@/lib/liveStore", () => ({
  consentLiveMatch: consentLiveMatchMock,
  retractLiveConsent: retractLiveConsentMock,
  beginLiveMatch: beginLiveMatchMock,
  applyTransition: applyTransitionMock,
  liveMatchRowToState: liveMatchRowToStateMock,
  pauseLiveMatch: pauseLiveMatchMock,
  resumeLiveMatch: resumeLiveMatchMock,
  proposeConcedeLiveMatch: proposeConcedeLiveMatchMock,
  declineConcedeLiveMatch: declineConcedeLiveMatchMock,
  acceptConcedeLiveMatch: acceptConcedeLiveMatchMock,
  proposeCasualtyLiveMatch: proposeCasualtyLiveMatchMock,
  confirmCasualtyLiveMatch: confirmCasualtyLiveMatchMock,
}));

import { GET, POST } from "./route";

/** A started-league fixture with both team owners set (coach-home / coach-away). */
function startedFixture(id: string, leagueId: string): Record<string, unknown> {
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
    result: null,
    homeTeam: { userId: "coach-home" },
    awayTeam: { userId: "coach-away" },
    league: {
      ownerId: "owner-1",
      status: "started",
      turnClockEnabled: true,
      turnClockSeconds: 240 as const,
      teams: [{ userId: "coach-home" }, { userId: "coach-away" }],
    },
  };
}

/** A pending first-consent LiveMatch row as prisma would return it. */
function pendingRow(seq: number): Record<string, unknown> {
  return {
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
    seq,
    paused: false,
    clockStartedAt: null,
    finishedAt: null,
  };
}

/** A ready LiveMatch row (both consented). */
function readyRow(seq: number): Record<string, unknown> {
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
  };
}

/** Matches what `liveMatchRowToState` returns (epoch ms, ISO→number). */
const readyState = {
  seq: 2,
  status: "ready" as const,
  half: 1,
  turnNumber: 1,
  activeSide: "home" as const,
  homeConsented: true,
  awayConsented: true,
  startedAt: null,
  homeTurnMs: 0,
  awayTurnMs: 0,
  homeScore: 0,
  awayScore: 0,
  paused: false,
  clockStartedAt: null,
  finishedAt: null,
  events: [],
};

const liveState = {
  ...readyState,
  status: "live" as const,
  startedAt: 1000,
  clockStartedAt: 1000,
};

function liveView(overrides: Record<string, unknown> = {}) {
  return {
    seq: 3,
    status: "live",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: 1000,
    elapsed: 0,
    homeTurnMs: 0,
    awayTurnMs: 0,
    paused: false,
    homeScore: 0,
    awayScore: 0,
    finishedAt: null,
    ...overrides,
  };
}

function authSession(id: string) {
  return { user: { id } };
}

function setUpAllowed(overrides: Partial<Record<string, unknown>> = {}) {
  isAuthEnabledMock.mockReturnValue(true);
  authMock.mockResolvedValue(authSession("coach-home"));
  prismaMock.fixture.findFirst.mockResolvedValue({ ...startedFixture("f-1", "lg-1"), ...overrides });
  prismaMock.liveMatch.findFirst.mockResolvedValue(null);
}

describe("GET .../live — read gate (unchanged shape)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(authSession("owner-1"));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("returns 401 in both auth modes without a session", async () => {
    authMock.mockResolvedValue(null);
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a foreign/unknown league or fixture", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    prismaMock.liveMatch.findFirst.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(404);
    expect(hubMock.subscribe).not.toHaveBeenCalled();
  });

  it("returns 200 and subscribes for an authenticated owner/member", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(hubMock.subscribe).toHaveBeenCalled();
  });
});

describe("GET .../live — snapshot carries the persistent state + per-viewer viewerSide (D19)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(authSession("coach-home"));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, events: [] });
    prismaMock.liveEvent.findMany.mockResolvedValue([]);
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("emits the persisted live state and the viewer's side in the snapshot frame", async () => {
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...pendingRow(5),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 5, events: [] });
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: snapshot");
    expect(first).toContain('"seq":5');
    // D19: the snapshot carries the home coach's side.
    expect(first).toContain('"viewerSide":"home"');
    await reader.cancel().catch(() => {});
  });

  it("loads the persisted events and streams only DISPLAY kinds in the snapshot (reload+filter, LM-16)", async () => {
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...pendingRow(5),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 5, events: [] });
    prismaMock.liveEvent.findMany.mockResolvedValue([
      {
        seq: 1,
        kind: "start",
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: {},
        createdAt: new Date(1000),
      },
      {
        seq: 4,
        kind: "requestTurn",
        side: "away",
        playerRosterId: null,
        half: 1,
        turnNumber: 3,
        payload: {},
        createdAt: new Date(4000),
      },
      {
        seq: 5,
        kind: "turn",
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 3,
        payload: {},
        createdAt: new Date(5000),
      },
      {
        seq: 6,
        kind: "turnStart",
        side: "away",
        playerRosterId: null,
        half: 1,
        turnNumber: 4,
        payload: {},
        createdAt: new Date(6000),
      },
    ]);

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    // The snapshot timeline is loaded from the persisted LiveEvent rows and
    // filtered through `isDisplayEvent` (LM-16): `start` appears, but the
    // `turn`/`turnStart`/`requestTurn` rows are excluded from the feed DTO.
    expect(prismaMock.liveEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { liveMatchId: "lm-1" }, orderBy: { seq: "asc" } }),
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"kind":"start"');
    expect(first).toContain('"at":1000');
    // The display filter drops turn-family kinds from the snapshot feed.
    expect(first).not.toContain('"kind":"requestTurn"');
    expect(first).not.toContain('"kind":"turn"');
    expect(first).not.toContain('"kind":"turnStart"');
    await reader.cancel().catch(() => {});
  });

  it("streams legacy `{}`/`{band}` payloads verbatim so they render as fallback rows (LM-6)", async () => {
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...pendingRow(5),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 5, events: [] });
    // Pre-S1 persisted rows: a foul with `{}` and a casualty with only `{ band }`.
    prismaMock.liveEvent.findMany.mockResolvedValue([
      {
        seq: 2,
        kind: "foul",
        side: "home",
        playerRosterId: "p1",
        half: 1,
        turnNumber: 2,
        payload: {},
        createdAt: new Date(2000),
      },
      {
        seq: 3,
        kind: "casualty",
        side: "home",
        playerRosterId: "p3",
        half: 1,
        turnNumber: 2,
        payload: { band: "mng" },
        createdAt: new Date(3000),
      },
    ]);

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    // Legacy payloads pass through unchanged (fallback client rows, no error).
    expect(first).toContain('"kind":"foul"');
    expect(first).toContain('"payload":{}');
    expect(first).toContain('"kind":"casualty"');
    expect(first).toContain('"payload":{"band":"mng"}');
    await reader.cancel().catch(() => {});
  });

  it("starts the unified-clock ticker for a live match (no onClockExpired seam)", async () => {
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...pendingRow(5),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 5, events: [] });
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    // The ticker is started with the unified-clock snapshot (no expiry callback).
    expect(hubMock.startTicking).toHaveBeenCalledWith("f-1", expect.objectContaining({ activeSide: "home", status: "live" }));
    // The second argument (previously onClockExpired) is no longer passed.
    expect(hubMock.startTicking.mock.calls[0].length).toBe(2);
    await res.body!.getReader().cancel().catch(() => {});
  });
});

describe("GET .../live — grace wiring (LM-7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveEvent.findMany.mockResolvedValue([]);
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("resumes a paused match when the active coach reconnects (identity = user cookie)", async () => {
    authMock.mockResolvedValue(authSession("coach-home"));
    const pausedRow = { ...readyRow(5), paused: true, clockStartedAt: null, homeTurnMs: 1000 };
    prismaMock.liveMatch.findFirst.mockResolvedValue(pausedRow);
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, paused: true, clockStartedAt: null, homeTurnMs: 1000 });
    resumeLiveMatchMock.mockResolvedValue(undefined);

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(resumeLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ fixtureId: "f-1" }),
      expect.anything(),
    );
    await res.body!.getReader().cancel().catch(() => {});
  });

  it("does NOT resume for a spectator reconnect (not the active coach)", async () => {
    authMock.mockResolvedValue(authSession("coach-away")); // away is NOT active (home is)
    const pausedRow = { ...readyRow(5), paused: true, clockStartedAt: null, homeTurnMs: 1000 };
    prismaMock.liveMatch.findFirst.mockResolvedValue(pausedRow);
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, paused: true, clockStartedAt: null, homeTurnMs: 1000 });

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(resumeLiveMatchMock).not.toHaveBeenCalled();
    const subscribeArg = hubMock.subscribe.mock.calls[0][0];
    expect(subscribeArg.activeCoachId).toBe("coach-home");
    await res.body!.getReader().cancel().catch(() => {});
  });
});

describe("GET .../live — live fan-out streams post-snapshot hub publishes (no reload)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(authSession("coach-home"));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...pendingRow(5),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 5, events: [] });
    prismaMock.liveEvent.findMany.mockResolvedValue([]);
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });
  afterEach(() => vi.useRealTimers());

  it("drains the pending queue on a flush interval so a live turn flip reaches the client", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: snapshot");

    // A hub publish arrives AFTER the snapshot (the other coach's "Dar el turno").
    const subscriber = hubMock.subscribe.mock.calls[0][0].subscriber;
    subscriber.notify({
      seq: 6,
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "away",
      homeConsented: true,
      awayConsented: true,
      viewerSide: null,
      startedAt: 1000,
      elapsed: 0,
      homeTurnMs: 0,
      awayTurnMs: 0,
      paused: false,
      homeScore: 0,
      awayScore: 0,
      finishedAt: null,
      events: [
        { seq: 6, kind: "turn", side: null, playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 2000 },
        { seq: 7, kind: "turnStart", side: "away", playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 2000 },
      ],
    });

    // The periodic flush drains the gap queue → the OTHER coach sees the flip.
    await vi.advanceTimersByTimeAsync(250);
    const second = new TextDecoder().decode((await reader.read()).value);
    expect(second).toContain("event: event");
    expect(second).toContain('"activeSide":"away"');
    expect(second).toContain('"turnNumber":2');
    await reader.cancel();
  });
});

describe("POST .../live — control gate", () => {
  beforeEach(() => vi.clearAllMocks());

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 401 without a session (both auth modes)", async () => {
    authMock.mockResolvedValue(null);
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await POST(req({ type: "consent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a foreign/unknown league in control", async () => {
    authMock.mockResolvedValue(authSession("guest"));
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await POST(req({ type: "consent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("returns 403 for a league member who is a spectator (not a fixture coach or admin)", async () => {
    setUpAllowed();
    authMock.mockResolvedValue(authSession("member-spectator"));
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      homeTeam: { userId: "coach-home" },
      awayTeam: { userId: "coach-away" },
      league: {
        ownerId: "owner-1",
        status: "started",
        turnClockEnabled: true,
        turnClockSeconds: 240,
        teams: [{ userId: "coach-home" }, { userId: "coach-away" }, { userId: "member-spectator" }],
      },
    });
    const res = await POST(req({ type: "consent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(403);
    expect(consentLiveMatchMock).not.toHaveBeenCalled();
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 on a finished league — no control command incl. concede (RAU-40)", async () => {
    setUpAllowed();
    authMock.mockResolvedValue(authSession("coach-home"));
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      league: {
        ownerId: "owner-1",
        status: "finished",
        turnClockEnabled: true,
        turnClockSeconds: 240 as const,
        teams: [{ userId: "coach-home" }, { userId: "coach-away" }],
      },
    });
    const res = await POST(req({ type: "concedeRespond", accept: true }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "League is finished" });
    expect(acceptConcedeLiveMatchMock).not.toHaveBeenCalled();
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });
});

describe("POST .../live — consent/retract/begin command handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(authSession("coach-home"));
  });

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 400 for an unknown command type", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    const res = await POST(req({ type: "explode" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(consentLiveMatchMock).not.toHaveBeenCalled();
  });

  it("no longer accepts the legacy `start` command (removed, D4)", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    const res = await POST(req({ type: "start" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(consentLiveMatchMock).not.toHaveBeenCalled();
  });

  it("returns 409 when consenting a played/result-loaded fixture (replay rejected)", async () => {
    consentLiveMatchMock.mockRejectedValue(Object.assign(new Error("cannot consent"), { status: 409 }));
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      homeScore: 2,
      awayScore: 0,
    });
    const res = await POST(req({ type: "consent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
  });

  it("consent wires through consentLiveMatch and returns the view with the viewer's side", async () => {
    consentLiveMatchMock.mockResolvedValue({ liveMatchId: "lm-1", view: liveView({ status: "pending", viewerSide: "home" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    const res = await POST(req({ type: "consent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(consentLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ fixtureId: "f-1", side: "home", fixture: expect.objectContaining({ played: false, result: false }) }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.viewerSide).toBe("home");
  });

  it("retract wires through retractLiveConsent and returns a pending view", async () => {
    retractLiveConsentMock.mockResolvedValue({ view: liveView({ status: "pending", viewerSide: "home", homeConsented: false }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(pendingRow(2));
    const res = await POST(req({ type: "retractConsent", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(retractLiveConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ side: "home", liveMatchId: "lm-1" }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.status).toBe("pending");
  });

  it("begin wires through beginLiveMatch → live with the viewer's side", async () => {
    beginLiveMatchMock.mockResolvedValue({ seq: 3, view: liveView({ status: "live", viewerSide: "home" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(readyRow(2));
    rollD6Mock.mockReturnValue(1);
    rollD3Mock.mockReturnValue(1);
    // Begin materializes both teams (idempotent) to build the kickoff input.
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 } },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 } },
    ]);
    const res = await POST(req({ type: "begin" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(prismaMock.team.findMany).toHaveBeenCalled();
    expect(beginLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        kickoff: expect.objectContaining({
          home: expect.objectContaining({ teamId: "home-t", treasury: 234000, dedicatedFans: 2 }),
          away: expect.objectContaining({ teamId: "away-t", treasury: 500000, dedicatedFans: 1 }),
        }),
      }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.status).toBe("live");
    expect(body.view.viewerSide).toBe("home");
  });

  it("begin ignores fabricated body rolls — the kickoff dice derive from server rolls (LM-21/LM-16)", async () => {
    beginLiveMatchMock.mockResolvedValue({ seq: 3, view: liveView({ status: "live", viewerSide: "home" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(readyRow(2));
    // The server "rolls": home em=3 d3=2 keep[4,1] fan=5; away em=6 d3=3 keep[2,6] fan=1.
    rollD6Mock
      .mockReturnValueOnce(3) // home em
      .mockReturnValueOnce(4) // home keep[0]
      .mockReturnValueOnce(1) // home keep[1]
      .mockReturnValueOnce(5) // home fan
      .mockReturnValueOnce(6) // away em
      .mockReturnValueOnce(2) // away keep[0]
      .mockReturnValueOnce(6) // away keep[1]
      .mockReturnValueOnce(1); // away fan
    rollD3Mock.mockReturnValueOnce(2).mockReturnValueOnce(3); // home d3, away d3
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 } },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 } },
    ]);
    // The client body fabricates completely different dice.
    const res = await POST(
      req({
        type: "begin",
        dice: { home: { em: 6, fan: 1 }, away: { em: 1, fan: 6 } },
      }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const kickoffArg = beginLiveMatchMock.mock.calls[0][0].kickoff;
    expect(kickoffArg.dice.home.em).toBe(3);
    expect(kickoffArg.dice.home.d3).toBe(2);
    expect(kickoffArg.dice.home.keep).toEqual([4, 1]);
    expect(kickoffArg.dice.home.fan).toBe(5);
    expect(kickoffArg.dice.away.em).toBe(6);
    expect(kickoffArg.dice.away.d3).toBe(3);
    expect(kickoffArg.dice.away.keep).toEqual([2, 6]);
    expect(kickoffArg.dice.away.fan).toBe(1);
  });

  it("returns 409 on a retried begin against an already-live match (LM-21 idempotency)", async () => {
    beginLiveMatchMock.mockRejectedValue(Object.assign(new Error("begin only from ready"), { status: 409 }));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(7),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    rollD6Mock.mockReturnValue(1);
    rollD3Mock.mockReturnValue(1);
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 } },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 } },
    ]);
    const res = await POST(req({ type: "begin" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(prismaMock.liveEvent.create).not.toHaveBeenCalled();
  });

  it("returns 409 on a seq-conflict during a live transition (double-action)", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(3),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
    applyTransitionMock.mockRejectedValue(Object.assign(new Error("seq conflict"), { status: 409 }));

    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).toHaveBeenCalled();
  });
});

describe("POST .../live — side-aware event permission (LM-12, D14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  /** Home is active (liveState.activeSide = home). coach-home = active. */
  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(3),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
    // The LM-12 invariant gate loads the materialized rosters for foul/casualty.
    prismaMock.player.findMany.mockResolvedValue([]);
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 200 and persists when the ACTIVE coach records a TD", async () => {
    liveSetup("coach-home");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "td", side: "home", playerRosterId: "p-1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(applyTransitionMock).toHaveBeenCalled();
  });

  it("returns 409 (no mutation) when a NON-active coach records a TD", async () => {
    // home active; the away coach (non-active) submits a TD → 409.
    liveSetup("coach-away");
    const res = await POST(req({ type: "td", side: "away", playerRosterId: "p-9" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 200 and persists when a NON-active coach records a SELF-INFLICTED casualty to their OWN player", async () => {
    // home active; the away coach records a crowd casualty to an AWAY (own) player.
    liveSetup("coach-away");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "casualty", side: "away", victimRosterId: "p-9", cause: "crowd", roll16: 9 }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(applyTransitionMock).toHaveBeenCalled();
  });

  it("returns 409 (no mutation) when a NON-active coach records an OPPONENT casualty", async () => {
    // home active; the away coach records a casualty to a HOME (opponent) player.
    liveSetup("coach-away");
    const res = await POST(req({ type: "casualty", side: "home", victimRosterId: "p-1", cause: "dodge", roll16: 9 }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when a direct casualty uses a CAUSED cause (blitz must go through proposeCasualty)", async () => {
    liveSetup("coach-home");
    const res = await POST(req({ type: "casualty", side: "home", victimRosterId: "p-1", cause: "blitz", roll16: 9 }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the ACTIVE coach records a self-inflicted casualty on an OPPONENT player", async () => {
    liveSetup("coach-home");
    const res = await POST(req({ type: "casualty", side: "away", victimRosterId: "p-9", cause: "crowd", roll16: 9 }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the league admin (no side) records an event (D14 lifecycle-only)", async () => {
    // league owner owns no team → side null → no event recording.
    liveSetup("owner-1");
    const res = await POST(req({ type: "foul", side: "home", playerRosterId: "p-1", victimRosterId: "p-9" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });
});

describe("POST .../live — completion command (LM-15) + mvp-not-a-command (LM-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  /** Home is active (liveState.activeSide = home). */
  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(3),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("returns 200 and persists a completion event when the ACTIVE coach records one (LM-15)", async () => {
    liveSetup("coach-home");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "completion", side: "home", playerRosterId: "p-2" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    // The transition must carry a `completion` event with ★1 and NO turn flip.
    const transitionArg = applyTransitionMock.mock.calls[0][0];
    expect(transitionArg.next.events[0].kind).toBe("completion");
    expect(transitionArg.next.events[0].payload.spp).toBe(1);
    expect(transitionArg.next.events[0].playerRosterId).toBe("p-2");
    expect(transitionArg.next.activeSide).toBe("home");
  });

  it("returns 409 (no mutation) when a NON-active coach records a completion (LM-15)", async () => {
    // home active; the away coach records a completion → 409, no persist.
    liveSetup("coach-away");
    const res = await POST(req({ type: "completion", side: "away", playerRosterId: "p-9" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 400 with no mutation for an `mvp` control command (mvp is never a live command, LM-14)", async () => {
    liveSetup("coach-home");
    const res = await POST(req({ type: "mvp", side: "home", playerRosterId: "p-1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(applyTransitionMock).not.toHaveBeenCalled();
    expect(prismaMock.liveEvent.create).not.toHaveBeenCalled();
  });

  it("returns 400 with no mutation for the kickoff kinds as commands (they are begin-only, LM-14/LM-21)", async () => {
    liveSetup("coach-home");
    for (const type of ["expensive_mistake", "fan_factor"]) {
      const res = await POST(req({ type, side: type === "expensive_mistake" ? "home" : null }), {
        params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
      } as never);
      expect(res.status).toBe(400);
      expect(applyTransitionMock).not.toHaveBeenCalled();
      expect(prismaMock.liveEvent.create).not.toHaveBeenCalled();
    }
  });
});

describe("POST .../live — requestTurn nudge + 60s cooldown (LM-13, D17)", () => {
  const now = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  /** Home is active (liveState.activeSide = home). */
  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(3),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("persists a requestTurn event from the NON-active coach and does NOT flip the turn", async () => {
    // home active; the away coach requests the turn.
    liveSetup("coach-away");
    prismaMock.liveEvent.findFirst.mockResolvedValue(null); // no recent requestTurn
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView({ status: "live", activeSide: "home", homeTurnMs: 1000 }) });

    const res = await POST(req({ type: "requestTurn" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    // The transition persists a labeled event but activeSide stays home (no flip).
    expect(applyTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        current: expect.objectContaining({ activeSide: "home" }),
      }),
      expect.anything(),
    );
  });

  it("rejects a requestTurn from the ACTIVE coach (already their turn) with 409", async () => {
    liveSetup("coach-home"); // active
    const res = await POST(req({ type: "requestTurn" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("rejects a requestTurn within the 60s cooldown window with 409 (D17)", async () => {
    liveSetup("coach-away");
    // A recent requestTurn was persisted (within the cooldown window).
    prismaMock.liveEvent.findFirst.mockResolvedValue({ createdAt: new Date(now - 10_000) });
    const res = await POST(req({ type: "requestTurn" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("allows a requestTurn once the cooldown window has elapsed (D17)", async () => {
    liveSetup("coach-away");
    // The last requestTurn was 90s ago → outside the 60s window.
    prismaMock.liveEvent.findFirst.mockResolvedValue({ createdAt: new Date(now - 90_000) });
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "requestTurn" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(applyTransitionMock).toHaveBeenCalled();
  });
});

describe("POST .../live — concede propose / accept / decline (RAU-38)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  /** Home is active and the row exists (the concede store fns re-read it). */
  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({ ...liveState, seq: 8, concedeProposedBy: "home" });
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("wires a `concede` command through proposeConcedeLiveMatch with the caller's side (RAU-38)", async () => {
    liveSetup("coach-home");
    proposeConcedeLiveMatchMock.mockResolvedValue({ seq: 9, view: liveView({ concedeProposedBy: "home", seq: 9 }) });
    const res = await POST(req({ type: "concede" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(proposeConcedeLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ liveMatchId: "lm-1", fixtureId: "f-1", side: "home" }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.concedeProposedBy).toBe("home");
    expect(body.view.viewerSide).toBe("home");
  });

  it("rejects a `concede` from a coach without a side (admin) with 409 and no store call", async () => {
    liveSetup("owner-1"); // league admin owns no team → side null
    const res = await POST(req({ type: "concede" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(proposeConcedeLiveMatchMock).not.toHaveBeenCalled();
  });

  it("maps a state-machine reject (non-live / double-propose) to 409 with no mutation", async () => {
    liveSetup("coach-home");
    proposeConcedeLiveMatchMock.mockRejectedValue(Object.assign(new Error("concede only while live"), { status: 409 }));
    const res = await POST(req({ type: "concede" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
  });

  it("wires a `concedeRespond accept` through acceptConcedeLiveMatch (fixture team ids passed) → finished view", async () => {
    liveSetup("coach-away"); // home proposed → away responds
    acceptConcedeLiveMatchMock.mockResolvedValue({ seq: 9, view: liveView({ status: "finished", finishedAt: 2000, seq: 9, concedeProposedBy: null }) });
    const res = await POST(req({ type: "concedeRespond", accept: true }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(acceptConcedeLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        side: "away",
        homeTeamId: "home-t",
        awayTeamId: "away-t",
      }),
      expect.anything(),
    );
    expect(declineConcedeLiveMatchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.view.status).toBe("finished");
    expect(body.view.viewerSide).toBe("away");
  });

  it("wires a `concedeRespond decline` through declineConcedeLiveMatch → live view (match continues)", async () => {
    liveSetup("coach-away");
    declineConcedeLiveMatchMock.mockResolvedValue({ seq: 9, view: liveView({ seq: 9, concedeProposedBy: null }) });
    const res = await POST(req({ type: "concedeRespond", accept: false }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(declineConcedeLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away" }),
      expect.anything(),
    );
    expect(acceptConcedeLiveMatchMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.view.concedeProposedBy).toBeNull();
  });

  it("rejects a respond without a pending proposal (store 409) and an admin responder (no side)", async () => {
    liveSetup("coach-away");
    declineConcedeLiveMatchMock.mockRejectedValue(Object.assign(new Error("no concede proposal"), { status: 409 }));
    const res = await POST(req({ type: "concedeRespond", accept: false }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);

    liveSetup("owner-1");
    const adminRes = await POST(req({ type: "concedeRespond", accept: true }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(adminRes.status).toBe(409);
    expect(acceptConcedeLiveMatchMock).not.toHaveBeenCalled();
    expect(declineConcedeLiveMatchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed concedeRespond (accept not a boolean) with 400", async () => {
    liveSetup("coach-away");
    const res = await POST(req({ type: "concedeRespond", accept: "yes" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(acceptConcedeLiveMatchMock).not.toHaveBeenCalled();
    expect(declineConcedeLiveMatchMock).not.toHaveBeenCalled();
  });
});

describe("POST .../live — LM-12 foul/casualty actor invariants + LM-6 payloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  /** Home is active (liveState.activeSide = home). Roster: p1/p2 home, p9 away. */
  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(3),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "home-t", rosterPlayerId: "p1" },
      { teamId: "home-t", rosterPlayerId: "p2" },
      { teamId: "away-t", rosterPlayerId: "p9" },
    ]);
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("200 + persists a foul whose victim is on the OPPOSITE side, payload {victimRosterId} (LM-6)", async () => {
    liveSetup("coach-home");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "foul", side: "home", playerRosterId: "p1", victimRosterId: "p9" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    const transitionArg = applyTransitionMock.mock.calls[0][0];
    expect(transitionArg.next.events[0].kind).toBe("foul");
    expect(transitionArg.next.events[0].payload).toEqual({ victimRosterId: "p9" });
  });

  it("409 (no mutation) when an ACTIVE coach fouls an OWN-side victim (invariant bypass)", async () => {
    liveSetup("coach-home");
    const res = await POST(req({ type: "foul", side: "home", playerRosterId: "p1", victimRosterId: "p1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("409 (no mutation) when a foul's victimRosterId is MISSING (REQUIRED, LM-6)", async () => {
    liveSetup("coach-home");
    const res = await POST(req({ type: "foul", side: "home", playerRosterId: "p1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("409 (no mutation) when a proposeCasualty causer is on the VICTIM's side (invariant)", async () => {
    // Home (active) proposes a blitz casualty: victim p9 is away (opposite OK),
    // but the causer p9 is AWAY too — a causer must be on the PROPOSER's side.
    liveSetup("coach-home");
    const res = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p9", cause: "blitz", roll16: 13 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(proposeCasualtyLiveMatchMock).not.toHaveBeenCalled();
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("409 (no mutation) when a proposeCasualty victim is NOT on the OPPOSITE side", async () => {
    // Home (active) proposes a casualty whose victim p1 is HOME (own side) — the
    // victim must resolve to the OPPOSITE side (LM-12).
    liveSetup("coach-home");
    const res = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p1", causerRosterId: "p1", cause: "blitz", roll16: 13 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(proposeCasualtyLiveMatchMock).not.toHaveBeenCalled();
  });

  it("200 + wires proposeCasualty through proposeCasualtyLiveMatch when causer is on the PROPOSER side and victim opposite", async () => {
    liveSetup("coach-home");
    proposeCasualtyLiveMatchMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13, roll6: 4 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(proposeCasualtyLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        liveMatchId: "lm-1",
        fixtureId: "f-1",
        side: "home",
        victimRosterId: "p9",
        causerRosterId: "p1",
        cause: "blitz",
        roll16: 13,
        roll6: 4,
      }),
      expect.anything(),
    );
  });

  it("409 (no mutation) when a proposeCasualty dodge/crowd carries a causer (strict LM-12 self-inflicted)", async () => {
    liveSetup("coach-home");
    for (const cause of ["dodge", "crowd"]) {
      const res = await POST(
        req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p1", cause, roll16: 9 }),
        { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
      );
      expect(res.status).toBe(409);
      expect(proposeCasualtyLiveMatchMock).not.toHaveBeenCalled();
    }
  });

  it("200 (no mutation is not involved) when a non-active coach records a crowd casualty to their OWN player — band derived from roll16", async () => {
    // home active; away coach records a crowd casualty to their own (away) player.
    liveSetup("coach-away");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(
      req({ type: "casualty", side: "away", victimRosterId: "p9", cause: "crowd", roll16: 12 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    const transitionArg = applyTransitionMock.mock.calls[0][0];
    expect(transitionArg.next.events[0].payload).toEqual({
      victimRosterId: "p9",
      cause: "crowd",
      roll16: 12,
      band: "grave",
    });
  });
});

describe("POST .../live — casualty propose → confirm round trip (RAU-39)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
  });

  function liveSetup(sessionId: string) {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "live",
      startedAt: new Date(1000).toISOString(),
      homeTurnMs: 0,
      awayTurnMs: 0,
      clockStartedAt: new Date(1000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue(liveState);
    // Roster: p1/p2 home, p9 away — the proposer (home) causer is own-side.
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "home-t", rosterPlayerId: "p1" },
      { teamId: "home-t", rosterPlayerId: "p2" },
      { teamId: "away-t", rosterPlayerId: "p9" },
    ]);
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("maps a state-machine rejection on propose (double-propose / non-active) to 409", async () => {
    liveSetup("coach-home");
    proposeCasualtyLiveMatchMock.mockRejectedValue(Object.assign(new Error("casualty already proposed"), { status: 409 }));
    const res = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
  });

  it("rejects an invalid roll on propose with 409 (roll16 out of 1..16)", async () => {
    liveSetup("coach-home");
    // The command passes shape validation; the STATE MACHINE rejects the roll.
    proposeCasualtyLiveMatchMock.mockRejectedValue(Object.assign(new Error("invalid roll16"), { status: 409 }));
    const res = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 99 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
  });

  it("rejects a propose/confirm from the side-less league admin with 409 and no store call", async () => {
    liveSetup("owner-1");
    const proposeRes = await POST(
      req({ type: "proposeCasualty", victimRosterId: "p9", causerRosterId: "p1", cause: "blitz", roll16: 13 }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(proposeRes.status).toBe(409);
    expect(proposeCasualtyLiveMatchMock).not.toHaveBeenCalled();

    const confirmRes = await POST(req({ type: "confirmCasualty" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(confirmRes.status).toBe(409);
    expect(confirmCasualtyLiveMatchMock).not.toHaveBeenCalled();
  });

  it("wires confirmCasualty through confirmCasualtyLiveMatch with the responder's side", async () => {
    liveSetup("coach-away");
    confirmCasualtyLiveMatchMock.mockResolvedValue({ seq: 9, view: liveView({ pendingCasualty: null, seq: 9 }) });
    const res = await POST(req({ type: "confirmCasualty" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(confirmCasualtyLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ liveMatchId: "lm-1", fixtureId: "f-1", side: "away" }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.viewerSide).toBe("away");
  });

  it("maps a confirm state-machine rejection (no pending / proposer-self) to 409", async () => {
    liveSetup("coach-home");
    confirmCasualtyLiveMatchMock.mockRejectedValue(Object.assign(new Error("no casualty proposal"), { status: 409 }));
    const res = await POST(req({ type: "confirmCasualty" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
  });
});
