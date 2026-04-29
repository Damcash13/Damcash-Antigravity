-- Drop the handle_new_auth_user trigger and function.
--
-- The trigger was causing "database error saving new user" because it derived
-- a username from the email prefix with no uniqueness check — if that username
-- was already taken the INSERT would fail with a unique constraint violation.
--
-- User creation is now handled exclusively by the Express /api/auth/me endpoint
-- which has proper uniqueness fallback logic.
--
-- Run once in Supabase SQL Editor.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
