-- Additive live-match-flow migration (PR 1a, server core).
--
-- All changes are ADDITIVE: no column is dropped or re-typed; `homeClock`/
-- `awayClock` on LiveMatch stay as deprecated-unused columns (no drop, no
-- repurpose) and the League turn-clock columns remain untouched. Rollback is a
-- simple revert of this migration + the PR-1a code.

-- LiveMatchStatus gains `ready` (LM-11: two-phase consent → ready → live).
-- `ALTER TYPE ... ADD VALUE` requires PostgreSQL >= 12 (confirmed: PG 16 on the
-- dev/prod image), so it can run inside a normal transaction without the value
-- being visible to concurrent readers of the enum until the commit. No
-- isolation workaround needed. Never re-used in a later mutable operation.
ALTER TYPE "LiveMatchStatus" ADD VALUE 'ready';

-- LM-11: per-coach consent booleans. Both true → status `ready`.
ALTER TABLE "LiveMatch" ADD COLUMN "homeConsented" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LiveMatch" ADD COLUMN "awayConsented" BOOLEAN NOT NULL DEFAULT false;

-- LM-5: kickoff anchor (informational) + unified per-side millisecond
-- accumulators. `clockStartedAt` keeps its existing column; it is RE-PURPOSED
-- in code as the running segment start (null while paused/pre-live).
ALTER TABLE "LiveMatch" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "LiveMatch" ADD COLUMN "homeTurnMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LiveMatch" ADD COLUMN "awayTurnMs" INTEGER NOT NULL DEFAULT 0;
