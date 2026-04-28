-- ============================================================
-- DamCash — Complete RLS setup (idempotent, run after schema)
-- This supersedes 20240101000000_initial_rls.sql.
-- All CREATE POLICY statements use IF NOT EXISTS (pg ≥ 15)
-- or are preceded by DROP POLICY IF EXISTS for older pg.
-- ============================================================

-- ── Enable RLS on every sensitive table ─────────────────────
ALTER TABLE "User"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Match"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friend"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CorrespondenceGame" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tournament"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TournamentPlayer"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PuzzleProgress"     ENABLE ROW LEVEL SECURITY;

-- ── Helper: resolve the authenticated user's DB row id ──────
-- JWT `sub` = auth.users.id (UUID) = User.id
CREATE OR REPLACE FUNCTION current_user_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT COALESCE(auth.uid()::text, current_setting('app.user_id', true)) $$;


-- ============================================================
-- User
-- ============================================================
DROP POLICY IF EXISTS "users_select_all"  ON "User";
DROP POLICY IF EXISTS "users_update_own"  ON "User";

-- Anyone can read any profile (leaderboard, opponent info)
CREATE POLICY "users_select_all"
  ON "User" FOR SELECT
  USING (true);

-- Only the owner can update their own profile
CREATE POLICY "users_update_own"
  ON "User" FOR UPDATE
  USING (id = current_user_id());

-- INSERTs/DELETEs go through the service-role (Express server or auth trigger).
-- No client-side INSERT/DELETE policy → anon key cannot touch these rows.


-- ============================================================
-- Wallet
-- ============================================================
DROP POLICY IF EXISTS "wallet_select_own"  ON "Wallet";
DROP POLICY IF EXISTS "wallet_update_own"  ON "Wallet";

CREATE POLICY "wallet_select_own"
  ON "Wallet" FOR SELECT
  USING ("userId" = current_user_id());

CREATE POLICY "wallet_update_own"
  ON "Wallet" FOR UPDATE
  USING ("userId" = current_user_id());


-- ============================================================
-- Transaction
-- ============================================================
DROP POLICY IF EXISTS "transaction_select_own" ON "Transaction";

CREATE POLICY "transaction_select_own"
  ON "Transaction" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Wallet" w
      WHERE w.id = "Transaction"."walletId"
        AND w."userId" = current_user_id()
    )
  );

-- All writes are server-side (service role) — no client INSERT/UPDATE policy.


-- ============================================================
-- Match
-- ============================================================
DROP POLICY IF EXISTS "match_select_public"   ON "Match";
DROP POLICY IF EXISTS "match_insert_player"   ON "Match";
DROP POLICY IF EXISTS "match_update_player"   ON "Match";

-- Ended matches are public (game history, analysis, H2H stats).
-- In-progress games are visible only to the two players.
CREATE POLICY "match_select_public"
  ON "Match" FOR SELECT
  USING (
    status = 'ended'
    OR "whiteId" = current_user_id()
    OR "blackId" = current_user_id()
  );

-- Server creates and updates matches via service role — no client policy needed.


-- ============================================================
-- Friend
-- ============================================================
DROP POLICY IF EXISTS "friend_select_own"  ON "Friend";
DROP POLICY IF EXISTS "friend_insert_own"  ON "Friend";
DROP POLICY IF EXISTS "friend_update_own"  ON "Friend";
DROP POLICY IF EXISTS "friend_delete_own"  ON "Friend";

CREATE POLICY "friend_select_own"
  ON "Friend" FOR SELECT
  USING (
    "requesterId" = current_user_id()
    OR "addresseeId" = current_user_id()
  );

CREATE POLICY "friend_insert_own"
  ON "Friend" FOR INSERT
  WITH CHECK ("requesterId" = current_user_id());

-- Only the addressee can accept / reject
CREATE POLICY "friend_update_own"
  ON "Friend" FOR UPDATE
  USING ("addresseeId" = current_user_id());

CREATE POLICY "friend_delete_own"
  ON "Friend" FOR DELETE
  USING (
    "requesterId" = current_user_id()
    OR "addresseeId" = current_user_id()
  );


-- ============================================================
-- CorrespondenceGame
-- ============================================================
DROP POLICY IF EXISTS "corr_select_player"  ON "CorrespondenceGame";
DROP POLICY IF EXISTS "corr_insert_owner"   ON "CorrespondenceGame";
DROP POLICY IF EXISTS "corr_update_player"  ON "CorrespondenceGame";

CREATE POLICY "corr_select_player"
  ON "CorrespondenceGame" FOR SELECT
  USING (
    status = 'ended'                        -- history is public
    OR "whiteId" = current_user_id()
    OR "blackId" = current_user_id()
    OR "blackId" IS NULL                    -- open challenge, anyone can see
  );

