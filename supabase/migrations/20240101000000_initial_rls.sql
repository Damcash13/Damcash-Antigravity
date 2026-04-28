-- ============================================================
-- DamCash — Row Level Security Policies
-- Apply to the PostgreSQL database that Prisma manages.
-- Run once after the initial Prisma migration creates the tables.
-- ============================================================

-- ── Enable RLS on every sensitive table ─────────────────────
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Match"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friend"       ENABLE ROW LEVEL SECURITY;

-- ── Helper: resolve the authenticated user's DB row id ──────
-- The JWT issued by our Express server carries `sub` = User.id (UUID).
-- Supabase's auth.uid() returns the UUID from the JWT `sub` claim.
CREATE OR REPLACE FUNCTION current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(auth.uid()::text, current_setting('app.user_id', true)) $$;

-- ============================================================
-- User table
-- ============================================================
-- Users can read any profile (public leaderboard) but only update their own.
CREATE POLICY "users_select_all"
  ON "User" FOR SELECT
  USING (true);

CREATE POLICY "users_update_own"
  ON "User" FOR UPDATE
  USING ("id" = current_user_id());

-- Server (service role) handles INSERT/DELETE — no client policy needed.

-- ============================================================
-- Wallet table
-- ============================================================
-- A user may only see and update their own wallet.
CREATE POLICY "wallet_select_own"
  ON "Wallet" FOR SELECT
  USING ("userId" = current_user_id());

CREATE POLICY "wallet_update_own"
  ON "Wallet" FOR UPDATE
  USING ("userId" = current_user_id());

-- ============================================================
-- Transaction table
-- ============================================================
-- A user may only read their own transactions.
-- All writes go through the server (service role).
CREATE POLICY "transaction_select_own"
  ON "Transaction" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Wallet" w
      WHERE w.id = "Transaction"."walletId"
        AND w."userId" = current_user_id()
    )
  );

-- ============================================================
-- Match table
-- ============================================================
-- Players can read any completed match (game history, analysis).
-- Only participants can see in-progress game state.
CREATE POLICY "match_select_public"
  ON "Match" FOR SELECT
  USING (
    "status" = 'ended'
    OR "whiteId" = current_user_id()
    OR "blackId" = current_user_id()
  );

-- ============================================================
-- Friend table
-- ============================================================
CREATE POLICY "friend_select_own"
  ON "Friend" FOR SELECT
  USING (
    "requesterId" = current_user_id()
    OR "addresseeId" = current_user_id()
  );

CREATE POLICY "friend_insert_own"
  ON "Friend" FOR INSERT
  WITH CHECK ("requesterId" = current_user_id());

CREATE POLICY "friend_update_own"
  ON "Friend" FOR UPDATE
  USING ("addresseeId" = current_user_id());   -- only addressee can accept/reject

CREATE POLICY "friend_delete_own"
  ON "Friend" FOR DELETE
  USING (
    "requesterId" = current_user_id()
    OR "addresseeId" = current_user_id()
  );

-- ============================================================
-- Service-role bypass
-- ============================================================
-- The Express server connects with the service-role key / direct URL,
-- which bypasses RLS automatically. No extra policy is needed for it.
-- The policies above protect direct anon-key access from the frontend.

-- ============================================================
-- Indexes to support policy lookups efficiently
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_wallet_userid      ON "Wallet"      ("userId");
CREATE INDEX IF NOT EXISTS idx_transaction_wallet ON "Transaction" ("walletId");
CREATE INDEX IF NOT EXISTS idx_match_white        ON "Match"       ("whiteId");
CREATE INDEX IF NOT EXISTS idx_match_black        ON "Match"       ("blackId");
CREATE INDEX IF NOT EXISTS idx_friend_requester   ON "Friend"      ("requesterId");
CREATE INDEX IF NOT EXISTS idx_friend_addressee   ON "Friend"      ("addresseeId");
