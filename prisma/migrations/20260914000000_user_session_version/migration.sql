-- security-hardening: per-user session version for JWT invalidation on
-- password change. Additive; existing rows default to 0 (valid immediately).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
