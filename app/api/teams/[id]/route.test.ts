import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE } from "./route";

function deleteRequest(id: string) {
  return DELETE(new Request(`http://localhost:3000/api/teams/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  } as never);
}

describe("DELETE /api/teams/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await deleteRequest("t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("archives (soft-deletes) a team the user owns and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    // Archive is scoped to the id and records an archivedAt timestamp.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("does not hard-delete the row when archiving", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });
    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    // The row must be retained (soft delete) — only an update is issued.
    expect(prismaMock.team.update).toHaveBeenCalled();
  });

  it("returns 404 when the team belongs to another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.team.findFirst.mockResolvedValue(null); // team owned by someone else

    const res = await deleteRequest("foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 and does not archive a team that still belongs to a league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leagueId: "league-1", archivedAt: null });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("archives a team whose leagueId is null", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leagueId: null, archivedAt: null });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    expect(prismaMock.team.update).toHaveBeenCalled();
  });
});
