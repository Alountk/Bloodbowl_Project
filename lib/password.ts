/**
 * The single account-password rule for the whole app.
 *
 * Signup and the profile change-password route share these constants so a new
 * password can never pass one path and fail the other. The rule is a bounded
 * length: at least `MIN_PASSWORD_LENGTH` (8) and at most
 * `MAX_PASSWORD_LENGTH` (128) — the max keeps bcrypt from grinding on a
 * multi-megabyte JSON field. The confirmation-field check lives in the client
 * form (the server owns no confirmation field by design).
 */

/** Minimum password length for both signup and change-password. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Upper bound on account passwords. bcrypt only ever hashes the first 72
 * bytes, so anything longer is pure CPU waste and a cheap DoS vector through
 * the public signup/change endpoints.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * bcrypt cost factor used to hash account passwords.
 *
 * Defaults to 10 (production strength). E2E runs set `PASSWORD_SALT_ROUNDS=4`
 * via the Playwright webServer env so signup/change-password hashing stays fast
 * across ~130 hashes per suite. Login `compare` reads the cost from the stored
 * hash, so it adapts automatically; production never sets this env.
 */
const envSaltRounds = Number(process.env.PASSWORD_SALT_ROUNDS);
export const PASSWORD_SALT_ROUNDS =
  Number.isInteger(envSaltRounds) && envSaltRounds > 0 ? envSaltRounds : 10;

/** Error code for a failed CURRENT-password check (PATCH /api/me/password). */
export const WRONG_CURRENT_PASSWORD_CODE = "wrong-current-password";

/** Error code for a NEW password failing the shared length rule. */
export const WEAK_NEW_PASSWORD_CODE = "weak-new-password";

/** True when `password` satisfies the shared account-password rule. */
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Full accept rule (min AND max). Prefer this on the server for any new call
 * site; `isPasswordLongEnough` stays for the historical "at least 8" copy.
 */
export function isPasswordAcceptable(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH
  );
}
