-- AlterTable
ALTER TABLE "LiveEvent" ADD COLUMN     "ackAt" TIMESTAMP(3),
ADD COLUMN     "ackStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "ackedBy" TEXT;
