-- ============================================================
-- DamCash — Supabase Auth Trigger
-- Creates a User row + Wallet row automatically whenever
-- a new user completes sign-up through Supabase Auth.
--
-- Run ONCE in the Supabase SQL Editor (or as a migration).
-- Requires: the "User" and "Wallet" tables already exist
--           (i.e. Prisma migrations have already run).
-- ============================================================

-- ── Helper called by the trigger ────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- runs with the owner's privileges so it can INSERT
SET search_path = public
AS $$
DECLARE
  _username  TEXT;
  _country   TEXT;
  _user_id   TEXT;
BEGIN
  -- Pull metadata supplied at sign-up:
  --   supabase.auth.signUp({ options: { data: { username, country } } })
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)   -- fallback: email prefix
  );
  _country  := COALESCE(NEW.raw_user_meta_data->>'country', '');
  _user_id  := NEW.id::text;

  -- Upsert so re-triggers (e.g. email confirm) are idempotent
  INSERT INTO "User" (
    id, email, username, "passwordHash", country,
    "chessRating", "peakChessRating",
    "checkersRating", "peakCheckersRating",
    "createdAt", "updatedAt"
  )
  VALUES (
    _user_id,
    NEW.email,
    _username,
    '',           -- password is managed by Supabase Auth, not stored here
    _country,
    1500, 1500,
    1450, 1450,
    NOW(), NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET country   = EXCLUDED.country,
        "updatedAt" = NOW();

  -- Create the wallet if it doesn't exist yet
  INSERT INTO "Wallet" (id, "userId", balance, "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, _user_id, 0, NOW(), NOW())
  ON CONFLICT ("userId") DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Bind the trigger to auth.users ──────────────────────────
-- Drop first so the script is re-runnable
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();


-- ============================================================
-- NOTES
-- ============================================================
-- 1. The trigger fires after Supabase creates the auth.users row,
--    which happens as soon as the user confirms their email
--    (or immediately for non-email-confirm flows).
--
-- 2. The Express GET /api/auth/me endpoint also creates the row
--    on first login as a fallback — the two are idempotent thanks
--    to ON CONFLICT clauses.
--
-- 3. If you ever need to backfill existing auth users:
--
--    INSERT INTO "User" (id, email, username, "passwordHash", country,
--                        "chessRating","peakChessRating",
--                        "checkersRating","peakCheckersRating",
--                        "createdAt","updatedAt")
--    SELECT
--      id::text,
--      email,
--      COALESCE(raw_user_meta_data->>'username', split_part(email,'@',1)),
--      '',
--      COALESCE(raw_user_meta_data->>'country',''),
--      1500, 1500, 1450, 1450,
--      created_at, NOW()
--    FROM auth.users
--    ON CONFLICT (id) DO NOTHING;
--
--    INSERT INTO "Wallet" (id, "userId", balance, "createdAt", "updatedAt")
--    SELECT gen_random_uuid()::text, id::text, 0, NOW(), NOW()
--    FROM auth.users
--    ON CONFLICT ("userId") DO NOTHING;
