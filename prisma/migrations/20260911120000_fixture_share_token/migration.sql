-- match-share-link (RAU-7): per-fixture public read-only share token. Additive;
-- existing rows get shareToken = NULL (no backfill, no drop). Unique so a token
-- resolves to exactly one fixture.
-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_shareToken_key" ON "Fixture"("shareToken");
