import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  scheduleProposal: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";

/** A started-league fixture whose home team belongs to the session participant. */
function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    scheduledAt: null,
    winnerId: null,
    league: { id: "l1", status: "started" },
    homeTeam: { id: "t1", userId: "user-1" },
    awayTeam: { id: "t2", userId: "user-2" },
    ...overrides,
  };
}

/** Runs the interactive transaction callback against a fake tx of Prisma promises. */
function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const data = {
        scheduleProposal: {
          findFirst: prismaMock.scheduleProposal.findFirst,
          updateMany: prismaMock.scheduleProposal.updateMany,
          create: prismaMock.scheduleProposal.create,
        },
      };
      return cb(data as never);
    },
  );
}

function propose(
  body: unknown,
  fixtureId = "f1",
  leagueId = "l1",
  url = `http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/propose`,
) {
  return POST(new Request(url, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: leagueId, fixtureId }),
  } as never);
}

describe("POST /api/leagues/[id]/fixtures/[fixtureId]/propose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
  });

  it("returns 401 and stores nothing when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await propose({ date: "2026-03-01T10:00:00.000Z" });
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.scheduleProposal.create).not.toHaveBeenCalled();
  });

  it("returns 400 and stores nothing when the date is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await propose({});
    expect(res.status).toBe(400);
    expect(prismaMock.scheduleProposal.create).not.toHaveBeenCalled();
  });

  it("returns 404 without leaking existence for a non-participant authenticated user", async () => {
    // The league owner (not a participant) must not learn the fixture exists.
    authMock.mockResolvedValue({ user: { id: "user-3" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ homeTeam: { id: "t1", userId: "user-1" }, awayTeam: { id: "t2", userId: "user-2" } }),
    );
    const res = await propose({ date: "2026-03-01T10:00:00.000Z" });
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleProposal.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a fixture in a non-started league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ league: { id: "l1", status: "open" } }));
    const res = await propose({ date: "2026-03-01T10:00:00.000Z" });
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleProposal.create).not.toHaveBeenCalled();
  });

  it("stores a proposal for a participant and closes no prior proposal", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(null); // no active
    prismaMock.scheduleProposal.create.mockResolvedValue({
      id: "p_new",
      fixtureId: "f1",
      userId: "user-1",
      date: new Date("2026-03-01T10:00:00.000Z"),
      createdAt: new Date("2026-02-02T10:00:00.000Z"),
      acceptedAt: null,
      closedAt: null,
    });

    const res = await propose({ date: "2026-03-01T10:00:00.000Z" });

    expect(res.status).toBe(200);
    // No prior active → no updateMany; a single create in the transaction.
    expect(prismaMock.scheduleProposal.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.scheduleProposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fixtureId: "f1",
          userId: "user-1",
          date: new Date("2026-03-01T10:00:00.000Z"),
        }),
      }),
    );
  });

  it("closes the prior active proposal and creates the new one inside one transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findFirst.mockResolvedValue({
      id: "p_old",
      fixtureId: "f1",
      userId: "user-2",
      date: new Date("2026-02-01T10:00:00.000Z"),
      acceptedAt: null,
      closedAt: null,
    });
    prismaMock.scheduleProposal.create.mockResolvedValue({
      id: "p_new",
      fixtureId: "f1",
      userId: "user-1",
      date: new Date("2026-03-01T10:00:00.000Z"),
      createdAt: new Date("2026-02-03T10:00:00.000Z"),
      acceptedAt: null,
      closedAt: null,
    });

    const res = await propose({ date: "2026-03-01T10:00:00.000Z" });

    expect(res.status).toBe(200);
    // The active proposal is closed and the new one inserted in the SAME tx.
    expect(prismaMock.scheduleProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p_old" },
        data: { closedAt: expect.any(Date) },
      }),
    );
    expect(prismaMock.scheduleProposal.create).toHaveBeenCalled();
  });

  it("returns 409 without storing when the fixture is already scheduled", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ scheduledAt: new Date("2026-03-01") }));
    const res = await propose({ date: "2026-03-05T10:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(prismaMock.scheduleProposal.create).not.toHaveBeenCalled();
  });
});
