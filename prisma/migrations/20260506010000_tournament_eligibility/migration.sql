ALTER TABLE "Tournament"
  ADD COLUMN IF NOT EXISTS "ratingMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "ratingMax" INTEGER,
  ADD COLUMN IF NOT EXISTS "minGames" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minAccountAgeDays" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Tournament_rating_band_idx"
  ON "Tournament"("universe", "ratingMin", "ratingMax");
