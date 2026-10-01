-- email-verification (issue #197, PR 1): additive columns for the two-step
-- activation — a 6-digit typed code AND an activation link ("por si cierra el
-- alta sin querer"). Only hashes are stored (SHA-256 over `secret + ":" +
-- email`: a bare 6-digit code is brute-forceable offline from a DB leak, and
-- domain separation ties each hash to exactly one account).
--
-- Backfill instead of a default: the maintainer decided EXISTING accounts
-- count as verified and only new signups go through verification. Writing
-- now() into the existing rows is the only way to encode that — a column
-- DEFAULT would also mark every FUTURE row verified the moment new signups
-- start landing (and NULL would force every existing coach through a
-- verification they were never asked to do).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "emailVerificationCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN     "emailVerificationTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "emailVerificationTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Existing rows become verified; new signups keep NULL until they confirm.
UPDATE "User" SET "emailVerifiedAt" = now() WHERE "emailVerifiedAt" IS NULL;
