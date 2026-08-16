-- AlterTable
ALTER TABLE "LiveMatch" ADD COLUMN     "concedeProposedBy" "TeamSide";

-- CreateIndex
CREATE INDEX "LiveMatch_fixtureId_idx" ON "LiveMatch"("fixtureId");
