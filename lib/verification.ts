import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Email-verification domain logic (issue #197): pure functions and policy
 * constants — no I/O, no Prisma, no environment reads — so every rule is
 * unit-testable without mocks. Server wiring (rate limits, DB, HTTP responses)
 * lives in `lib/verificationServer.ts`.
 *
 * Policy mirrors the issue: a 6-digit code the user types, plus a SEPARATE
 * activation link for "por si cierra el alta sin querer". Either one activates.
 */

/** The typed code lives 15 minutes: long enough to read the mail, short
 *  enough that a leaked code ages out quickly. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** The link is the "I closed the tab" fallback, so it must OUTLIVE the code —
 *  a user who comes back the next morning still has a working path. */
export const LINK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Wrong guesses allowed per pending code (mirrored by AUTH_RATE_LIMITS.verify). */
export const ATTEMPT_CAP = 5;

/** Minimum gap between two activation mails to the same address (mirrored by
 *  AUTH_RATE_LIMITS.resend, which enforces it). */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Unbiased 6-digit code (`crypto.randomInt`), always 6 chars incl. leading zeros. */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 256-bit link token, base64url so it survives a query string unescaped. */
export function generateLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Domain-separated SHA-256 for BOTH secrets.
 *
 * A bare 6-digit code has only 10^6 values: stored raw — or hashed WITHOUT the
 * account identity — a DB leak lets an attacker try every candidate offline in
 * milliseconds, and the same code used across accounts would even collide in
 * the hash. Mixing the email into the pre-image means a leaked hash only ever
 * validates against the one account it belongs to. The link token is 256 bits
 * and not practically brute-forceable, but it shares the helper so ONE rule
 * covers both secrets.
 */
export function hashVerificationValue(value: string, email: string): string {
  return createHash("sha256").update(`${value}:${email}`).digest("hex");
}

/** `null` (never issued / already consumed) counts as expired. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

/** Column values to persist next to the plaintexts handed to the mail layer. */
export interface VerificationSecretsData {
  emailVerificationCodeHash: string;
  emailVerificationCodeExpiresAt: Date;
  emailVerificationTokenHash: string;
  emailVerificationTokenExpiresAt: Date;
}

export interface VerificationSecrets {
  /** Plaintext 6-digit code for the mail body. */
  code: string;
  /** Plaintext link token for the mail body (only the hash is stored). */
  token: string;
  /** Prisma column values — spread as `...secrets.data`, never at the top
   *  level, so the plaintexts can never leak into a `create`/`update`. */
  data: VerificationSecretsData;
}

/**
 * Fresh pair of secrets for one account: plaintexts for the mail plus the
 * hashes/expiries to store. Callers persist `...secrets.data` in the SAME
 * statement that creates or updates the user, so the DB never holds a code
 * whose plaintext was not handed to the mail layer in the same request.
 */
export function newVerificationSecrets(email: string, now: Date = new Date()): VerificationSecrets {
  const code = generateVerificationCode();
  const token = generateLinkToken();
  return {
    code,
    token,
    data: {
      emailVerificationCodeHash: hashVerificationValue(code, email),
      emailVerificationCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      emailVerificationTokenHash: hashVerificationValue(token, email),
      emailVerificationTokenExpiresAt: new Date(now.getTime() + LINK_TOKEN_TTL_MS),
    },
  };
}
