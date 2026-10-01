import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";
import {
  CODE_TTL_MS,
  hashVerificationValue,
} from "@/lib/verification";
import { AUTH_RATE_LIMITS, resetRateLimits } from "@/lib/rateLimit";

const EMAIL = "coach@example.com";
const CODE = "123456";
const WRONG_CODE = "654321";

/** A pending, unexpired verification row for EMAIL + CODE. */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    locale: "es",
    emailVerifiedAt: null,
    emailVerificationCodeHash: hashVerificationValue(CODE, EMAIL),
    emailVerificationCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    emailVerificationTokenHash: null,
    emailVerificationTokenExpiresAt: null,
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost:3000/api/auth/verify/code", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** The ONE body every account-dependent failure must return (no oracle). */
const GENERIC_ERROR = "Invalid or expired verification code";

describe("POST /api/auth/verify/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    prismaMock.user.findUnique.mockResolvedValue(pendingRow());
    prismaMock.user.update.mockResolvedValue({});
  });

  it("marks the account verified on the correct code and consumes the secrets", async () => {
    const res = await POST(post({ email: EMAIL, code: CODE }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        emailVerifiedAt: expect.any(Date),
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
    });
  });

  it("answers 400 with the generic body for a wrong code", async () => {
    const res = await POST(post({ email: EMAIL, code: WRONG_CODE }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: GENERIC_ERROR });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("answers an expired code with the SAME body as a wrong one (no expiry oracle)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      pendingRow({ emailVerificationCodeExpiresAt: new Date(Date.now() - 1000) }),
    );

    const expired = await POST(post({ email: EMAIL, code: CODE }));
    const wrong = await POST(post({ email: EMAIL, code: WRONG_CODE }));

    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual(await wrong.json());
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("answers an unknown email with the SAME body as a wrong code (no existence oracle)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const unknown = await POST(post({ email: EMAIL, code: CODE }));
    const wrong = await POST(post({ email: EMAIL, code: WRONG_CODE }));

    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("stops at the attempt cap with 429, even for the correct code", async () => {
    for (let i = 0; i < AUTH_RATE_LIMITS.verify.limit; i++) {
      const res = await POST(post({ email: EMAIL, code: WRONG_CODE }));
      expect(res.status).toBe(400);
    }

    const denied = await POST(post({ email: EMAIL, code: CODE }));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await denied.json()).error).toBe("Too many requests");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("scopes by the email + secret pair, never by a client-supplied id", async () => {
    const res = await POST(
      post({ email: EMAIL, code: CODE, id: "someone-else", userId: "victim" }),
    );

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: EMAIL } }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "user-1" } }),
    );
  });
});
