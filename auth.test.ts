import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";

const findUniqueMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: findUniqueMock } } }));
// Auth.js itself is not under test, and its internal `next/server` import does
// not resolve when vitest externalizes the package (pnpm + Next 16 exports) —
// so the framework surface is stubbed and `authorizeCredentials` (the real,
// extracted callback) is exercised directly.
vi.mock("next-auth", () => ({
  default: vi.fn(() => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() })),
  CredentialsSignin: class CredentialsSignin {
    code = "CredentialsSignin";
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => config,
}));

import { authorizeCredentials } from "./auth";
import { resetRateLimits } from "@/lib/rateLimit";

/**
 * Coverage for the core two-step-signup invariant (issue #197 PR 2).
 *
 * `authorize` refuses an unverified account with `EmailNotVerifiedSignin` —
 * but ONLY after the bcrypt compare. Moving that check earlier would turn the
 * coded refusal into an enumeration oracle (wrong password + unverified email
 * would reveal the account exists, something signup's rate-limited 409 does
 * not). Nothing else in the suite called `authorize`, so a silent reorder
 * stayed green: these tests pin the ORDER through its observable outcomes.
 */
const EMAIL = "coach@example.com";
const PASSWORD = "RightPass123!";
/** Length-valid (the only password rule) so the wrong-password case really
 *  reaches `compare` instead of the early `isPasswordAcceptable` reject. */
const WRONG_PASSWORD = "WrongPass123!";

/** One hash per run: the invariant is the compare ORDER, not the work factor. */
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hash(PASSWORD, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
});

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: EMAIL,
    name: "Coach",
    passwordHash,
    role: "user",
    locale: "es",
    sessionVersion: 1,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("authorizeCredentials (Credentials authorize)", () => {
  it("returns null for a WRONG password on an UNVERIFIED account (no verification oracle)", async () => {
    findUniqueMock.mockResolvedValue(userRow({ emailVerifiedAt: null }));

    // If the emailVerifiedAt check ever moves BEFORE the bcrypt compare, this
    // answer flips to a throw — and the client could distinguish "unverified"
    // from "wrong password" without proving the password. It must stay null.
    await expect(
      authorizeCredentials({ email: EMAIL, password: WRONG_PASSWORD }),
    ).resolves.toBeNull();
  });

  it("throws the coded refusal ONLY when the password is correct on an unverified account", async () => {
    findUniqueMock.mockResolvedValue(userRow({ emailVerifiedAt: null }));

    await expect(
      authorizeCredentials({ email: EMAIL, password: PASSWORD }),
    ).rejects.toMatchObject({ code: "email_not_verified" });
  });

  it("returns the session user for a correct password on a verified account", async () => {
    findUniqueMock.mockResolvedValue(userRow());

    await expect(authorizeCredentials({ email: EMAIL, password: PASSWORD })).resolves.toEqual({
      id: "user-1",
      email: EMAIL,
      name: "Coach",
      role: "user",
      locale: "es",
      sessionVersion: 1,
    });
  });

  it("returns null for an unknown email (the timing-decoy path never verifies)", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      authorizeCredentials({ email: EMAIL, password: PASSWORD }),
    ).resolves.toBeNull();
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { email: EMAIL } });
  });
});
