-- ==============================================================================
-- Migration: 20260930000004_add_missing_profile_columns.sql
-- Description: Non-destructive addition of profile security and preference columns
--              (must_change_password, mfa_enrolled, preferred_language, mfa_secret)
--              Strictly preserves all existing production data and profiles.
-- ==============================================================================

-- 1. Add preferred_language column with default 'en' and check constraint
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi'));

-- 2. Add first-login forced password change flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 3. Add MFA enrollment status flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_enrolled BOOLEAN DEFAULT false;

-- 4. Add MFA secret column for TOTP authenticator setup
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- 5. Backfill existing profile rows safely to preserve consistency without modifying any existing data
UPDATE public.profiles
SET
  preferred_language = COALESCE(preferred_language, 'en'),
  must_change_password = COALESCE(must_change_password, false),
  mfa_enrolled = COALESCE(mfa_enrolled, false)
WHERE
  preferred_language IS NULL
  OR must_change_password IS NULL
  OR mfa_enrolled IS NULL;
