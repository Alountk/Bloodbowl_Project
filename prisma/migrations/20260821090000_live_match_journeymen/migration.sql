-- RAU-14: the journeymen (Novatos) fielded at begin, persisted so the
-- post-resolve HIRE flow can reference them (`{ home: [{ id, name }],
-- away: [{ id, name }] }`). Additive; null until the match begins.
-- AlterTable
ALTER TABLE "LiveMatch" ADD COLUMN     "journeymen" JSONB;
