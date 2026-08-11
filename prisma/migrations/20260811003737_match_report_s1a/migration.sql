-- AlterTable
ALTER TABLE "Fixture" ADD COLUMN     "awayScore" INTEGER,
ADD COLUMN     "homeScore" INTEGER;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "treasury" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "weather" TEXT,
    "scores" JSONB NOT NULL,
    "pettyCash" INTEGER,
    "loadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResultCorrection" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "correctedBy" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResultCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "rosterPlayerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "positionalKey" TEXT NOT NULL,
    "pe" INTEGER NOT NULL DEFAULT 0,
    "skills" JSONB NOT NULL,
    "injuries" JSONB NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "valueBonus" INTEGER NOT NULL DEFAULT 0,
    "improvements" JSONB NOT NULL,
    "attributeIncreases" JSONB NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPendingRoll" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roll1" INTEGER NOT NULL,
    "roll2" INTEGER,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPendingRoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_fixtureId_key" ON "MatchResult"("fixtureId");

-- CreateIndex
CREATE INDEX "MatchResult_fixtureId_idx" ON "MatchResult"("fixtureId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_teamId_rosterPlayerId_key" ON "Player"("teamId", "rosterPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPendingRoll_playerId_key" ON "PlayerPendingRoll"("playerId");

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResultCorrection" ADD CONSTRAINT "MatchResultCorrection_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MatchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPendingRoll" ADD CONSTRAINT "PlayerPendingRoll_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
