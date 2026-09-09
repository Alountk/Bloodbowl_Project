// @vitest-environment node
//
// jsdom 27 expone su propio `Request` global cuyo `formData()` no parsea
// bodies multipart (ni armados a mano ni FormData real). Esta ruta solo usa
// Request/Response + mocks (sin DOM), así que corre en el entorno `node`,
// donde `Request` es el de undici y `req.formData()` funciona igual que en
// producción.
import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));
const storageMock = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
}));
const sharpMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/storage/factory", () => ({
  createStorageAdapter: () => storageMock,
}));

vi.mock("sharp", () => ({
  __esModule: true,
  default: sharpMock,
}));

import { DELETE, POST } from "./route";

/** Build a minimal valid image buffer the sniff helper accepts. */
function imageBytes(kind: "jpeg" | "png" | "webp" | "svg"): Buffer {
  switch (kind) {
    case "jpeg":
      // ≥8 bytes so the sniff minimum-length guard accepts it.
      return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04, 0x05]);
    case "png":
      return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    case "webp":
      // RIFF....WEBP
      return Buffer.concat([
        Buffer.from("RIFF", "ascii"),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from("WEBP", "ascii"),
        Buffer.from([0x01, 0x02]),
      ]);
    case "svg":
      return Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>", "ascii");
  }
}

function multipartRequest(bytes: Buffer, fieldName = "shield"): Request {
  const boundary = "----boundary-123";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="up.bin"\r\n`),
    Buffer.from("Content-Type: application/octet-stream\r\n\r\n"),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Request("http://localhost:3000/api/teams/t1/shield", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

function shieldRequest(
  req: Request,
  teamId = "t1",
): Promise<Response> {
  return POST(req, { params: Promise.resolve({ id: teamId }) } as never);
}

function shieldDeleteRequest(teamId = "t1"): Promise<Response> {
  return DELETE(
    new Request(`http://localhost:3000/api/teams/${teamId}/shield`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: teamId }) } as never,
  );
}

/** A sharp-like fake that records `resize`/`webp` and returns output bytes. */
function sharpFake(output: Buffer = Buffer.from("webp-out")) {
  const toBuffer = vi.fn(() => output);
  const resize = vi.fn(() => ({ webp: () => ({ toBuffer }) }));
  const instance = { resize };
  sharpMock.mockReturnValue(instance);
  return { instance, resize, toBuffer };
}

/** A Team row returned by the owner guard `findFirst` query. */
function ownedTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "user-1",
    archivedAt: null,
    emblem: null,
    ...overrides,
  };
}

describe("POST /api/teams/[id]/shield", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated and stores nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await shieldRequest(multipartRequest(imageBytes("jpeg")));
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 over the 2MB cap before any owner lookup and stores nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0xff);
    const res = await shieldRequest(multipartRequest(big));
    expect(res.status).toBe(400);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 for non-JPEG/PNG/WebP (SVG) and stores nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    sharpFake();
    const res = await shieldRequest(multipartRequest(imageBytes("svg")));
    expect(res.status).toBe(400);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the shield file field is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await shieldRequest(multipartRequest(imageBytes("png"), "avatar"));
    expect(res.status).toBe(400);
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign, missing, or archived team (owner-scoped findFirst)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // A team owned by someone else (or archived) is not found by the
    // `{ id, userId, archivedAt: null }` predicate → 404, no existence leak.
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await shieldRequest(multipartRequest(imageBytes("jpeg")), "foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-team", userId: "user-1", archivedAt: null },
    });
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 200, stores a 512x512 cover WebP under shields/<teamId>-[uuid].webp and returns the value", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(ownedTeam());
    storageMock.put.mockResolvedValue("/uploads/shields/t1-abc.webp");
    const { resize } = sharpFake();

    const res = await shieldRequest(multipartRequest(imageBytes("jpeg")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emblem).toBe("/uploads/shields/t1-abc.webp");

    // sharp must resize cover to 512x512 and output webp.
    expect(resize).toHaveBeenCalledWith(512, 512, { fit: "cover" });
    // adapter.put under the namespaced shields/ key with the webp output buffer.
    const putCall = storageMock.put.mock.calls[0];
    expect(putCall[0]).toMatch(/^shields\/t1-[0-9a-f-]{36}\.webp$/);
    expect(putCall[1].toString()).toBe("webp-out");
    // DB updated with the adapter-issued value; no previous blob to delete.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { emblem: "/uploads/shields/t1-abc.webp" },
    });
    expect(storageMock.delete).not.toHaveBeenCalled();
  });

  it("replaces an existing emblem and deletes the previous blob only after the put succeeds", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(
      ownedTeam({ emblem: "/uploads/shields/t1-old.webp" }),
    );
    storageMock.put.mockResolvedValue("/uploads/shields/t1-new.webp");
    sharpFake();

    const res = await shieldRequest(multipartRequest(imageBytes("png")));
    expect(res.status).toBe(200);
    expect((await res.json()).emblem).toBe("/uploads/shields/t1-new.webp");
    // The old DB value is kept until the new put succeeded, then the previous
    // blob key is recovered from the issued value and deleted.
    expect(storageMock.delete).toHaveBeenCalledWith("shields/t1-old.webp");
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { emblem: "/uploads/shields/t1-new.webp" },
    });
  });
});

describe("DELETE /api/teams/[id]/shield", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated and touches nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await shieldDeleteRequest("t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign, missing, or archived team (owner-scoped findFirst)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await shieldDeleteRequest("foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-team", userId: "user-1", archivedAt: null },
    });
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("no-ops with 204 when the team has no emblem (no blob operation)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(ownedTeam({ emblem: null }));
    const res = await shieldDeleteRequest("t1");
    expect(res.status).toBe(204);
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("removes the shield: deletes the stored blob and persists emblem null", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(
      ownedTeam({ emblem: "/uploads/shields/t1-old.webp" }),
    );
    const res = await shieldDeleteRequest("t1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emblem: null });
    // The blob key is recovered from the adapter-issued value and deleted.
    expect(storageMock.delete).toHaveBeenCalledWith("shields/t1-old.webp");
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { emblem: null },
    });
  });

  it("clears emblem safely when the stored value has no recoverable /shields/ key", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(
      ownedTeam({ emblem: "/uploads/avatars/user-x.webp" }),
    );
    const res = await shieldDeleteRequest("t1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emblem: null });
    // Nothing to recover → the blob delete is skipped (safe) and the DB is
    // still cleared so the deterministic placeholder renders.
    expect(storageMock.delete).not.toHaveBeenCalled();
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { emblem: null },
    });
  });
});
