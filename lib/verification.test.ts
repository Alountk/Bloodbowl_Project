import { afterEach, describe, expect, it, vi } from "vitest";
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

// The E2E-hook tests below stub NODE_ENV and E2E_VERIFICATION_CODE; restore
// both before any other test in this file runs (none of them stub the env,
// so the reset is a no-op for the rest of the suite).
afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe("generateVerificationCode E2E hook (E2E_VERIFICATION_CODE)", () => {
  it("honours a well-formed fixed code outside production (what the e2e suites rely on)", () => {
    vi.stubEnv("E2E_VERIFICATION_CODE", "999999");
    expect(generateVerificationCode()).toBe("999999");
  });

  it("IGNORES the fixed code when NODE_ENV=production (the deployment invariant)", () => {
    vi.stubEnv("E2E_VERIFICATION_CODE", "999999");
    vi.stubEnv("NODE_ENV", "production");

    // A production build must structurally never obey the variable, whatever
    // env is injected — otherwise a deployed bundle would issue a KNOWN code.
    const codes = Array.from({ length: 20 }, generateVerificationCode);
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(codes).not.toContain("999999");
  });

  it("ignores a malformed fixed code (non-6-digit values never pin a code)", () => {
    vi.stubEnv("E2E_VERIFICATION_CODE", "not-a-code");
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code).not.toBe("not-a-code");
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
