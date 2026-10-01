/**
 * Normalizes an email for storage and lookup: trims whitespace and lowercases.
 * The signup route stores emails lowercased; authorize MUST apply the same
 * normalization before the Prisma lookup, otherwise a mixed-case login would
 * never match the stored user.
 */
export function normalizeEmail(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Simple email validation (RFC-loose: something @ something . something).
 * Shared by every server route that accepts an email so the whole API answers
 * "invalid input" for exactly the same set of addresses — a per-route regex
 * would drift and make two endpoints disagree about whether an address exists
 * in a well-formed shape.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
