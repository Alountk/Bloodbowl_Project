-- live-prayer-rolls (LM-33): the per-side recorded prayer faces rolled for the
-- bought `prayers-to-nuffle` inducements while the live match is `ready`
-- (`{ home: number[], away: number[] }`).
-- Additive; existing rows keep a NULL value (no backfill, no drop).
-- AlterTable
ALTER TABLE "LiveMatch" ADD COLUMN     "prayerRolls" JSONB;
