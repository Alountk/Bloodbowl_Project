-- AlterTable (LM-28/LM-29): additive, nullable, NO backfill.
-- Legacy matches and auto-started (kickoff / TD) turns read back as NULL.
ALTER TABLE "LiveMatch" ADD COLUMN     "lastTurnReason" TEXT;
