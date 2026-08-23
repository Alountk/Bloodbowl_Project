-- Per-side end-of-match resolution wizard cursor (`{ home: { step, fansDone,
-- fans, mvpConfirmed, mvpRolled, casualtiesDone, journeymenDone }, away: {...} }`).
-- Additive; null until the wizard's first action. The modal resumes at the
-- persisted step after a close/refresh; the match closes when BOTH sides reach
-- "done".
-- AlterTable
ALTER TABLE "LiveMatch" ADD COLUMN     "resolutionState" JSONB;
