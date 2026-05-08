-- Migration: convert Tournament.betEntry and Tournament.prizePool from
-- double precision (Float) to numeric(12,2) (Decimal) to match Wallet.balance.
-- All existing rows have default value 0 — no precision loss possible.
--
-- Rollback SQL:
--   ALTER TABLE "Tournament"
--     ALTER COLUMN "betEntry"  TYPE DOUBLE PRECISION USING "betEntry"::DOUBLE PRECISION,
--     ALTER COLUMN "prizePool" TYPE DOUBLE PRECISION USING "prizePool"::DOUBLE PRECISION;

ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE NUMERIC(12,2) USING "betEntry"::NUMERIC(12,2),
  ALTER COLUMN "prizePool" TYPE NUMERIC(12,2) USING "prizePool"::NUMERIC(12,2);