CREATE POLICY "corr_insert_owner"
  ON "CorrespondenceGame" FOR INSERT
  WITH CHECK ("whiteId" = current_user_id());

CREATE POLICY "corr_update_player"
  ON "CorrespondenceGame" FOR UPDATE
  USING (
    "whiteId" = current_user_id()
    OR "blackId" = current_user_id()
  );


-- ============================================================
-- Tournament  (read-only from client; writes go through server)
-- ============================================================
DROP POLICY IF EXISTS "tournament_select_all" ON "Tournament";

CREATE POLICY "tournament_select_all"
  ON "Tournament" FOR SELECT
  USING (true);


-- ============================================================
-- TournamentPlayer
-- ============================================================
DROP POLICY IF EXISTS "tplayer_select_all"  ON "TournamentPlayer";
DROP POLICY IF EXISTS "tplayer_insert_own"  ON "TournamentPlayer";
DROP POLICY IF EXISTS "tplayer_delete_own"  ON "TournamentPlayer";

CREATE POLICY "tplayer_select_all"
  ON "TournamentPlayer" FOR SELECT
  USING (true);

CREATE POLICY "tplayer_insert_own"
  ON "TournamentPlayer" FOR INSERT
  WITH CHECK ("userId" = current_user_id());

CREATE POLICY "tplayer_delete_own"
  ON "TournamentPlayer" FOR DELETE
  USING ("userId" = current_user_id());


-- ============================================================
-- PuzzleProgress
-- ============================================================
DROP POLICY IF EXISTS "puzzle_select_own"  ON "PuzzleProgress";
DROP POLICY IF EXISTS "puzzle_upsert_own"  ON "PuzzleProgress";

CREATE POLICY "puzzle_select_own"
  ON "PuzzleProgress" FOR SELECT
  USING ("userId" = current_user_id());

CREATE POLICY "puzzle_upsert_own"
  ON "PuzzleProgress" FOR INSERT
  WITH CHECK ("userId" = current_user_id());

-- UPDATE on own puzzle rows
DROP POLICY IF EXISTS "puzzle_update_own" ON "PuzzleProgress";
CREATE POLICY "puzzle_update_own"
  ON "PuzzleProgress" FOR UPDATE
  USING ("userId" = current_user_id());


-- ============================================================
-- Indexes (all idempotent with IF NOT EXISTS)
-- ============================================================

-- User
CREATE INDEX IF NOT EXISTS "User_chessRating_idx"    ON "User"("chessRating");
CREATE INDEX IF NOT EXISTS "User_checkersRating_idx" ON "User"("checkersRating");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx"      ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_country_idx"        ON "User"(country) WHERE country <> '';

-- Match
CREATE INDEX IF NOT EXISTS "Match_whiteId_idx"       ON "Match"("whiteId");
CREATE INDEX IF NOT EXISTS "Match_blackId_idx"       ON "Match"("blackId");
CREATE INDEX IF NOT EXISTS "Match_universe_status"   ON "Match"(universe, status);
CREATE INDEX IF NOT EXISTS "Match_createdAt_idx"     ON "Match"("createdAt");

-- H2H helper: quickly find matches between two specific players
CREATE INDEX IF NOT EXISTS "Match_h2h_idx"
  ON "Match"("whiteId", "blackId", universe, status, "createdAt");

-- Transaction
CREATE INDEX IF NOT EXISTS "Transaction_walletId_idx"   ON "Transaction"("walletId");
CREATE INDEX IF NOT EXISTS "Transaction_createdAt_idx"  ON "Transaction"("createdAt");

-- Friend
CREATE INDEX IF NOT EXISTS "Friend_requesterId_idx"  ON "Friend"("requesterId");
CREATE INDEX IF NOT EXISTS "Friend_addresseeId_idx"  ON "Friend"("addresseeId");

-- CorrespondenceGame
CREATE INDEX IF NOT EXISTS "CorrGame_whiteId_idx"  ON "CorrespondenceGame"("whiteId");
CREATE INDEX IF NOT EXISTS "CorrGame_blackId_idx"  ON "CorrespondenceGame"("blackId");
CREATE INDEX IF NOT EXISTS "CorrGame_status_idx"   ON "CorrespondenceGame"(status);

-- TournamentPlayer
CREATE INDEX IF NOT EXISTS "TPlayer_tournamentId_idx" ON "TournamentPlayer"("tournamentId");
CREATE INDEX IF NOT EXISTS "TPlayer_userId_idx"       ON "TournamentPlayer"("userId");

-- PuzzleProgress
CREATE INDEX IF NOT EXISTS "Puzzle_userId_idx"   ON "PuzzleProgress"("userId");
CREATE INDEX IF NOT EXISTS "Puzzle_puzzleId_idx" ON "PuzzleProgress"("puzzleId");
