import { describe, expect, it, vi, beforeEach } from "vitest";

const storageMock = vi.hoisted(() => ({
  read: vi.fn(),
}));

vi.mock("@/lib/storage/factory", () => ({
  createStorageAdapter: () => storageMock,
}));

import { GET } from "./route";

describe("GET /uploads/shields/[key]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves a stored shield as image/webp with a long immutable cache", async () => {
    storageMock.read.mockResolvedValue(Buffer.from("webp-bytes"));
    const res = await GET(
      new Request("http://localhost:3000/uploads/shields/t-abc-1234.webp"),
      { params: Promise.resolve({ key: "t-abc-1234.webp" }) } as never,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(await res.text()).toBe("webp-bytes");
    expect(storageMock.read).toHaveBeenCalledWith("shields/t-abc-1234.webp");
  });

  it("rejects a traversal key without touching storage", async () => {
    const res = await GET(
      new Request("http://localhost:3000/uploads/shields/../secret"),
      { params: Promise.resolve({ key: "../secret" }) } as never,
    );

    expect(res.status).toBe(404);
    expect(storageMock.read).not.toHaveBeenCalled();
  });

  it("rejects a key outside the server-issued shape without touching storage", async () => {
    // Non-hex suffix and non-webp extension are both outside the issued key
    // shape `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$`.
    const res = await GET(
      new Request("http://localhost:3000/uploads/shields/logo.png"),
      { params: Promise.resolve({ key: "logo.png" }) } as never,
    );

    expect(res.status).toBe(404);
    expect(storageMock.read).not.toHaveBeenCalled();
  });

  it("returns 404 when the adapter has no blob for the key", async () => {
    storageMock.read.mockResolvedValue(null);
    const res = await GET(
      new Request("http://localhost:3000/uploads/shields/t-1.webp"),
      { params: Promise.resolve({ key: "t-1.webp" }) } as never,
    );

    expect(res.status).toBe(404);
    expect(storageMock.read).toHaveBeenCalledWith("shields/t-1.webp");
  });
});
