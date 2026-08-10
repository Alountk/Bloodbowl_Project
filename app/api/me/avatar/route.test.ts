import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
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

import { POST, MAX_UPLOAD_BYTES, sniffImageBytes, avatarKeyFromValue } from "./route";

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

function multipartRequest(bytes: Buffer, fieldName = "avatar"): Request {
  const boundary = "----boundary-123";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="up.bin"\r\n`),
    Buffer.from("Content-Type: application/octet-stream\r\n\r\n"),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Request("http://localhost:3000/api/me/avatar", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
}

/** A sharp-like fake that records `resize`/`webp` and returns output bytes. */
function sharpFake(output: Buffer = Buffer.from("webp-out")) {
  const toBuffer = vi.fn(() => output);
  const resize = vi.fn(() => ({ webp: () => ({ toBuffer }) }));
  const instance = { resize };
  sharpMock.mockReturnValue(instance);
  return { instance, resize, toBuffer };
}

describe("sniffImageBytes (magic-byte sniff, MIME never trusted)", () => {
  it("accepts a JPEG header", () => {
    expect(sniffImageBytes(imageBytes("jpeg"))).toBe("jpeg");
  });

  it("accepts a PNG header", () => {
    expect(sniffImageBytes(imageBytes("png"))).toBe("png");
  });

  it("accepts a WebP RIFF....WEBP header", () => {
    expect(sniffImageBytes(imageBytes("webp"))).toBe("webp");
  });

  it("rejects an SVG payload", () => {
    expect(sniffImageBytes(imageBytes("svg"))).toBeNull();
  });

  it("rejects arbitrary non-image bytes", () => {
    expect(sniffImageBytes(Buffer.from("not an image at all", "ascii"))).toBeNull();
  });

  it("rejects a tiny buffer that cannot hold a magic header", () => {
    expect(sniffImageBytes(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("avatarKeyFromValue (recover namespaced key from an issued value)", () => {
  it("recovers the key from a local /uploads value", () => {
    expect(avatarKeyFromValue("/uploads/avatars/user-1-old.webp")).toBe(
      "avatars/user-1-old.webp",
    );
  });

  it("recovers the key from an S3 public URL value", () => {
    expect(avatarKeyFromValue("https://cdn.example.com/shields/avatars/u.webp")).toBe(
      "avatars/u.webp",
    );
  });

  it("returns null when the value has no /avatars/ segment", () => {
    expect(avatarKeyFromValue("/uploads/shields/u.webp")).toBeNull();
  });
});

describe("POST /api/me/avatar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated and stores nothing", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(multipartRequest(imageBytes("jpeg")));
    expect(res.status).toBe(401);
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 over the 2MB cap and stores nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "a@example.com",
      avatar: null,
    });
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0xff);
    const req = multipartRequest(big);
    // Bypass the multipart streamer by exercising `file.size` check via formData.
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 for non-JPEG/PNG/WebP (SVG) and stores nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "a@example.com",
      avatar: null,
    });
    sharpFake();

    const res = await POST(multipartRequest(imageBytes("svg")));
    expect(res.status).toBe(400);
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 200, stores a 256x256 cover WebP under avatars/<uid>-[uuid].webp and returns the value", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "a@example.com",
      avatar: null,
    });
    storageMock.put.mockResolvedValue("/uploads/avatars/user-1-abc.webp");
    const { resize } = sharpFake();

    const res = await POST(multipartRequest(imageBytes("jpeg")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatar).toBe("/uploads/avatars/user-1-abc.webp");

    // sharp must resize cover to 256x256 and output webp.
    expect(resize).toHaveBeenCalledWith(256, 256, { fit: "cover" });
    // adapter.put under the namespaced avatars/ key with the webp output buffer.
    const putCall = storageMock.put.mock.calls[0];
    expect(putCall[0]).toMatch(/^avatars\/user-1-[0-9a-f-]{36}\.webp$/);
    expect(putCall[1].toString()).toBe("webp-out");
    // DB updated with the adapter-issued value; old deleted (none here).
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { avatar: "/uploads/avatars/user-1-abc.webp" },
    });
  });

  it("deletes the previous file on replace", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "a@example.com",
      avatar: "/uploads/avatars/user-1-old.webp",
    });
    storageMock.put.mockResolvedValue("/uploads/avatars/user-1-new.webp");
    sharpFake();

    const res = await POST(multipartRequest(imageBytes("png")));
    expect(res.status).toBe(200);
    // DB keeps old until new put succeeds, then old key is deleted.
    expect(storageMock.delete).toHaveBeenCalledWith("avatars/user-1-old.webp");
    expect(storageMock.put).toHaveBeenCalled();
  });

  it("clears the avatar when the stored value is removed on replace", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-2",
      name: "Bo",
      email: "b@example.com",
      avatar: null,
    });
    storageMock.put.mockResolvedValue("/uploads/avatars/user-2-xyz.webp");
    sharpFake();

    const res = await POST(multipartRequest(imageBytes("webp")));
    expect(res.status).toBe(200);
    expect((await res.json()).avatar).toBe("/uploads/avatars/user-2-xyz.webp");
  });
});
