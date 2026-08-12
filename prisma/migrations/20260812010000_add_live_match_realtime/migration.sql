-- AlterTable
-- League-level turn-clock option (AC-10). Both columns are NOT NULL with the
-- DB defaults `true` / `240`, so the additive ALTER backfills every EXISTING
-- league row with clocks enabled at 240s — matching the Prisma schema defaults
-- (@default(true) / @default(240)). The option is immutable after creation
-- (no update path exists on the league creation API).
ALTER TABLE "League" ADD COLUMN     "turnClockEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "turnClockSeconds" INTEGER NOT NULL DEFAULT 240;
