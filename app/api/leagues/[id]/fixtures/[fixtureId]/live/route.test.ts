import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
  liveMatch: { findFirst: vi.fn() },
}));

const startLiveMatchMock = vi.hoisted(() => vi.fn());
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
// The route's store calls are mocked so POST cases control seq-conflict/start
// outcomes; the route's own pure-transition mapping (lib/liveMatch) stays real.
vi.mock("@/lib/liveStore", () => ({
  startLiveMatch: startLiveMatchMock,
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

/** A live LiveMatch row as prisma would return it (ISO timestamps). */
function liveRow(seq: number): Record<string, unknown> {
  return {
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
    seq,
    paused: false,
    clockStartedAt: new Date(1000).toISOString(),
    finishedAt: null,
  };
}

/** Matches what `liveMatchRowToState` returns (epoch ms, ISO→number). */
const rowState = {
  seq: 5,
  status: "live" as const,
  half: 1,
  turnNumber: 1,
  activeSide: "home" as const,
  homeClock: 240,
  awayClock: 240,
  homeScore: 0,
  awayScore: 0,
  paused: false,
  clockStartedAt: 1000,
  finishedAt: null,
  league: { turnClockEnabled: true, turnClockSeconds: 240 as const },
  events: [],
};

function liveView(overrides: Record<string, unknown> = {}) {
  return {
    seq: 6,
    status: "live",
    half: 1,
    turnNumber: 2,
    activeSide: "away",
    turnClockEnabled: true,
    homeClock: 240,
    awayClock: 240,
    homeScore: 0,
    awayScore: 0,
    paused: false,
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

describe("GET .../live — snapshot-first reads the persisted live row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    authMock.mockResolvedValue(authSession("coach-home"));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    liveMatchRowToStateMock.mockReturnValue({ ...rowState, events: [] });
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow(5));
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("emits the persisted live state as a snapshot-first SSE frame", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    // Snapshot frame carries the live state (seq 5 → cursor).
    expect(first).toContain("event: snapshot");
    expect(first).toContain('"seq":5');
    expect(first).toContain('"activeSide":"home"');
    await reader.cancel().catch(() => {});
  });
});

describe("GET .../live — grace wiring (LM-7, PR 3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    hubMock.subscribe.mockReturnValue(hubMock.unsubscribe);
  });

  it("resumes a paused match when the active coach reconnects (identity = user cookie)", async () => {
    authMock.mockResolvedValue(authSession("coach-home"));
    const pausedRow = { ...liveRow(5), paused: true, clockStartedAt: null };
    prismaMock.liveMatch.findFirst.mockResolvedValue(pausedRow);
    liveMatchRowToStateMock.mockReturnValue({
      ...rowState,
      paused: true,
      clockStartedAt: null,
    });
    resumeLiveMatchMock.mockResolvedValue(undefined);

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );

    expect(res.status).toBe(200);
    // The active coach's reconnect threw a resume through the store.
    expect(resumeLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ fixtureId: "f-1" }),
      expect.anything(),
    );
    await res.body!.getReader().cancel().catch(() => {});
  });

  it("does NOT resume for a spectator reconnect (not the active coach)", async () => {
    authMock.mockResolvedValue(authSession("coach-away")); // away is NOT active (home is)
    const pausedRow = { ...liveRow(5), paused: true, clockStartedAt: null };
    prismaMock.liveMatch.findFirst.mockResolvedValue(pausedRow);
    liveMatchRowToStateMock.mockReturnValue({ ...rowState, paused: true, clockStartedAt: null });

    const res = await GET(
      new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live"),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(resumeLiveMatchMock).not.toHaveBeenCalled();
    // The subscribe carries an activeCoachId = the home owner (the active turn).
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
    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(401);
  });

  it("returns 404 for a foreign/unknown league in control", async () => {
    authMock.mockResolvedValue(authSession("guest"));
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("returns 403 for a league member who is a spectator (not a fixture coach or admin)", async () => {
    setUpAllowed();
    // "owner-1" is the league owner/admin, so resolveLiveAccess action:"control"
    // allows every member. A member who owns neither team and is not admin → 403.
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
    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(403);
    expect(startLiveMatchMock).not.toHaveBeenCalled();
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });
});

describe("POST .../live — command handling", () => {
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
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 when starting a played/result fixture (start guard)", async () => {
    startLiveMatchMock.mockRejectedValue(Object.assign(new Error("cannot start"), { status: 409 }));
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      homeScore: 2,
      awayScore: 0,
    });
    const res = await POST(req({ type: "start" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
  });

  it("returns 409 for an out-of-turn transition", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow(5));
    liveMatchRowToStateMock.mockReturnValue(rowState);
    // Home is active; the away coach submits an out-of-turn endTurn → 409.
    const res = await POST(req({ type: "endTurn", side: "away" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).not.toHaveBeenCalled();
  });

  it("returns 409 on a seq-conflict (updateMany 0 rows → double-action)", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow(5));
    liveMatchRowToStateMock.mockReturnValue(rowState);
    applyTransitionMock.mockRejectedValue(Object.assign(new Error("seq conflict"), { status: 409 }));

    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(applyTransitionMock).toHaveBeenCalled();
  });

  it("returns 200 and the view on a happy-path advance (publish-after-commit)", async () => {
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow(5));
    liveMatchRowToStateMock.mockReturnValue(rowState);
    applyTransitionMock.mockResolvedValue({ seq: 6, view: liveView() });

    const res = await POST(req({ type: "endTurn", side: "home" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.view.activeSide).toBe("away");
    // The store (applyTransition) was called with the optimistic seq guard.
    expect(applyTransitionMock).toHaveBeenCalledWith(
      expect.objectContaining({ liveMatchId: "lm-1", current: rowState, league: expect.objectContaining({ turnClockEnabled: true }) }),
      expect.anything(),
    );
  });

  it("returns 200 on a happy-path start", async () => {
    startLiveMatchMock.mockResolvedValue({ liveMatchId: "lm-1", view: liveView({ status: "live" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(liveRow(1));

    const res = await POST(req({ type: "start" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);
    expect(startLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: "f-1",
        fixture: expect.objectContaining({ scheduled: true, played: false }),
      }),
      expect.anything(),
    );
  });
});
