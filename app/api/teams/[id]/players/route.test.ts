import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";

interface TeamRow {
  id: string;
  raceId: string;
  roster: { id: string; name: string; positionalKey: string }[];
  coaching: Record<string, unknown>;
  treasury: number;
}

/** A default human team: 11 linemen (550k), no coaching, no winnings. */
function buildTeam(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: "t1",
    raceId: "human",
    roster: Array.from({ length: 11 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      positionalKey: "lineman",
    })),
    coaching: { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
    treasury: 0,
    ...overrides,
  };
}

function callRoute(teamId: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/teams/${teamId}/players`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: teamId }) } as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.team.findFirst.mockResolvedValue(buildTeam());
  prismaMock.team.update.mockResolvedValue(buildTeam());
});

describe("POST /api/teams/[id]/players (hire, RAU-11)", () => {
  it("returns 401 when unauthenticated with no writes", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute("t1", { positionalKey: "blitzer" });
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign/archived team (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await callRoute("t1", { positionalKey: "blitzer" });
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing or non-string positionalKey", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    for (const body of [{}, { positionalKey: "" }, { positionalKey: 5 }]) {
      const res = await callRoute("t1", body);
      expect(res.status).toBe(400);
    }
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a positional that does not belong to the race", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await callRoute("t1", { positionalKey: "kroxigor" });
    expect(res.status).toBe(400);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the positional is already at its max", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // Human blitzer max is 2.
    prismaMock.team.findFirst.mockResolvedValue(
      buildTeam({
        roster: [
          ...Array.from({ length: 11 }, (_, i) => ({
            id: `p${i + 1}`,
            name: `Player ${i + 1}`,
            positionalKey: "lineman",
          })),
          { id: "b1", name: "B1", positionalKey: "blitzer" },
          { id: "b2", name: "B2", positionalKey: "blitzer" },
        ],
      }),
    );
    const res = await callRoute("t1", { positionalKey: "blitzer" });
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the roster is already at the global cap (16)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const roster = Array.from({ length: 16 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Player ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.team.findFirst.mockResolvedValue(buildTeam({ roster }));
    const res = await callRoute("t1", { positionalKey: "lineman" });
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the spendable balance cannot cover the positional cost", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // 11 linemen (550k) + 2 blitzers (170k) + 2 throwers (150k) = 870k;
    // balance = 1M − 870k = 130k < ogre 140k → 409.
    prismaMock.team.findFirst.mockResolvedValue(
      buildTeam({
        roster: [
          ...Array.from({ length: 11 }, (_, i) => ({
            id: `p${i + 1}`,
            name: `Player ${i + 1}`,
            positionalKey: "lineman",
          })),
          { id: "b1", name: "B1", positionalKey: "blitzer" },
          { id: "b2", name: "B2", positionalKey: "blitzer" },
          { id: "t1", name: "T1", positionalKey: "thrower" },
          { id: "t2", name: "T2", positionalKey: "thrower" },
        ],
      }),
    );
    const res = await callRoute("t1", { positionalKey: "ogre" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(String(body.error)).toMatch(/treasury/i);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("uses accumulated winnings (team.treasury) toward the balance", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // Same 870k roster but 200k winnings → balance 330k ≥ ogre 140k → OK.
    const team = buildTeam({
      treasury: 200_000,
      roster: [
        ...Array.from({ length: 11 }, (_, i) => ({
          id: `p${i + 1}`,
          name: `Player ${i + 1}`,
          positionalKey: "lineman",
        })),
        { id: "b1", name: "B1", positionalKey: "blitzer" },
        { id: "b2", name: "B2", positionalKey: "blitzer" },
        { id: "t1", name: "T1", positionalKey: "thrower" },
        { id: "t2", name: "T2", positionalKey: "thrower" },
      ],
    });
    prismaMock.team.findFirst.mockResolvedValue(team);
    prismaMock.team.update.mockResolvedValue({
      ...team,
      roster: [...team.roster, { id: "ogre1", name: "Ogre", positionalKey: "ogre" }],
    });

    const res = await callRoute("t1", { positionalKey: "ogre" });
    expect(res.status).toBe(200);
    expect(prismaMock.team.update).toHaveBeenCalled();
  });

  it("appends a named PlayerEntry and never mutates the treasury", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const team = buildTeam();
    const hired = {
      id: "new-player-1",
      name: "Some Human",
      positionalKey: "blitzer",
    };
    prismaMock.team.update.mockResolvedValue({
      ...team,
      roster: [...team.roster, hired],
      treasury: 0,
    });

    const res = await callRoute("t1", { positionalKey: "blitzer" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.treasury).toBe(0);
    expect(body.roster).toHaveLength(12);

    const call = prismaMock.team.update.mock.calls[0][0] as {
      where: { id: string };
      data: { roster: { id: string; name: string; positionalKey: string }[] };
    };
    expect(call.where).toEqual({ id: "t1" });
    // The treasury is NOT part of the write payload (the balance drops via the
    // roster cost growth, so the hire route must never decrement it).
    expect(call.data).not.toHaveProperty("treasury");

    const appended = call.data.roster[call.data.roster.length - 1];
    expect(appended.positionalKey).toBe("blitzer");
    expect(typeof appended.id).toBe("string");
    expect(appended.id.length).toBeGreaterThan(0);
    expect(typeof appended.name).toBe("string");
    expect(appended.name.length).toBeGreaterThan(0);
    // The auto-name never repeats an existing roster name.
    expect(team.roster.some((p) => p.name === appended.name)).toBe(false);
  });
});
