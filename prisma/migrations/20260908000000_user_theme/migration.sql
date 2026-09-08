-- theme-selector: per-account visual theme ("vintage" | "scoreboard").
-- Additive; existing accounts default to "vintage" (the pre-theme-selector
-- behavior, where the theme was attribute-only).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'vintage';
