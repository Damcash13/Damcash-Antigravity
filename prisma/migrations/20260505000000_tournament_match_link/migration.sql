-- Link live Match records to their tournament instead of inferring by time.
ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "tournamentId" TEXT;

CREATE INDEX IF NOT EXISTS "Match_tournamentId_idx" ON "Match"("tournamentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Match_tournamentId_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_tournamentId_fkey"
      FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
