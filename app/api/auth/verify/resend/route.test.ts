import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Mail is best-effort: the route answers 200 even when the notifier throws.
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mail/notify", () => ({ notifyEmailVerification: notifyMock }));

import { POST } from "./route";
import { hashVerificationValue } from "@/lib/verification";
import { AUTH_RATE_LIMITS, resetRateLimits } from "@/lib/rateLimit";

const EMAIL = "coach@example.com";

/** A pending (unverified) account — resend issues a fresh pair for it. */
function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    locale: "es",
    emailVerifiedAt: null,
    emailVerificationCodeHash: null,
    emailVerificationCodeExpiresAt: null,
    emailVerificationTokenHash: null,
    emailVerificationTokenExpiresAt: null,
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request("http://localhost:3000/api/auth/verify/resend", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const OK_BODY = { ok: true };

describe("POST /api/auth/verify/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
    prismaMock.user.findUnique.mockResolvedValue(pendingRow());
    prismaMock.user.update.mockResolvedValue({});
    notifyMock.mockResolvedValue(undefined);
  });

  it("issues fresh secrets, stores only hashes, and mails them", async () => {
    const res = await POST(post({ email: EMAIL }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK_BODY);

    const { code, token } = notifyMock.mock.calls[0][0];
    expect(code).toMatch(/^\d{6}$/);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        emailVerificationCodeHash: hashVerificationValue(code, EMAIL),
        emailVerificationTokenHash: hashVerificationValue(token, EMAIL),
        emailVerificationCodeExpiresAt: expect.any(Date),
        emailVerificationTokenExpiresAt: expect.any(Date),
      }),
    });
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", email: EMAIL, locale: "es" }),
    );
  });

  it("enforces the cooldown with 429 on the second resend inside the window", async () => {
    const first = await POST(post({ email: EMAIL }));
    expect(first.status).toBe(200);

    const second = await POST(post({ email: EMAIL }));
    expect(second.status).toBe(429);
    expect(Number(second.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it("caps resends per CALLER ip, so one host cannot mailbomb or reset budgets", async () => {
    // Distinct targets: the per-email cooldown cannot stop this, which is
    // exactly the gap — the caller is what has to be capped.
    for (let i = 0; i < AUTH_RATE_LIMITS.resendIp.limit; i++) {
      const res = await POST(post({ email: `target-${i}@example.com` }));
      expect(res.status).toBe(200);
    }

    const mailBefore = notifyMock.mock.calls.length;
    const writesBefore = prismaMock.user.update.mock.calls.length;
    const denied = await POST(post({ email: "yet-another@example.com" }));
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    // The gate runs before the lookup and before any mail: no work, no oracle.
    // (The five allowed resends DID write — hence before/after, not a null.) */
    expect(notifyMock.mock.calls.length).toBe(mailBefore);
    expect(prismaMock.user.update.mock.calls.length).toBe(writesBefore);
  });

  it("answers an unknown email with the SAME 200 body as a real resend (no oracle)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const unknown = await POST(post({ email: "nobody@example.com" }));

    expect(unknown.status).toBe(200);
    // Identical to the happy path (which returns { ok: true }), and no work:
    // unknown == "do nothing" — no write, no mail.
    expect(await unknown.json()).toEqual(OK_BODY);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("answers an already-verified account with the SAME 200 body and no mail", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      pendingRow({ emailVerifiedAt: new Date("2026-09-01T00:00:00.000Z") }),
    );

    const res = await POST(post({ email: EMAIL }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK_BODY);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("still answers 200 when the notifier throws", async () => {
    notifyMock.mockRejectedValue(new Error("mail provider down"));

    const res = await POST(post({ email: EMAIL }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK_BODY);
  });

  it("rejects a malformed email with 400 before touching the DB", async () => {
    const res = await POST(post({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid email address");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
