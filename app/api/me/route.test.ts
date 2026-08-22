import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, PATCH, patchUserData } from "./route";

function getRequest() {
  return GET();
}

function patchRequest(body: unknown) {
  return PATCH(
    new Request("http://localhost:3000/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("patchUserData (pure allowlist)", () => {
  it("keeps a trimmed current name", () => {
    expect(patchUserData({ name: "  Nuevo  " }, { name: "Antiguo" })).toEqual({
      ok: true,
      data: { name: "Nuevo" },
    });
  });

  it("keeps avatar null (clear)", () => {
    expect(patchUserData({ avatar: null }, { avatar: "/uploads/avatars/x.webp" })).toEqual({
      ok: true,
      data: { avatar: null },
    });
  });

  it("keeps avatar only when it equals the current stored value", () => {
    expect(
      patchUserData({ avatar: "/uploads/avatars/x.webp" }, { avatar: "/uploads/avatars/x.webp" }),
    ).toEqual({ ok: true, data: { avatar: "/uploads/avatars/x.webp" } });
  });

  it("keeps the account locale es or en", () => {
    expect(patchUserData({ locale: "es" }, { locale: "en" })).toEqual({
      ok: true,
      data: { locale: "es" },
    });
    expect(patchUserData({ locale: "en" }, { locale: "es" })).toEqual({
      ok: true,
      data: { locale: "en" },
    });
  });

  it("rejects an invalid locale (fr, uppercase, non-string)", () => {
    for (const bad of ["fr", "ES", "e s", 42, null, ["es"]]) {
      const res = patchUserData({ locale: bad }, { locale: "es" });
      if (res.ok) throw new Error(`expected rejection for ${JSON.stringify(bad)}`);
      expect(res.error).toContain("locale");
    }
  });

  it("rejects an unknown field", () => {
    const res = patchUserData({ email: "h@x.co" }, {});
    if (res.ok) throw new Error("expected rejection");
    expect(res.error).toBeDefined();
  });

  it("rejects a data: URI as avatar", () => {
    const res = patchUserData({ avatar: "data:image/svg+xml;base64,AAAA" }, { avatar: "/uploads/avatars/x.webp" });
    expect(res.ok).toBe(false);
  });

  it("rejects an external http avatar URL", () => {
    const res = patchUserData({ avatar: "https://evil.example/x.svg" }, { avatar: null });
    expect(res.ok).toBe(false);
  });

  it("rejects a json payload whose avatar is missing/null but current is set only when mismatched", () => {
    // avatar not null but not equal to stored value → reject
    const res = patchUserData({ avatar: "/uploads/avatars/other.webp" }, { avatar: "/uploads/avatars/x.webp" });
    expect(res.ok).toBe(false);
  });

  it("produces an empty update when both name and avatar are missing", () => {
    expect(patchUserData({}, { avatar: null })).toEqual({ ok: true, data: {} });
  });
});

describe("GET /api/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await getRequest();
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns id, name, email, avatar, locale for an authenticated user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: "/uploads/avatars/u.webp",
      locale: "en",
    });

    const res = await getRequest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("user-1");
    expect(body.name).toBe("Ada");
    expect(body.email).toBe("ada@example.com");
    expect(body.avatar).toBe("/uploads/avatars/u.webp");
    expect(body.locale).toBe("en");
  });

  it("returns avatar null for a fresh user without an avatar", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
      locale: "es",
    });

    const res = await getRequest();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.avatar).toBeNull();
    expect(body.locale).toBe("es");
  });
});

describe("PATCH /api/me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await patchRequest({ name: "Nuevo" });
    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates the display name", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Antiguo",
      email: "ada@example.com",
      avatar: null,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Nuevo",
      email: "ada@example.com",
      avatar: null,
    });

    const res = await patchRequest({ name: "Nuevo" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Nuevo");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { name: "Nuevo" },
    });
  });

  it("clears the avatar with null", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: "/uploads/avatars/u.webp",
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
    });

    const res = await patchRequest({ avatar: null });
    expect(res.status).toBe(200);
    expect((await res.json()).avatar).toBeNull();
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { avatar: null },
    });
  });

  it("rejects a data: avatar URI with 400 and leaves the stored value unchanged", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: "/uploads/avatars/u.webp",
    });

    const res = await patchRequest({ avatar: "data:image/svg+xml;base64,AAAA" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("rejects an external avatar URL with 400", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
    });

    const res = await patchRequest({ avatar: "https://evil.example/x.svg" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("updates the account locale", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
      locale: "es",
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
      locale: "en",
    });

    const res = await patchRequest({ locale: "en" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe("en");
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { locale: "en" },
    });
  });

  it("rejects an invalid locale with 400 and leaves the stored value unchanged", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      avatar: null,
      locale: "es",
    });

    const res = await patchRequest({ locale: "fr" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
