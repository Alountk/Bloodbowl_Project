import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
  liveMatch: { findFirst: vi.fn() },
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
