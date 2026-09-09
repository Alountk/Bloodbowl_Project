-- team-shield (RAU-78): per-team custom shield/emblem storage value issued by
-- the storage adapter (`/uploads/shields/...` path or public S3 URL). Additive;
-- existing rows get emblem = NULL and render the deterministic placeholder.
-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "emblem" TEXT;
