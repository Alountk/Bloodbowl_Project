-- incentive-chips (LM-30): the per-side inducement cart purchased while the
-- live match is `ready` (`{ home: [{ id, count }], away: [{ id, count }] }`).
-- Additive; existing rows keep a NULL cart (no backfill, no drop).
-- AlterTable
ALTER TABLE "LiveMatch" ADD COLUMN     "inducements" JSONB;
