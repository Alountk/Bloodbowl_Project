import { describe, expect, it, vi, beforeEach } from "vitest";
import { attachPeToRoster, attachPeToTeams } from "./players";

const prismaMock = vi.hoisted(() => ({
  player: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const roster = [
  { id: "p1", name: "A", positionalKey: "lineman" },
  { id: "p2", name: "B", positionalKey: "blitzer" },
];

describe("attachPeToRoster (RAU-14 pure)", () => {
  it("maps pe onto matching entries and leaves the rest untouched", () => {
    const attached = attachPeToRoster(roster, [
      { rosterPlayerId: "p1", pe: 6 },
      { rosterPlayerId: "p2", pe: 0 },
    ]);
    expect(attached[0]).toEqual({ id: "p1", name: "A", positionalKey: "lineman", pe: 6 });
    expect(attached[1]).toEqual({ id: "p2", name: "B", positionalKey: "blitzer", pe: 0 });
  });

  it("does not mutate the input", () => {
    attachPeToRoster(roster, [{ rosterPlayerId: "p1", pe: 6 }]);
    expect(roster[0]).not.toHaveProperty("pe");
  });
});

describe("attachPeToTeams (RAU-14 DB)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attaches pe for multiple teams in one query", async () => {
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t1", rosterPlayerId: "p1", pe: 6 },
      { teamId: "t2", rosterPlayerId: "p2", pe: 3 },
    ]);
    const teams = [
      { id: "t1", roster: [{ id: "p1", name: "A", positionalKey: "lineman" }] },
      { id: "t2", roster: [{ id: "p2", name: "B", positionalKey: "blitzer" }] },
    ];
    const attached = await attachPeToTeams(teams);

    expect(prismaMock.player.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: { in: ["t1", "t2"] } } }),
    );
    expect(attached[0].roster[0]).toEqual({ id: "p1", name: "A", positionalKey: "lineman", pe: 6 });
    expect(attached[1].roster[0]).toEqual({ id: "p2", name: "B", positionalKey: "blitzer", pe: 3 });
  });

  it("keeps teams without Player rows untouched", async () => {
    prismaMock.player.findMany.mockResolvedValue([]);
    const teams = [{ id: "t1", roster: [{ id: "p1", name: "A", positionalKey: "lineman" }] }];
    const attached = await attachPeToTeams(teams);
    expect(attached[0].roster[0]).not.toHaveProperty("pe");
  });
});
