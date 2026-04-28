-- ============================================================================
-- DamCash: Enable Row Level Security on ALL public tables
-- ============================================================================
-- WHY: All 9 tables had RLS disabled (UNRESTRICTED). Anyone with the anon key
-- (which is public in the frontend bundle) could read/write any data via the
-- Supabase REST API — including password hashes, wallets, and transactions.
--
-- HOW IT WORKS:
--   - Prisma connects with the `postgres` role → bypasses RLS entirely.
--   - The Supabase REST API uses `anon` or `authenticated` roles → RLS applies.
--   - Enabling RLS with no policies = DENY ALL for anon/authenticated.
--   - We add targeted policies for authenticated users where direct access
--     from the frontend might be useful (read-only on public data).
-- ============================================================================

-- ─── 1. Enable RLS on every table ─────────────────────────────────────────────

ALTER TABLE "User"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Match"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friend"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tournament"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TournamentPlayer"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CorrespondenceGame"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PuzzleProgress"      ENABLE ROW LEVEL SECURITY;

-- ─── 2. Force RLS even for table owners (belt + suspenders) ───────────────────
-- By default the table owner (usually `postgres`) bypasses RLS. Prisma uses
-- `postgres`, so this is fine. But if you ever switch Prisma to a non-owner
-- role, uncomment these lines:
--
-- ALTER TABLE "User"                FORCE ROW LEVEL SECURITY;
-- ALTER TABLE "Wallet"              FORCE ROW LEVEL SECURITY;
-- (etc.)

-- ─── 3. USER table policies ───────────────────────────────────────────────────
-- Public profile data is readable by any authenticated user.
-- Users can only update their own row.
-- Password hashes are NEVER exposed (select list is restricted).

CREATE POLICY "Users can read public profiles"
  ON "User"
  FOR SELECT
  TO authenticated
  USING (true);
-- NOTE: Even though SELECT is allowed, the Supabase client can only see
-- columns the role has SELECT privilege on. You should REVOKE select on
-- passwordHash from anon and authenticated (see below).

CREATE POLICY "Users can update own profile"
  ON "User"
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

-- Block anon from reading users entirely
-- (RLS enabled + no anon policy = denied, but explicit for clarity)
CREATE POLICY "Anon cannot read users"
  ON "User"
  FOR SELECT
  TO anon
  USING (false);

-- ─── 4. WALLET table policies ─────────────────────────────────────────────────
-- Users can only see their own wallet. Never writable via REST API.

CREATE POLICY "Users can read own wallet"
  ON "Wallet"
  FOR SELECT
  TO authenticated
  USING ("userId" = auth.uid()::text);

-- No INSERT/UPDATE/DELETE policies → all writes blocked via REST API
-- (Prisma handles all wallet mutations server-side)

-- ─── 5. TRANSACTION table policies ────────────────────────────────────────────
-- Users can read their own transactions (via their wallet).

CREATE POLICY "Users can read own transactions"
  ON "Transaction"
  FOR SELECT
  TO authenticated
  USING (
    "walletId" IN (
      SELECT id FROM "Wallet" WHERE "userId" = auth.uid()::text
    )
  );

-- No write policies → server-only via Prisma

-- ─── 6. MATCH table policies ──────────────────────────────────────────────────
-- Matches are readable by participants. Public match history is useful,
-- so we allow all authenticated users to read.

CREATE POLICY "Authenticated users can read matches"
  ON "Match"
  FOR SELECT
  TO authenticated
  USING (true);

-- No write policies → server-only via Prisma

-- ─── 7. FRIEND table policies ─────────────────────────────────────────────────
-- Users can see friend requests they sent or received.
-- Users can insert new friend requests (as requester).

CREATE POLICY "Users can read own friend requests"
  ON "Friend"
  FOR SELECT
  TO authenticated
  USING (
    "requesterId" = auth.uid()::text
    OR "addresseeId" = auth.uid()::text
  );

CREATE POLICY "Users can send friend requests"
  ON "Friend"
  FOR INSERT
  TO authenticated
  WITH CHECK ("requesterId" = auth.uid()::text);

CREATE POLICY "Users can update received requests"
  ON "Friend"
  FOR UPDATE
  TO authenticated
  USING ("addresseeId" = auth.uid()::text)
  WITH CHECK ("addresseeId" = auth.uid()::text);

-- ─── 8. TOURNAMENT table policies ─────────────────────────────────────────────
-- Tournaments are publicly readable by authenticated users.

CREATE POLICY "Authenticated users can read tournaments"
  ON "Tournament"
  FOR SELECT
  TO authenticated
  USING (true);

-- No write policies → server-only via Prisma

-- ─── 9. TOURNAMENT PLAYER table policies ──────────────────────────────────────
-- Readable by all authenticated users (leaderboards).

CREATE POLICY "Authenticated users can read tournament players"
  ON "TournamentPlayer"
  FOR SELECT
  TO authenticated
  USING (true);

-- No write policies → server-only via Prisma

-- ─── 10. CORRESPONDENCE GAME table policies ───────────────────────────────────
-- Players can read games they're part of.

CREATE POLICY "Players can read own correspondence games"
  ON "CorrespondenceGame"
  FOR SELECT
  TO authenticated
  USING (
    "whiteId" = auth.uid()::text
    OR "blackId" = auth.uid()::text
  );

-- No write policies → server-only via Prisma

-- ─── 11. PUZZLE PROGRESS table policies ───────────────────────────────────────
-- Users can only see and update their own puzzle progress.

CREATE POLICY "Users can read own puzzle progress"
  ON "PuzzleProgress"
  FOR SELECT
  TO authenticated
  USING ("userId" = auth.uid()::text);

CREATE POLICY "Users can update own puzzle progress"
  ON "PuzzleProgress"
  FOR UPDATE
  TO authenticated
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);

-- ─── 12. Revoke direct access to sensitive columns ────────────────────────────
-- Prevent the REST API from ever exposing password hashes.

REVOKE SELECT (   "passwordHash") ON "User" FROM anon, authenticated;

-- ─── 13. Summary ──────────────────────────────────────────────────────────────
-- After running this migration:
--   ✓ RLS enabled on all 9 tables
--   ✓ anon role: ZERO access to any table
--   ✓ authenticated role: read-only on public data, scoped writes on own data
--   ✓ postgres role (Prisma): full access, unaffected by RLS
--   ✓ passwordHash column: revoked from anon + authenticated
-- ============================================================================
