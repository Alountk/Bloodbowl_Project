// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const sharpMock = vi.hoisted(() => vi.fn());

vi.mock("sharp", () => ({
  __esModule: true,
  default: sharpMock,
}));

import {
  keyFromValue,
  MAX_UPLOAD_BYTES,
  sniffImageBytes,
  toSquareWebp,
} from "./image";

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

/** A sharp-like fake that records `resize`/`webp` and returns output bytes. */
function sharpFake(output: Buffer = Buffer.from("webp-out")) {
  const toBuffer = vi.fn(async () => output);
  const webp = vi.fn(() => ({ toBuffer }));
  const resize = vi.fn(() => ({ webp }));
  const instance = { resize };
  sharpMock.mockReturnValue(instance);
  return { instance, resize, webp, toBuffer };
}

describe("MAX_UPLOAD_BYTES (shared hard cap)", () => {
  it("is 2MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });
});

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

describe("keyFromValue (recover namespaced key from an issued value)", () => {
  it("recovers the avatars key from a local /uploads value", () => {
    expect(keyFromValue("/uploads/avatars/user-1-old.webp", "avatars")).toBe(
      "avatars/user-1-old.webp",
    );
  });

  it("recovers the avatars key from an S3 public URL value", () => {
    expect(keyFromValue("https://cdn.example.com/shields/avatars/u.webp", "avatars")).toBe(
      "avatars/u.webp",
    );
  });

  it("recovers the shields key from a shields value", () => {
    expect(keyFromValue("/uploads/shields/team-1-abc.webp", "shields")).toBe(
      "shields/team-1-abc.webp",
    );
  });

  it("recovers the shields key from an S3 public URL value", () => {
    expect(keyFromValue("https://cdn.example.com/avatars/shields/t-9.webp", "shields")).toBe(
      "shields/t-9.webp",
    );
  });

  it("returns null when the value has no /avatars/ segment", () => {
    expect(keyFromValue("/uploads/shields/u.webp", "avatars")).toBeNull();
  });

  it("returns null when the value has no /shields/ segment", () => {
    expect(keyFromValue("/uploads/avatars/u.webp", "shields")).toBeNull();
  });
});

describe("toSquareWebp (server square cover-crop to WebP)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cover-crops 256x256 and outputs webp bytes", async () => {
    const { resize, webp } = sharpFake();
    const out = await toSquareWebp(imageBytes("jpeg"), 256);
    expect(out.toString()).toBe("webp-out");
    expect(resize).toHaveBeenCalledWith(256, 256, { fit: "cover" });
    expect(webp).toHaveBeenCalled();
  });

  it("cover-crops 512x512 when px is 512", async () => {
    const { resize, webp } = sharpFake(Buffer.from("shield-out"));
    const out = await toSquareWebp(imageBytes("png"), 512);
    expect(out.toString()).toBe("shield-out");
    expect(resize).toHaveBeenCalledWith(512, 512, { fit: "cover" });
    expect(webp).toHaveBeenCalled();
  });
});
