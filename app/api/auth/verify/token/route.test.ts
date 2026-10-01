import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST } from "./route";
import { POST as postCode } from "../code/route";
import { LINK_TOKEN_TTL_MS, hashVerificationValue } from "@/lib/verification";
import { AUTH_RATE_LIMITS, resetRateLimits } from "@/lib/rateLimit";

const EMAIL = "coach@example.com";
const TOKEN = "a".repeat(43);
const WRONG_TOKEN = "b".repeat(43);

/** A pending, unexpired activation row for EMAIL + TOKEN. */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    locale: "es",
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationCodeExpiresAt: null,
    emailVerificationTokenHash: hashVerificationValue(TOKEN, EMAIL),
    emailVerificationTokenExpiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost:3000/api/auth/verify/token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const GENERIC_ERROR = "Invalid or expired verification code";

describe("POST /api/auth/verify/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    prismaMock.user.findUnique.mockResolvedValue(pendingRow());
    prismaMock.user.update.mockResolvedValue({});
  });

  it("activates on the correct token and consumes both secrets", async () => {
    const res = await POST(post({ email: EMAIL, token: TOKEN }));

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

  it("answers a wrong token with the generic 400 body", async () => {
    const res = await POST(post({ email: EMAIL, token: WRONG_TOKEN }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: GENERIC_ERROR });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("answers an expired token with the SAME body as a wrong one (no expiry oracle)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      pendingRow({ emailVerificationTokenExpiresAt: new Date(Date.now() - 1000) }),
    );

    const expired = await POST(post({ email: EMAIL, token: TOKEN }));
    const wrong = await POST(post({ email: EMAIL, token: WRONG_TOKEN }));

    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual(await wrong.json());
  });

  it("answers an unknown email with the SAME body as a wrong token (no existence oracle)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const unknown = await POST(post({ email: EMAIL, token: TOKEN }));
    const wrong = await POST(post({ email: EMAIL, token: WRONG_TOKEN }));

    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  it("draws from the SAME attempt budget as the code endpoint (cap → 429)", async () => {
    // Spend HALF the budget through the OTHER endpoint, then finish it here:
    // burning only token→token proved the token bucket, not the sharing this
    // test is named for. A regression that split the keys per endpoint
    // (`verify-code:` / `verify-token:`) stays green under the old body.
    const half = Math.floor(AUTH_RATE_LIMITS.verify.limit / 2);
    for (let i = 0; i < half; i++) {
      const res = await postCode(
        new Request("http://localhost:3000/api/auth/verify/code", {
          method: "POST",
          body: JSON.stringify({ email: EMAIL, code: "000000" }),
          headers: { "content-type": "application/json" },
        }),
      );
      expect(res.status).toBe(400);
    }
    for (let i = 0; i < AUTH_RATE_LIMITS.verify.limit - half; i++) {
      const res = await POST(post({ email: EMAIL, token: WRONG_TOKEN }));
      expect(res.status).toBe(400);
    }

    const denied = await POST(post({ email: EMAIL, token: TOKEN }));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("requires the email half of the pair — a bare token cannot resolve a user", async () => {
    const res = await POST(post({ token: TOKEN }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: GENERIC_ERROR });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
