import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  WRONG_CURRENT_PASSWORD_CODE,
  WEAK_NEW_PASSWORD_CODE,
} from "@/lib/password";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
const bcryptMock = vi.hoisted(() => ({ hash: vi.fn(), compare: vi.fn() }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("bcryptjs", () => bcryptMock);

import { PATCH } from "./route";

function patchRequest(body: unknown) {
  return PATCH(
    new Request("http://localhost:3000/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function invalidJsonRequest() {
  return PATCH(
    new Request("http://localhost:3000/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    }),
  );
}

/** The stored user row the route compares against (passwordHash `OLD_HASH`). */
const OLD_HASH = "hashed-old-password";
function storedUser() {
  return { id: "user-1", email: "ada@example.com", passwordHash: OLD_HASH };
}

describe("PATCH /api/me/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptMock.hash.mockResolvedValue("hashed-new-password");
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await patchRequest({ currentPassword: "x", newPassword: "y" });
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await invalidJsonRequest();
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 when currentPassword or newPassword is not a string", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const res = await patchRequest({ currentPassword: 123, newPassword: "valid-pass-1" });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 (wrong-current code) and never updates when the current password does not match", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue(storedUser());
    bcryptMock.compare.mockResolvedValue(false);

    const res = await patchRequest({ currentPassword: "nope", newPassword: "brand-new-pass" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(WRONG_CURRENT_PASSWORD_CODE);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 (weak-new code) and never updates when the new password is shorter than the signup minimum", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue(storedUser());
    bcryptMock.compare.mockResolvedValue(true);

    const res = await patchRequest({ currentPassword: "old-password", newPassword: "short" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe(WEAK_NEW_PASSWORD_CODE);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("verifies the current password BEFORE validating the new one (no hash on wrong current)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue(storedUser());
    bcryptMock.compare.mockResolvedValue(false);

    await patchRequest({ currentPassword: "wrong", newPassword: "short" });
    expect(bcryptMock.hash).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("hashes the new password with the shared salt rounds and persists it", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue(storedUser());
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.user.update.mockResolvedValue({ ...storedUser(), passwordHash: "hashed-new-password" });

    const res = await patchRequest({ currentPassword: "old-password", newPassword: "new-password-9" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(bcryptMock.compare).toHaveBeenCalledWith("old-password", OLD_HASH);
    expect(bcryptMock.hash).toHaveBeenCalledWith("new-password-9", 10);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: "hashed-new-password" },
    });
  });
});

describe("PATCH /api/me/password — real bcrypt round-trip", () => {
  beforeEach(() => vi.clearAllMocks());

  it("the persisted hash accepts the NEW password and rejects the old one", async () => {
    // vi.importActual bypasses the module mock so the round-trip runs REAL bcrypt.
    const { hash: realHash, compare: realCompare } =
      await vi.importActual<typeof import("bcryptjs")>("bcryptjs");
    const oldHash = await realHash("old-password-123", 10);
    bcryptMock.hash.mockImplementation(realHash);
    bcryptMock.compare.mockImplementation(realCompare);

    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({ ...storedUser(), passwordHash: oldHash });
    prismaMock.user.update.mockResolvedValue({ id: "user-1", passwordHash: "persisted" });

    const res = await patchRequest({ currentPassword: "old-password-123", newPassword: "new-password-456" });
    expect(res.status).toBe(200);

    const persisted = (prismaMock.user.update.mock.calls[0] as [{ data: { passwordHash: string } }])[0]
      .data.passwordHash;
    // A real bcrypt hash (salt prefix), NOT the mocked literal.
    expect(persisted.startsWith("$2")).toBe(true);
    expect(await realCompare("new-password-456", persisted)).toBe(true);
    expect(await realCompare("old-password-123", persisted)).toBe(false);
  });
});
