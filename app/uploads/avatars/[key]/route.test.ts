import { describe, expect, it, vi, beforeEach } from "vitest";

const storageMock = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock("@/lib/storage/factory", () => ({
  createStorageAdapter: () => storageMock,
}));

import { GET } from "./route";

describe("GET /uploads/avatars/[key]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves a stored avatar as image/webp with a long immutable cache", async () => {
    storageMock.read.mockResolvedValue(Buffer.from("webp-bytes"));
    const res = await GET(
      new Request("http://localhost:3000/uploads/avatars/u-1.webp"),
      { params: Promise.resolve({ key: "u-1.webp" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toBe("webp-bytes");
    expect(storageMock.read).toHaveBeenCalledWith("avatars/u-1.webp");
  });

  it("rejects a malformed key shape without touching storage", async () => {
    const res = await GET(
      new Request("http://localhost:3000/uploads/avatars/../secret"),
      { params: Promise.resolve({ key: "../secret" }) } as never,
    );

    expect(res.status).toBe(404);
    expect(storageMock.read).not.toHaveBeenCalled();
  });

  it("returns 404 when the adapter has no blob for the key", async () => {
    storageMock.read.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost:3000/uploads/avatars/u-2.webp"),
      { params: Promise.resolve({ key: "u-2.webp" }) } as never,
    );

    expect(res.status).toBe(404);
    expect(storageMock.read).toHaveBeenCalledWith("avatars/u-2.webp");
  });
});
