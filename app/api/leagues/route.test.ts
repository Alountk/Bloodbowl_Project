import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  ruleset: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, POST } from "./route";

describe("GET /api/leagues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.league.findMany).not.toHaveBeenCalled();
  });

  it("lists open leagues of any user plus the session user's own leagues, with ownerName and memberCount", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const leagues = [
      {
        id: "open-foreign",
        name: "Public League",
        ownerId: "user-2",
        owner: { id: "user-2", email: "other@test.local", name: "Other Coach" },
        status: "open",
        seasonLength: null,
        startedAt: null,
        createdAt: new Date().toISOString(),
        teams: [],
        _count: { teams: 3 },
      },
      {
        id: "own-started",
        name: "My Started League",
        ownerId: "user-1",
        owner: { id: "user-1", email: "me@test.local", name: null },
        status: "started",
        seasonLength: 2,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        teams: [],
        _count: { teams: 2 },
      },
    ];
    prismaMock.league.findMany.mockResolvedValue(leagues);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    // Each item carries the resolved owner name and the server-computed count.
    expect(body[0].ownerName).toBe("Other Coach");
    expect(body[0].memberCount).toBe(3);
    expect(body[1].ownerName).toBe("me@test.local"); // falls back to email when name is null
    expect(body[1].memberCount).toBe(2);
    // Neither league has a member team for the session user.
    expect(body.every((league: { isMember: boolean }) => league.isMember === false)).toBe(true);

    // Query is the union: all open + own (any status) + leagues where the user
    // holds a non-archived member team, with owner + _count memberCount computed
    // in the query (no per-league N+1 detail fetch).
    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { status: "open" },
            { ownerId: "user-1" },
            { teams: { some: { userId: "user-1", archivedAt: null } } },
          ],
        },
        include: expect.objectContaining({
          owner: expect.objectContaining({
            select: expect.objectContaining({ email: true }),
          }),
          _count: expect.objectContaining({
            select: expect.objectContaining({
              teams: expect.objectContaining({
                where: { archivedAt: null },
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("returns a STARTED league where the session user is a member, flagged isMember", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const leagues = [
      {
        id: "member-started",
        name: "Joined Started League",
        ownerId: "user-2",
        owner: { id: "user-2", email: "owner@test.local", name: "League Owner" },
        status: "started",
        seasonLength: 1,
        startedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        // The session user holds one non-archived member team in this league.
        teams: [{ id: "team-1" }],
        _count: { teams: 2 },
      },
    ];
    prismaMock.league.findMany.mockResolvedValue(leagues);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("member-started");
    expect(body[0].isMember).toBe(true);
    // memberCount still computed in the query — no N+1 regression.
    expect(body[0].memberCount).toBe(2);
    // The member-team ids used to derive isMember never leak to the client.
    expect(body[0].teams).toBeUndefined();

    // The query unions leagues where the user has a live member team and includes
    // only that scoped team list to derive the flag.
    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { status: "open" },
            { ownerId: "user-1" },
            { teams: { some: { userId: "user-1", archivedAt: null } } },
          ],
        },
        include: expect.objectContaining({
          teams: {
            where: { userId: "user-1", archivedAt: null },
            select: { id: true },
          },
        }),
      }),
    );
  });

  it("keeps foreign STARTED leagues without membership hidden (WHERE excludes them)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // No league matches: the user owns nothing, is a member of nothing, and the
    // only leagues present are foreign started ones — the WHERE never selects them.
    prismaMock.league.findMany.mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(0);

    // Hiding is enforced at the query level: the member-team branch is scoped to
    // the SESSION user's own teams, so a foreign started league where the user
    // has no member team can never match the OR.
    expect(prismaMock.league.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
           OR: [
            { status: "open" },
            { ownerId: "user-1" },
            { teams: { some: { userId: "user-1", archivedAt: null } } },
          ],
        },
      }),
    );
  });

  it("exposes the league's rulesetId and resolved rulesetName (RAU-52)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const leagues = [
      {
        id: "with-ruleset",
        name: "Tier1 League",
        ownerId: "user-1",
        status: "open",
        seasonLength: null,
        startedAt: null,
        createdAt: new Date().toISOString(),
        rulesetId: "r1",
        ruleset: { id: "r1", name: "Liga Tier 1" },
        teams: [],
        _count: { teams: 1 },
      },
      {
        id: "legacy",
        name: "Legacy League",
        ownerId: "user-1",
        status: "open",
        seasonLength: null,
        startedAt: null,
        createdAt: new Date().toISOString(),
        rulesetId: null,
        ruleset: null,
        teams: [],
        _count: { teams: 2 },
      },
    ];
    prismaMock.league.findMany.mockResolvedValue(leagues);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].rulesetId).toBe("r1");
    expect(body[0].rulesetName).toBe("Liga Tier 1");
    // A legacy league without a ruleset resolves to null (today's behavior).
    expect(body[1].rulesetId).toBeNull();
    expect(body[1].rulesetName).toBeNull();
    // The nested ruleset object never leaks; only the resolved name is served.
    expect(body[0].ruleset).toBeUndefined();
  });
});

