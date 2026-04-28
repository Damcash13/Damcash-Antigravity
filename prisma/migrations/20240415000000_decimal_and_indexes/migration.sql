-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Float → Decimal(12,2) for all monetary columns
--            + Missing indexes for query performance
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Wallet.balance ───────────────────────────────────────────────────────────
ALTER TABLE "Wallet"
  ALTER COLUMN "balance" TYPE DECIMAL(12,2) USING "balance"::DECIMAL(12,2);

-- ── Transaction.amount ───────────────────────────────────────────────────────
ALTER TABLE "Transaction"
  ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING "amount"::DECIMAL(12,2);

-- ── Match.betAmount ──────────────────────────────────────────────────────────
ALTER TABLE "Match"
  ALTER COLUMN "betAmount" TYPE DECIMAL(12,2) USING "betAmount"::DECIMAL(12,2);

-- ── Tournament financial columns ─────────────────────────────────────────────
ALTER TABLE "Tournament"
  ALTER COLUMN "betEntry"  TYPE DECIMAL(12,2) USING "betEntry"::DECIMAL(12,2),
  ALTER COLUMN "prizePool" TYPE DECIMAL(12,2) USING "prizePool"::DECIMAL(12,2);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- User — leaderboard ordering
CREATE INDEX IF NOT EXISTS "User_chessRating_idx"    ON "User"("chessRating");
CREATE INDEX IF NOT EXISTS "User_checkersRating_idx" ON "User"("checkersRating");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"      ON "User"("createdAt");

-- Match — per-player history lookups + leaderboard filters
CREATE INDEX IF NOT EXISTS "Match_whiteId_idx"     ON "Match"("whiteId");
CREATE INDEX IF NOT EXISTS "Match_blackId_idx"     ON "Match"("blackId");
CREATE INDEX IF NOT EXISTS "Match_universe_status" ON "Match"("universe", "status");
CREATE INDEX IF NOT EXISTS "Match_createdAt_idx"   ON "Match"("createdAt");

-- Transaction — wallet history
CREATE INDEX IF NOT EXISTS "Transaction_walletId_idx"  ON "Transaction"("walletId");
CREATE INDEX IF NOT EXISTS "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- Friend — friend list lookups
CREATE INDEX IF NOT EXISTS "Friend_requesterId_idx" ON "Friend"("requesterId");
CREATE INDEX IF NOT EXISTS "Friend_addresseeId_idx" ON "Friend"("addresseeId");

-- CorrespondenceGame — active game lookups
CREATE INDEX IF NOT EXISTS "CorrespondenceGame_whiteId_idx"  ON "CorrespondenceGame"("whiteId");
CREATE INDEX IF NOT EXISTS "CorrespondenceGame_blackId_idx"  ON "CorrespondenceGame"("blackId");
CREATE INDEX IF NOT EXISTS "CorrespondenceGame_status_idx"   ON "CorrespondenceGame"("status");
