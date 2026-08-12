-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('home', 'away');

-- CreateEnum
CREATE TYPE "LiveMatchStatus" AS ENUM ('pending', 'live', 'finished');

-- CreateTable
CREATE TABLE "LiveMatch" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "status" "LiveMatchStatus" NOT NULL DEFAULT 'pending',
    "half" INTEGER NOT NULL DEFAULT 1,
    "turnNumber" INTEGER NOT NULL DEFAULT 1,
    "activeSide" "TeamSide" NOT NULL DEFAULT 'home',
    "homeClock" INTEGER NOT NULL DEFAULT 240,
    "awayClock" INTEGER NOT NULL DEFAULT 240,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "clockStartedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveEvent" (
    "id" TEXT NOT NULL,
    "liveMatchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "side" "TeamSide",
    "playerRosterId" TEXT,
    "half" INTEGER NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LiveMatch" ADD CONSTRAINT "LiveMatch_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveEvent" ADD CONSTRAINT "LiveEvent_liveMatchId_fkey" FOREIGN KEY ("liveMatchId") REFERENCES "LiveMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "LiveMatch_fixtureId_key" ON "LiveMatch"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveEvent_liveMatchId_seq_key" ON "LiveEvent"("liveMatchId", "seq");
