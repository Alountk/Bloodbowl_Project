import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
  },
}));

const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("bcryptjs", () => bcryptMock);

// Mail is best-effort: the signup must return 201 even when the notifier
// fails (mirrors how the propose route test stubs the mail layer).
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mail/notify", () => ({ notifyEmailVerification: notifyMock }));

import { POST } from "./route";
import { MAX_PASSWORD_LENGTH } from "@/lib/password";
import { hashVerificationValue } from "@/lib/verification";
import { AUTH_RATE_LIMITS, resetRateLimits } from "@/lib/rateLimit";

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    notifyMock.mockResolvedValue(undefined);
  });

  it("creates a user and returns 201 with the created user when credentials are valid", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe("user-1");

    // Password must be hashed before persisting — never stored in plaintext.
    expect(bcryptMock.hash).toHaveBeenCalledWith("SuperSecret123!", expect.any(Number));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "coach@example.com",
          passwordHash: "hashed-password",
        }),
      }),
    );
  });

  it("stores an optional trimmed display name", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: "Coach",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "coach@example.com",
        password: "SuperSecret123!",
        name: "  Coach  ",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "coach@example.com",
          passwordHash: "hashed-password",
          name: "Coach",
        }),
      }),
    );
  });

  it("captures the account locale from the bb-locale cookie (RAU-58)", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "en",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: {
        "content-type": "application/json",
        cookie: "bb-locale=en",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "coach@example.com", locale: "en" }),
      }),
    );
    expect((await res.json()).locale).toBe("en");
  });

  it("ignores an invalid bb-locale cookie value and leaves the DB default (es)", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "es",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: {
        "content-type": "application/json",
        cookie: "bb-locale=fr",
      },
    });

    await POST(req);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locale: undefined }),
      }),
    );
  });

  it("returns 400 when the payload is missing required fields", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "", password: "" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("returns 409 with a clear message when the email is already registered", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    const conflict = new Error("Unique constraint failed");
    (conflict as Error & { code?: string }).code = "P2002";
    prismaMock.user.create.mockRejectedValue(conflict);

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "taken@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toBe("An account with this email already exists");
  });

  it("returns 400 when the password is longer than the shared max", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "coach@example.com",
        password: "a".repeat(MAX_PASSWORD_LENGTH + 1),
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(bcryptMock.hash).not.toHaveBeenCalled();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the display name exceeds 50 characters", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "coach@example.com",
        password: "SuperSecret123!",
        name: "n".repeat(51),
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After after the per-IP signup limit", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "burst@example.com",
      name: null,
    });

    const make = () =>
      new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "burst@example.com", password: "SuperSecret123!" }),
        headers: { "content-type": "application/json" },
      });

    for (let i = 0; i < AUTH_RATE_LIMITS.signup.limit; i++) {
      const ok = await POST(make());
      expect(ok.status).toBe(201);
    }

    const denied = await POST(make());
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await denied.json()).error).toBe("Too many requests");
    // The denied attempt never reaches bcrypt/Prisma.
    expect(prismaMock.user.create).toHaveBeenCalledTimes(AUTH_RATE_LIMITS.signup.limit);
  });

  it("stores hashed verification secrets and mails code + link, without changing the 201", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "es",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    // Response body = the created user + the server-resolved `verifyRequired`
    // flag (#197 PR 2) that tells the client whether to show the code screen;
    // no verification SECRETS ever ride the response.
    expect(Object.keys(await res.json()).sort()).toEqual([
      "email",
      "id",
      "locale",
      "name",
      "verifyRequired",
    ]);

    // Only hashes/expiries hit the DB — the stored values are exactly
    // sha256(secret + ":" + email) of the plaintexts that were mailed, and
    // the account starts UNVERIFIED (PR 2 enforces; the migration backfilled
    // old rows).
    const data = prismaMock.user.create.mock.calls[0][0].data;
    const { code, token } = notifyMock.mock.calls[0][0];
    expect(data.emailVerificationCodeHash).toBe(
      hashVerificationValue(code, "coach@example.com"),
    );
    expect(data.emailVerificationTokenHash).toBe(
      hashVerificationValue(token, "coach@example.com"),
    );
    expect(data.emailVerifiedAt).toBeUndefined();

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "coach@example.com",
        locale: "es",
        code: expect.stringMatching(/^\d{6}$/),
        token: expect.any(String),
      }),
    );
  });

  it("still returns 201 when the verification mail fails", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "es",
    });
    notifyMock.mockRejectedValue(new Error("mail provider down"));

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("user-1");
  });

  it("resolves verifyRequired from AUTH_MODE (false = local, true = auth)", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "es",
    });
    const make = () =>
      new Request("http://localhost:3000/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
        headers: { "content-type": "application/json" },
      });

    try {
      // AUTH_MODE=local: no session exists at all, so the client skips the
      // code screen straight to the LocalStorage dashboard.
      vi.stubEnv("AUTH_MODE", "local");
      expect((await (await POST(make())).json()).verifyRequired).toBe(false);

      vi.stubEnv("AUTH_MODE", "auth");
      expect((await (await POST(make())).json()).verifyRequired).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
