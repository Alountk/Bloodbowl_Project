/**
 * The single account-password rule for the whole app.
 *
 * Signup and the profile change-password route share these constants so a new
 * password can never pass one path and fail the other. The rule is deliberately
 * simple: at least `MIN_PASSWORD_LENGTH` characters — exactly what
 * /api/auth/signup has always enforced. The confirmation-field check lives in
 * the client form (the server owns no confirmation field by design).
 */

/** Minimum password length for both signup and change-password. */
export const MIN_PASSWORD_LENGTH = 8;

/** bcrypt cost factor used to hash account passwords. */
export const PASSWORD_SALT_ROUNDS = 10;

/** Error code for a failed CURRENT-password check (PATCH /api/me/password). */
export const WRONG_CURRENT_PASSWORD_CODE = "wrong-current-password";

/** Error code for a NEW password failing the shared length rule. */
export const WEAK_NEW_PASSWORD_CODE = "weak-new-password";

/** True when `password` satisfies the shared account-password rule. */
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
