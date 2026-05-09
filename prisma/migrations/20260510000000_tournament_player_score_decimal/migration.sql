-- Migration: convert TournamentPlayer.score from double precision (Float)
-- to decimal(12,2) (Decimal) for consistent numeric precision in standings.
--
-- All existing scores are small values (typically 0-100 with 0.5 granularity)
-- so precision loss is not a concern.
--
-- Rollback SQL:
--   ALTER TABLE "TournamentPlayer"
--     ALTER COLUMN "score" TYPE DOUBLE PRECISION USING "score"::DOUBLE PRECISION;

ALTER TABLE "TournamentPlayer"
  ALTER COLUMN "score" TYPE DECIMAL(12,2) USING "score"::DECIMAL(12,2);
