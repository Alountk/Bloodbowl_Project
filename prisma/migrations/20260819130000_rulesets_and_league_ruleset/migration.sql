-- RAU-52: developer-only "Tipos de reglas" (rulesets).
-- 1. User.role gates the /dev/rulesets section ("developer" = privileged).
-- 2. Ruleset table stores reusable rule definitions.
-- 3. League.rulesetId (nullable) links a league to its chosen ruleset.
-- Additive: legacy leagues keep rulesetId NULL → today's default behavior.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Ruleset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "races" JSONB NOT NULL,
    "startingTreasury" INTEGER NOT NULL DEFAULT 1000000,
    "tvCap" INTEGER,
    "minPlayers" INTEGER NOT NULL DEFAULT 11,
    "maxPlayers" INTEGER NOT NULL DEFAULT 16,
    "hireFire" TEXT NOT NULL DEFAULT 'between-jornadas',
    "seasonReform" BOOLEAN NOT NULL DEFAULT true,
    "mercenaries" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Ruleset_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "rulesetId" TEXT;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_rulesetId_fkey" FOREIGN KEY ("rulesetId") REFERENCES "Ruleset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "League_rulesetId_idx" ON "League"("rulesetId");

-- Seed the default "Estándar BB2025" ruleset (all 31 races, 1M treasury, no TV
-- cap, 11-16 players, hire/fire between jornadas, season reform on, no
-- mercenaries, active). Idempotent: only inserted when the table is empty.
INSERT INTO "Ruleset" (
    "id", "name", "description", "races", "startingTreasury", "tvCap",
    "minPlayers", "maxPlayers", "hireFire", "seasonReform", "mercenaries",
    "active", "createdBy", "createdAt", "updatedAt"
)
SELECT
    'estandar-bb2025',
    'Estándar BB2025',
    'Reglamento completo: todas las razas, presupuesto estándar, sin restricciones.',
    '["human","orc","dwarf","elven-union","skaven","dark-elf","shambling-undead","chaos-chosen","chaos-dwarf","amazon","chaos-renegade","halfling","high-elf","gnome","bretonnian","imperial-nobility","khorne","lizardmen","necromantic-horror","norse","nurgle","ogre","old-world-alliance","snotling","tomb-kings","underworld-denizens","vampire","black-orc","goblin","wood-elf","slann"]'::jsonb,
    1000000,
    NULL,
    11,
    16,
    'between-jornadas',
    true,
    false,
    true,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Ruleset");

-- Promote the obvious existing admin (the owner of the first league ever
-- created) to the developer role. No-op when no league exists yet. Manual
-- promotion for any other account:
--   UPDATE "User" SET role='developer' WHERE email='...';
UPDATE "User" SET role = 'developer'
WHERE id = (SELECT "ownerId" FROM "League" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
