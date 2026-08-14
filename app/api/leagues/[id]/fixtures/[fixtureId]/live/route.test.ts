import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
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

  it("loads the persisted events and streams them in the snapshot frame (reload shows the timeline)", async () => {
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
    ]);

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    // The snapshot's events array is loaded from the persisted LiveEvent rows,
    // mapped into the client DTO shape (kind/side/half/turnNumber/payload/at).
    expect(prismaMock.liveEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { liveMatchId: "lm-1" }, orderBy: { seq: "asc" } }),
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('"kind":"requestTurn"');
    expect(first).toContain('"side":"away"');
    expect(first).toContain('"at":4000');
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
      expect.objectContaining({ fixtureId: "f-1", side: "home", fixture: expect.objectContaining({ scheduled: true }) }),
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
    const res = await POST(req({ type: "begin" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(beginLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ liveMatchId: "lm-1", fixtureId: "f-1" }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.view.status).toBe("live");
    expect(body.view.viewerSide).toBe("home");
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

  it("returns 200 and persists when a NON-active coach records a casualty to their OWN player", async () => {
    // home active; the away coach records a casualty to an AWAY (own) player.
    liveSetup("coach-away");
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });
    const res = await POST(req({ type: "casualty", side: "away", victimRosterId: "p-9" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(applyTransitionMock).toHaveBeenCalled();
  });

  it("returns 409 (no mutation) when a NON-active coach records an OPPONENT casualty", async () => {
    // home active; the away coach records a casualty to a HOME (opponent) player.
    liveSetup("coach-away");
    const res = await POST(req({ type: "casualty", side: "home", victimRosterId: "p-1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the league admin (no side) records an event (D14 lifecycle-only)", async () => {
    // league owner owns no team → side null → no event recording.
    liveSetup("owner-1");
    const res = await POST(req({ type: "foul", side: "home", playerRosterId: "p-1" }), {
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
