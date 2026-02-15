-- ============================================================
-- Migration: Allow manually-created client profiles
-- 
-- The profiles table had a FK to auth.users(id), which prevents
-- creating profiles for clients who don't have a Supabase auth
-- account. This migration:
--   1. Drops the FK constraint
--   2. Keeps the id as UUID primary key (now with default gen_random_uuid())
--   3. Adds an RLS policy so admins can insert profiles
-- ============================================================

-- Drop the foreign key constraint to auth.users
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Add default UUID generation so manual inserts work
ALTER TABLE public.profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Make email optional for manual clients (they might not have one)
ALTER TABLE public.profiles
  ALTER COLUMN email DROP NOT NULL;

-- Allow admins to insert profiles (for manual client creation)
CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Drop the old insert policy if it conflicts
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

-- Re-create self-insert policy (for OAuth/signup)
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
