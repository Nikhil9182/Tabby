-- 20261024000001_guest_mode_support.sql
-- Tabby Guest Mode: placeholder friend profile support and migration RLS policies
-- Safe, atomic DO $$ block runnable in the Supabase SQL Editor.

DO $$
BEGIN
  -- 1. ADD COLUMNS FOR PLACEHOLDER/GUEST PROFILES
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_placeholder'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_placeholder BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_by_user_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN created_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- 2. DROP DIRECT FK FROM PROFILES.ID TO AUTH.USERS.ID IF PRESENT
  -- Allows placeholder friend profiles without an auth.users record.
  -- Real users still have id = auth.uid() populated via handle_new_user() trigger.
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'profiles'
      AND constraint_name = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;

  -- 3. RLS POLICIES FOR PLACEHOLDER PROFILES
  -- Allow authenticated users to view placeholder profiles they created
  DROP POLICY IF EXISTS "profiles_select_placeholder_policy" ON public.profiles;
  CREATE POLICY "profiles_select_placeholder_policy"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (created_by_user_id = auth.uid());

  -- Allow authenticated users to insert placeholder profiles for their friends
  DROP POLICY IF EXISTS "profiles_insert_placeholder_policy" ON public.profiles;
  CREATE POLICY "profiles_insert_placeholder_policy"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
      (id = auth.uid()) OR (is_placeholder = true AND created_by_user_id = auth.uid())
    );

  -- 4. RPC: ATOMIC PLACEHOLDER PROFILE CREATION / RESOLUTION
  CREATE OR REPLACE FUNCTION public.create_guest_friend_profile(
    p_id UUID,
    p_name TEXT,
    p_email TEXT DEFAULT NULL
  )
  RETURNS UUID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  DECLARE
    v_creator_id UUID;
    v_clean_email TEXT;
    v_existing_id UUID;
  BEGIN
    v_creator_id := auth.uid();
    IF v_creator_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- If email is provided, check if a profile already exists
    IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
      v_clean_email := lower(trim(p_email));
      SELECT id INTO v_existing_id
      FROM public.profiles
      WHERE lower(trim(email)) = v_clean_email
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
      END IF;
    END IF;

    -- Insert new placeholder profile
    INSERT INTO public.profiles (id, display_name, email, is_placeholder, created_by_user_id)
    VALUES (
      COALESCE(p_id, gen_random_uuid()),
      trim(p_name),
      NULLIF(trim(p_email), ''),
      true,
      v_creator_id
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at = now()
    RETURNING id INTO v_existing_id;

    RETURN v_existing_id;
  END;
  $fn$;

END $$;

-- Summary query for verification in the Supabase SQL Editor
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('is_placeholder', 'created_by_user_id')) AS placeholder_columns_added,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'profiles' AND policyname LIKE '%placeholder%') AS placeholder_policies_count,
  'Guest mode support migration completed successfully' AS status;
