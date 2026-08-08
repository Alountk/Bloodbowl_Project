/**
 * Normalizes an email for storage and lookup: trims whitespace and lowercases.
 * The signup route stores emails lowercased; authorize MUST apply the same
 * normalization before the Prisma lookup, otherwise a mixed-case login would
 * never match the stored user.
 */
export function normalizeEmail(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}
