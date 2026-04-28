-- Migration: add bio and socialLinks to User table
-- Run this in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/wrmxrxsvkdyndhytkgif/sql

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS "socialLinks" JSONB;

-- Confirm columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'User'
  AND column_name IN ('bio', 'socialLinks');
