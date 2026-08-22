import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const isAuthEnabledMock = vi.hoisted(() => vi.fn());
const rollD6Mock = vi.hoisted(() => vi.fn());
const rollD3Mock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  league: { findFirst: vi.fn() },
  team: { findMany: vi.fn() },
  player: { findMany: vi.fn(), createMany: vi.fn() },
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
const rollLiveMvpMock = vi.hoisted(() => vi.fn());
const resolveLiveMatchMock = vi.hoisted(() => vi.fn());
const nominateMvpLiveMatchMock = vi.hoisted(() => vi.fn());
const hireJourneymanLiveMatchMock = vi.hoisted(() => vi.fn());

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
  rollLiveMvp: rollLiveMvpMock,
  resolveLiveMatch: resolveLiveMatchMock,
  nominateMvpLiveMatch: nominateMvpLiveMatchMock,
  hireJourneymanLiveMatch: hireJourneymanLiveMatchMock,
}));

import { GET, POST } from "./route";
import { journeymanName } from "@/lib/journeymen";

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

  /** A full 11-player human roster (no Player rows → all available). */
  const roster11 = Array.from({ length: 11 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Jugador ${i + 1}`,
    positionalKey: "lineman",
  }));

  it("wires the per-side journeymen into the begin kickoff input (RAU-13)", async () => {
    beginLiveMatchMock.mockResolvedValue({ seq: 3, view: liveView({ status: "live", viewerSide: "home" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(readyRow(2));
    rollD6Mock.mockReturnValue(1);
    rollD3Mock.mockReturnValue(1);
    // Home fields 10 available → 1 journeyman; away fields 11 → none.
    const roster10 = roster11.slice(0, 10);
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 }, raceId: "human", roster: roster10 },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 }, raceId: "human", roster: roster11 },
    ]);
    prismaMock.player.findMany.mockResolvedValue(
      roster10.map((e) => ({
        teamId: "home-t",
        rosterPlayerId: e.id,
        name: e.name,
        positionalKey: e.positionalKey,
        pe: 0,
        skills: [],
        injuries: [],
        alive: true,
        missNextMatch: false,
        valueBonus: 0,
      })),
    );

    const res = await POST(req({ type: "begin" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);

    const kickoff = beginLiveMatchMock.mock.calls[0][0].kickoff;
    // The journeyman name matches the fixture-GET derivation exactly: the same
    // seeded name for the same team + index + used roster names.
    const expectedName = journeymanName(
      "home-t",
      "human",
      1,
      new Set(roster10.map((e) => e.name)),
    );
    expect(kickoff.journeymen.home).toEqual({ count: 1, names: [expectedName] });
    expect(kickoff.journeymen.home.names[0]).not.toBe("Novato 1");
    expect(kickoff.journeymen.away).toBeUndefined();
  });

  it("persists the fielded journeymen (id + name) on the begin input (RAU-14)", async () => {
    beginLiveMatchMock.mockResolvedValue({ seq: 3, view: liveView({ status: "live", viewerSide: "home" }) });
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue(readyRow(2));
    rollD6Mock.mockReturnValue(1);
    rollD3Mock.mockReturnValue(1);
    const roster10 = roster11.slice(0, 10);
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 }, raceId: "human", roster: roster10 },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 }, raceId: "human", roster: roster11 },
    ]);
    prismaMock.player.findMany.mockResolvedValue(
      roster10.map((e) => ({
        teamId: "home-t",
        rosterPlayerId: e.id,
        name: e.name,
        positionalKey: e.positionalKey,
        pe: 0,
        skills: [],
        injuries: [],
        alive: true,
        missNextMatch: false,
        valueBonus: 0,
      })),
    );

    const res = await POST(req({ type: "begin" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(200);

    const beginArg = beginLiveMatchMock.mock.calls[0][0];
    // The persisted journeymen carry the synthetic id + the SAME seeded name
    // the kickoff event uses — the post-resolve hire flow reads them off the row.
    const expectedName = journeymanName(
      "home-t",
      "human",
      1,
      new Set(roster10.map((e) => e.name)),
    );
    expect(beginArg.journeymen).toEqual({
      home: [{ id: `journeyman-home-t-1`, name: expectedName }],
      away: [],
    });
  });

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
    // The roster rows also feed the served-rosters journeyman derivation.
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 }, raceId: "human", roster: roster11 },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 }, raceId: "human", roster: roster11 },
    ]);
    prismaMock.player.findMany.mockResolvedValue([]);
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
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 }, raceId: "human", roster: roster11 },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 }, raceId: "human", roster: roster11 },
    ]);
    prismaMock.player.findMany.mockResolvedValue([]);
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
      { id: "home-t", treasury: 234000, coaching: { dedicatedFans: 2 }, raceId: "human", roster: roster11 },
      { id: "away-t", treasury: 500000, coaching: { dedicatedFans: 1 }, raceId: "human", roster: roster11 },
    ]);
    prismaMock.player.findMany.mockResolvedValue([]);
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
    // The served-rosters derivation (actor-side maps) reads the team rows'
    // rosters — mirror the Player rows so the invariant maps agree.
    prismaMock.team.findMany.mockResolvedValue([
      { id: "home-t", raceId: "human", roster: [{ id: "p1", name: "P1", positionalKey: "lineman" }, { id: "p2", name: "P2", positionalKey: "lineman" }] },
      { id: "away-t", raceId: "human", roster: [{ id: "p9", name: "P9", positionalKey: "lineman" }] },
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

  it("RAU-13: a foul against a served Journeyman (opposite side) passes the actor invariant", async () => {
    // The away team fields only 10 players (roster JSON) → the fixture GET would
    // serve `journeyman-away-t-1`. The active HOME coach fouls that journeyman:
    // the id must resolve to the OPPOSITE side in the side map (it mirrors the
    // served rosters), so the invariant allows the foul instead of 409.
    const tenRoster = Array.from({ length: 10 }, (_, i) => ({
      id: `ap${i + 1}`,
      name: `Away ${i + 1}`,
      positionalKey: "lineman",
    }));
    authMock.mockResolvedValue(authSession("coach-home"));
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
    prismaMock.team.findMany.mockResolvedValue([
      {
        id: "home-t",
        raceId: "human",
        roster: Array.from({ length: 11 }, (_, i) => ({ id: `hp${i + 1}`, name: `Home ${i + 1}`, positionalKey: "lineman" })),
      },
      { id: "away-t", raceId: "human", roster: tenRoster },
    ]);
    prismaMock.player.findMany.mockResolvedValue([
      ...tenRoster.map((p) => ({ teamId: "away-t", rosterPlayerId: p.id, alive: true, missNextMatch: false })),
      { teamId: "home-t", rosterPlayerId: "hp1", alive: true, missNextMatch: false },
    ]);
    applyTransitionMock.mockResolvedValue({ seq: 4, view: liveView() });

    const res = await POST(
      req({ type: "foul", side: "home", playerRosterId: "hp1", victimRosterId: "journeyman-away-t-1" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(applyTransitionMock).toHaveBeenCalledTimes(1);
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

describe("POST .../live — RAU-49 end-of-match resolution (rollMvp + resolveMatch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    prismaMock.team.findMany.mockResolvedValue([]);
  });

  /** A finished live row + state; the fixture stays a STARTED league. */
  function finishedSetup(sessionId = "owner-1") {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "finished",
      finishedAt: new Date(2000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({
      ...liveState,
      seq: 8,
      status: "finished",
      finishedAt: 2000,
      events: [],
    });
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("rejects BOTH resolution commands on a FINISHED league with 409 before any store call (RAU-40)", async () => {
    finishedSetup();
    prismaMock.fixture.findFirst.mockResolvedValue({
      ...startedFixture("f-1", "lg-1"),
      league: { ...(startedFixture("f-1", "lg-1").league as Record<string, unknown>), status: "finished" },
    });
    for (const body of [{ type: "rollMvp" }, { type: "resolveMatch" }]) {
      const res = await POST(req(body), { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "League is finished" });
    }
    expect(rollLiveMvpMock).not.toHaveBeenCalled();
    expect(resolveLiveMatchMock).not.toHaveBeenCalled();
  });

  it("wires `rollMvp` through rollLiveMvp (server-owned preview roll, NO body nominations — RAU-51) and returns the roll", async () => {
    finishedSetup();
    const roll = {
      mvp: { home: "p1", away: "p2" },
      postFf: { home: 4, away: 3 },
      ffRoll: {
        home: { roll: 4, direction: "up" },
        away: { roll: 3, direction: "stay" },
      },
    };
    rollLiveMvpMock.mockResolvedValue(roll);
    const res = await POST(
      req({ type: "rollMvp" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(rollLiveMvpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: "f-1",
        homeTeamId: "home-t",
        awayTeamId: "away-t",
      }),
      expect.anything(),
    );
    const body = await res.json();
    expect(body.roll).toEqual(roll);
  });

  it("maps a rollMvp 400 (invalid nominations) and 404 to the matching responses", async () => {
    finishedSetup();
    rollLiveMvpMock.mockRejectedValue(Object.assign(new Error("mvp.six"), { status: 400 }));
    let res = await POST(req({ type: "rollMvp" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);

    rollLiveMvpMock.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    res = await POST(req({ type: "rollMvp" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(404);
  });

  it("maps a rollMvp 409 (already resolved) to 409 before any preview roll", async () => {
    finishedSetup();
    rollLiveMvpMock.mockRejectedValue(Object.assign(new Error("already resolved"), { status: 409 }));
    const res = await POST(
      req({ type: "rollMvp" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Cannot roll MVP for a resolved match" });
  });

  it("maps a rollMvp 409 (both sides must nominate first) to a dedicated message (RAU-51)", async () => {
    finishedSetup();
    rollLiveMvpMock.mockRejectedValue(
      Object.assign(new Error("both sides must nominate first"), { status: 409 }),
    );
    const res = await POST(
      req({ type: "rollMvp" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Both sides must nominate first" });
  });

  it("wires `resolveMatch` through resolveLiveMatch (THE closure, no body nominations — RAU-51) with the fixture team ids + league + loadedBy", async () => {
    finishedSetup();
    resolveLiveMatchMock.mockResolvedValue({
      fixtureId: "f-1",
      status: "played",
      homeScore: 1,
      awayScore: 0,
      winnerId: "home-t",
      winnings: { home: 55000, away: 45000 },
      postFf: { home: 4, away: 3 },
      ffRoll: {
        home: { roll: 4, direction: "up" },
        away: { roll: 3, direction: "stay" },
      },
      mvp: { home: "p1", away: "p2" },
      resultId: "mr-1",
    });
    const res = await POST(
      req({ type: "resolveMatch" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(resolveLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: "f-1",
        leagueId: "lg-1",
        homeTeamId: "home-t",
        awayTeamId: "away-t",
        loadedBy: "owner-1",
      }),
      expect.anything(),
    );
    // The lazy Player backfill runs BEFORE the resolve (result-route parity).
    expect(prismaMock.team.findMany).toHaveBeenCalled();
    const body = await res.json();
    expect(body.resolved.resultId).toBe("mr-1");
    expect(body.resolved.status).toBe("played");
  });

  it("maps a resolveMatch store rejection to 409 (not-finished / already-resolved / both-sides)", async () => {
    finishedSetup();
    resolveLiveMatchMock.mockRejectedValue(Object.assign(new Error("already resolved"), { status: 409 }));
    let res = await POST(
      req({ type: "resolveMatch" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Cannot resolve match in current state" });

    resolveLiveMatchMock.mockRejectedValue(
      Object.assign(new Error("both sides must nominate first"), { status: 409 }),
    );
    res = await POST(
      req({ type: "resolveMatch" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Both sides must nominate first" });
  });

  it("accepts a resolveMatch with NO nominations body (RAU-51 — the server rolls from the persisted per-side state)", async () => {
    finishedSetup();
    resolveLiveMatchMock.mockResolvedValue({
      fixtureId: "f-1",
      status: "played",
      homeScore: 1,
      awayScore: 0,
      winnerId: "home-t",
      winnings: { home: 0, away: 0 },
      postFf: { home: 0, away: 0 },
      ffRoll: {
        home: { roll: 0, direction: "stay" },
        away: { roll: 0, direction: "stay" },
      },
      mvp: { home: "p1", away: "p2" },
      resultId: "mr-1",
    });
    const res = await POST(
      req({ type: "resolveMatch" }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(resolveLiveMatchMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST .../live — RAU-51 per-side MVP nominations (nominateMvp)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    prismaMock.team.findMany.mockResolvedValue([]);
  });

  function finishedSetup(sessionId = "owner-1") {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "finished",
      finishedAt: new Date(2000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({
      ...liveState,
      seq: 8,
      status: "finished",
      finishedAt: 2000,
      events: [],
    });
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("rejects with 409 when the caller owns NO side (admin/bye — read-only) (RAU-51)", async () => {
    finishedSetup("owner-1"); // league admin, not a fixture coach
    const res = await POST(
      req({ type: "nominateMvp", side: "home", players: ["p1", "p2", "p3", "p4", "p5", "p6"] }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "No side to nominate" });
    expect(nominateMvpLiveMatchMock).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a coach tries to nominate the RIVAL side (RAU-51)", async () => {
    // coach-home is the fixture's home team owner.
    finishedSetup("coach-home");
    const res = await POST(
      req({ type: "nominateMvp", side: "away", players: ["p1", "p2", "p3", "p4", "p5", "p6"] }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Not your team" });
    expect(nominateMvpLiveMatchMock).not.toHaveBeenCalled();
  });

  it("wires `nominateMvp` through nominateMvpLiveMatch with the OWNER-side team id + side (RAU-51)", async () => {
    finishedSetup("coach-home");
    nominateMvpLiveMatchMock.mockResolvedValue({ seq: 9, view: { seq: 9, status: "finished" } });
    const res = await POST(
      req({ type: "nominateMvp", side: "home", players: ["p1", "p2", "p3", "p4", "p5", "p6"] }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(nominateMvpLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: "f-1",
        teamId: "home-t",
        side: "home",
        players: ["p1", "p2", "p3", "p4", "p5", "p6"],
      }),
      expect.anything(),
    );
  });

  it("maps a nominateMvp 400 (invalid/dead/suspended nominees) to 400", async () => {
    finishedSetup("coach-home");
    nominateMvpLiveMatchMock.mockRejectedValue(Object.assign(new Error("mvp.unavailable"), { status: 400 }));
    const res = await POST(
      req({ type: "nominateMvp", side: "home", players: ["p1", "p2", "p3", "p4", "p5", "p6"] }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid MVP nominations" });
  });

  it("maps a nominateMvp 409 (not-finished / already-resolved) to 409", async () => {
    finishedSetup("coach-home");
    nominateMvpLiveMatchMock.mockRejectedValue(Object.assign(new Error("already resolved"), { status: 409 }));
    const res = await POST(
      req({ type: "nominateMvp", side: "home", players: ["p1", "p2", "p3", "p4", "p5", "p6"] }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Cannot nominate MVP in current state" });
  });

  it("rejects a malformed nominateMvp body (bad side / non-string players) with 400", async () => {
    finishedSetup("coach-home");
    let res = await POST(req({ type: "nominateMvp", side: "home", players: ["p1", 2, 3] }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    res = await POST(req({ type: "nominateMvp", side: "midfield", players: [] }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(nominateMvpLiveMatchMock).not.toHaveBeenCalled();
  });
});

describe("POST .../live — RAU-14 post-resolve journeyman hire (hireJourneyman)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthEnabledMock.mockReturnValue(true);
    prismaMock.team.findMany.mockResolvedValue([]);
  });

  function finishedSetup(sessionId = "owner-1") {
    authMock.mockResolvedValue(authSession(sessionId));
    prismaMock.fixture.findFirst.mockResolvedValue(startedFixture("f-1", "lg-1"));
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "finished",
      finishedAt: new Date(2000).toISOString(),
    });
    liveMatchRowToStateMock.mockReturnValue({
      ...liveState,
      seq: 8,
      status: "finished",
      finishedAt: 2000,
      events: [],
    });
  }

  function req(body: unknown) {
    return new Request("http://localhost:3000/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("rejects with 409 when the caller owns NO side (admin/bye — read-only)", async () => {
    finishedSetup("owner-1"); // league admin, not a fixture coach
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "No side to hire" });
    expect(hireJourneymanLiveMatchMock).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a coach decides the RIVAL side's journeyman (owner-only)", async () => {
    finishedSetup("coach-home");
    const res = await POST(
      req({ type: "hireJourneyman", side: "away", journeymanId: "journeyman-away-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Not your team" });
    expect(hireJourneymanLiveMatchMock).not.toHaveBeenCalled();
  });

  it("wires `hireJourneyman` through hireJourneymanLiveMatch with the OWNER-side team id + side + decision", async () => {
    finishedSetup("coach-home");
    hireJourneymanLiveMatchMock.mockResolvedValue({
      journeymen: { home: [], away: [] },
      team: { id: "home-t", roster: [{ id: "new-1", name: "Aldric Martillo", positionalKey: "lineman" }], treasury: 450000 },
    });
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(hireJourneymanLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureId: "f-1",
        teamId: "home-t",
        side: "home",
        journeymanId: "journeyman-home-t-1",
        hire: true,
      }),
      expect.anything(),
    );
    expect(await res.json()).toMatchObject({
      journeymen: { home: [], away: [] },
      team: { id: "home-t", treasury: 450000 },
    });
  });

  it("wires the let-go decision (`hire: false`) through unchanged", async () => {
    finishedSetup("coach-home");
    hireJourneymanLiveMatchMock.mockResolvedValue({
      journeymen: { home: [], away: [] },
      team: { id: "home-t", roster: [], treasury: 0 },
    });
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: false }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(hireJourneymanLiveMatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ hire: false }),
      expect.anything(),
    );
  });

  it("maps a hire 400 (unknown journeyman) to 400", async () => {
    finishedSetup("coach-home");
    hireJourneymanLiveMatchMock.mockRejectedValue(Object.assign(new Error("unknown journeyman"), { status: 400 }));
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown journeyman" });
  });

  it("maps a hire 409 (not-resolved / already-gone / roster-full / insufficient balance) to 409", async () => {
    finishedSetup("coach-home");
    hireJourneymanLiveMatchMock.mockRejectedValue(
      Object.assign(new Error("match not resolved"), { status: 409 }),
    );
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Cannot hire in current state" });
  });

  it("rejects a malformed hireJourneyman body (bad side / missing hire flag) with 400", async () => {
    finishedSetup("coach-home");
    let res = await POST(req({ type: "hireJourneyman", side: "home", journeymanId: "j-1" }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    res = await POST(req({ type: "hireJourneyman", side: "midfield", journeymanId: "j-1", hire: true }), {
      params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }),
    } as never);
    expect(res.status).toBe(400);
    expect(hireJourneymanLiveMatchMock).not.toHaveBeenCalled();
  });

  it("ALLOWS the post-resolve hire on a FINISHED league (the RAU-40 guard exempts it — RAU-14)", async () => {
    // The last fixture's resolve finishes the league atomically; the hire is
    // the post-"Match reported" decision and must still run.
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
    prismaMock.liveMatch.findFirst.mockResolvedValue({
      ...readyRow(8),
      status: "finished",
      finishedAt: new Date(2000).toISOString(),
    });
    hireJourneymanLiveMatchMock.mockResolvedValue({
      journeymen: { home: [], away: [] },
      team: { id: "home-t", roster: [{ id: "new-1", name: "Aldric Martillo", positionalKey: "lineman" }], treasury: 450000 },
    });
    const res = await POST(
      req({ type: "hireJourneyman", side: "home", journeymanId: "journeyman-home-t-1", hire: true }),
      { params: Promise.resolve({ id: "lg-1", fixtureId: "f-1" }) } as never,
    );
    expect(res.status).toBe(200);
    expect(hireJourneymanLiveMatchMock).toHaveBeenCalledTimes(1);
  });
});