describe("POST /api/leagues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "North League" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(401);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("creates a league owned by the session user and returns 201", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-1",
      name: "North League",
      description: null,
      ownerId: "user-1",
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "North League", description: "Autumn league" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("league-1");

    // ownerId is injected from the session, never accepted from the client.
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          name: "North League",
          description: "Autumn league",
        }),
      }),
    );
  });

  it("returns 409 when the league name already exists globally", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Duplicate" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(409);
    expect(prismaMock.league.create).toHaveBeenCalled();
  });

  it("returns 400 when the name is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("creates a league and lets the deprecated clock columns persist at DB defaults (D15)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-1",
      name: "Coast League",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Coast League" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    // The route never reads or writes the deprecated fields — the create call
    // carries no clock fields, so the DB applies its schema defaults.
    expect(prismaMock.league.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "user-1",
          name: "Coast League",
        }),
      }),
    );
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockEnabled");
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockSeconds");
    const body = await res.json();
    expect(body.turnClockEnabled).toBe(true);
    expect(body.turnClockSeconds).toBe(240);
  });

  it("ignores a legacy turn-clock payload (not validated, not persisted) — D15 ignore-not-persisted", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-2",
      name: "Navy League",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Navy League", turnClockEnabled: true, turnClockSeconds: 240 }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    // The legacy fields are carried in the body but IGNORED on the way to the DB.
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockEnabled");
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockSeconds");
  });

  it("does NOT reject an out-of-range legacy clock duration and does not persist it (D15)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-3",
      name: "Invalid Clock",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: true,
      turnClockSeconds: 240,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Invalid Clock", turnClockEnabled: true, turnClockSeconds: 3600 }),
        headers: { "content-type": "application/json" },
      }),
    );

    // Legacy clock fields no longer trigger a 400 — they are ignored entirely.
    expect(res.status).toBe(201);
    expect(prismaMock.league.create).toHaveBeenCalled();
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockSeconds");
  });

  it("no update path exists for the deprecated clock fields (immutable by 401/or lack thereof)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-4",
      name: "Immutable",
      description: null,
      ownerId: "user-1",
      turnClockEnabled: false,
      turnClockSeconds: 120,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Immutable", turnClockEnabled: false, turnClockSeconds: 120 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.league.update).not.toHaveBeenCalled();
    // POST still only ever creates; the deprecated option is never written.
    expect(prismaMock.league.create.mock.calls[0][0].data).not.toHaveProperty("turnClockEnabled");
  });

  it("stores a valid ACTIVE rulesetId on the created league (RAU-52)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.ruleset.findFirst.mockResolvedValue({ id: "estandar-bb2025" });
    prismaMock.league.create.mockResolvedValue({
      id: "league-ruleset",
      name: "Ruleset League",
      description: null,
      ownerId: "user-1",
      rulesetId: "estandar-bb2025",
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Ruleset League", rulesetId: "estandar-bb2025" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.rulesetId).toBe("estandar-bb2025");
    expect(prismaMock.ruleset.findFirst).toHaveBeenCalledWith({
      where: { id: "estandar-bb2025", active: true },
      select: { id: true },
    });
    expect(prismaMock.league.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rulesetId: "estandar-bb2025" }),
    });
  });

  it("returns 400 for an unknown or INACTIVE ruleset (never silently ignored)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // Inactive rulesets are not selectable for new leagues.
    prismaMock.ruleset.findFirst.mockResolvedValue(null);

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Bad Ruleset", rulesetId: "inactive-or-unknown" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown ruleset");
    expect(prismaMock.league.create).not.toHaveBeenCalled();
  });

  it("creates a legacy league (rulesetId null) when the payload omits it", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.create.mockResolvedValue({
      id: "league-legacy",
      name: "Legacy League",
      description: null,
      ownerId: "user-1",
      rulesetId: null,
      createdAt: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost:3000/api/leagues", {
        method: "POST",
        body: JSON.stringify({ name: "Legacy League" }),
        headers: { "content-type": "application/json" },
      }),
    );

    expect(res.status).toBe(201);
    expect(prismaMock.ruleset.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.league.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ rulesetId: null }),
    });
  });
});
