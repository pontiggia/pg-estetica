-- ============================================================
-- Migration: Allow admins to update any client profile
--
-- The existing RLS policy only lets users update their own
-- profile (auth.uid() = id). This adds a policy so admins
-- can also update any profile.
-- ============================================================

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
