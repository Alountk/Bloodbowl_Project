-- RAU-58: per-account UI locale (es|en). Additive; existing accounts default to
-- "es" (the pre-RAU-58 behavior, where the locale was cookie-only).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'es';
