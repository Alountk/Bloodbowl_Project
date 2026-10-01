import { describe, expect, it } from "vitest";
import {
  ATTEMPT_CAP,
  CODE_TTL_MS,
  LINK_TOKEN_TTL_MS,
  RESEND_COOLDOWN_MS,
  generateLinkToken,
  generateVerificationCode,
  hashVerificationValue,
  isExpired,
  newVerificationSecrets,
} from "./verification";

describe("policy constants", () => {
  it("pins the windows and caps from issue #197", () => {
    expect(CODE_TTL_MS).toBe(15 * 60 * 1000);
    expect(LINK_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(ATTEMPT_CAP).toBe(5);
    expect(RESEND_COOLDOWN_MS).toBe(60 * 1000);
  });

  it("makes the activation link outlive the typed code (the closed-tab fallback)", () => {
    expect(LINK_TOKEN_TTL_MS).toBeGreaterThan(CODE_TTL_MS);
  });
});

describe("generateVerificationCode", () => {
  it("is always a 6-digit string, leading zeros included", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it("varies across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, generateVerificationCode));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateLinkToken", () => {
  it("is 32 random bytes as base64url (43 chars, URL-safe)", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateLinkToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it("varies across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, generateLinkToken));
    expect(tokens.size).toBe(20);
  });
});

describe("hashVerificationValue", () => {
  const email = "coach@example.com";

  it("is deterministic for the same value + email", () => {
    expect(hashVerificationValue("123456", email)).toBe(
      hashVerificationValue("123456", email),
    );
  });

  it("is a 64-char hex digest that never equals the plaintext", () => {
    const hashed = hashVerificationValue("123456", email);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toBe("123456");
  });

  it("separates domains: the same code for another email hashes differently", () => {
    expect(hashVerificationValue("123456", email)).not.toBe(
      hashVerificationValue("123456", "other@example.com"),
    );
  });

  it("separates values: a different code for the same email hashes differently", () => {
    expect(hashVerificationValue("123456", email)).not.toBe(
      hashVerificationValue("123457", email),
    );
  });
});

describe("isExpired", () => {
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("treats null (never issued / consumed) as expired", () => {
    expect(isExpired(null, now)).toBe(true);
  });

  it("keeps a future expiry valid and a past one expired", () => {
    expect(isExpired(new Date("2026-10-01T12:00:01.000Z"), now)).toBe(false);
    expect(isExpired(new Date("2026-10-01T11:59:59.000Z"), now)).toBe(true);
  });

  it("expires exactly at the boundary (no extra grace second)", () => {
    expect(isExpired(now, now)).toBe(true);
  });
});

describe("newVerificationSecrets", () => {
  const email = "coach@example.com";
  const now = new Date("2026-10-01T12:00:00.000Z");

  it("returns plaintexts plus hashes derived from them, domain-separated by email", () => {
    const secrets = newVerificationSecrets(email, now);
    expect(secrets.code).toMatch(/^\d{6}$/);
    expect(secrets.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secrets.data.emailVerificationCodeHash).toBe(
      hashVerificationValue(secrets.code, email),
    );
    expect(secrets.data.emailVerificationTokenHash).toBe(
      hashVerificationValue(secrets.token, email),
    );
  });

  it("applies the 15-minute and 24-hour expiries", () => {
    const secrets = newVerificationSecrets(email, now);
    expect(secrets.data.emailVerificationCodeExpiresAt).toEqual(
      new Date(now.getTime() + CODE_TTL_MS),
    );
    expect(secrets.data.emailVerificationTokenExpiresAt).toEqual(
      new Date(now.getTime() + LINK_TOKEN_TTL_MS),
    );
  });

  it("issues fresh secrets on every call (a resend invalidates the old pair)", () => {
    const first = newVerificationSecrets(email, now);
    const second = newVerificationSecrets(email, now);
    expect(second.code).not.toBe(first.code);
    expect(second.token).not.toBe(first.token);
  });
});
