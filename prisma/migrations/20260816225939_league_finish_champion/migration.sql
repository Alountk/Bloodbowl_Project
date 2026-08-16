-- AlterEnum
ALTER TYPE "LeagueStatus" ADD VALUE 'finished';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "championTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_championTeamId_fkey" FOREIGN KEY ("championTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
