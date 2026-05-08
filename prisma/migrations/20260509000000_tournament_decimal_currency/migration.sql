-- Migration: convert Tournament.betEntry and Tournament.prizePool from
-- double precision (Float) to decimal(12,2) (Decimal) to match Wallet.balance.
-- All existing rows have default value 0 — no precision loss possible.
--
-- Note: migration 20240415000000_decimal_and_indexes previously ran equivalent
-- DDL on production databases. This migration is idempotent on PostgreSQL
-- (ALTER COLUMN to the same type is a no-op). It ensures correctness on any
-- fresh database provisioned without the 20240415 migration history.
--
-- Rollback SQL (safe only while all rows have value 0):
--   ALTER TABLE "Tournament"
--     ALTER COLUMN "betEntry"  TYPE DOUBLE PRECISION USING "betEntry"::DOUBLE PRECISION,
--     ALTER COLUMN "prizePool" TYPE DOUBLE PRECISION USING "prizePool"::DOUBLE PRECISION;

ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE DECIMAL(12,2) USING "betEntry"::DECIMAL(12,2),
  ALTER COLUMN "prizePool" TYPE DECIMAL(12,2) USING "prizePool"::DECIMAL(12,2);
