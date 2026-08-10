import { afterEach, describe, expect, it, vi } from "vitest";
import { getMe, patchMe, uploadAvatar } from "./api";

/** api.ts contract tests matching the leagues api.test.ts fetch-stub pattern. */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

describe("getMe", () => {
  it("GETs /api/me and returns the profile", async () => {
    const me = { id: "u1", name: "Coach", email: "c@x.com", avatar: null };
    const fetchMock = vi.fn().mockResolvedValue(okJson(me));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMe();

    expect(fetchMock).toHaveBeenCalledWith("/api/me");
    expect(result.id).toBe("u1");
    expect(result.name).toBe("Coach");
    expect(result.avatar).toBeNull();
  });

  it("propagates an HTTP error status when GET fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Unauthorized" }),
      }),
    );

    await expect(getMe()).rejects.toThrow("Unauthorized");
  });
});

describe("patchMe", () => {
  it("PATCHes {name} as JSON to /api/me and returns the updated profile", async () => {
    const updated = { id: "u1", name: "Nuevo", email: "c@x.com", avatar: null };
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchMe({ name: "Nuevo" });

    expect(fetchMock).toHaveBeenCalledWith("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nuevo" }),
    });
    expect(result.name).toBe("Nuevo");
  });

  it("propagates a 400 error for an invalid patch payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Unknown field: avatar" }),
      }),
    );

    await expect(patchMe({ avatar: "http://evil" })).rejects.toThrow(
      "Unknown field: avatar",
    );
  });
});

describe("uploadAvatar", () => {
  it("POSTs the blob as multipart avatar to /api/me/avatar and returns the issued value", async () => {
    const issued = { avatar: "/uploads/avatars/u1-a.webp" };
    const fetchMock = vi.fn().mockResolvedValue(okJson(issued));
    vi.stubGlobal("fetch", fetchMock);
    const blob = new Blob(["webp-bytes"], { type: "image/webp" });

    const result = await uploadAvatar(blob);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/me/avatar");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    // The multipart `avatar` field carries the cropped image (the server
    // duck-types to a Blob, so it never depends on File vs Blob identity).
    const sent = init.body as FormData;
    expect(sent.get("avatar")).toBeInstanceOf(Blob);
    expect(result.avatar).toBe("/uploads/avatars/u1-a.webp");
  });
});
