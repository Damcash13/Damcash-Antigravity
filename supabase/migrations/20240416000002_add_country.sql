-- ============================================================
-- DamCash — Add country column to User table
-- Run this if you applied the initial Prisma migration BEFORE
-- the country field was added to schema.prisma.
-- Safe to run even if the column already exists (IF NOT EXISTS).
-- ============================================================

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';

-- Back-fill from Supabase auth metadata for existing users
UPDATE "User" u
SET country = COALESCE(a.raw_user_meta_data->>'country', '')
FROM auth.users a
WHERE a.id::text = u.id
  AND (u.country IS NULL OR u.country = '');

-- Optional: index for leaderboard filtering by country
CREATE INDEX IF NOT EXISTS "User_country_idx" ON "User"(country)
  WHERE country <> '';
