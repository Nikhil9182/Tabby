-- 20261023000001_friend_profile_lookup.sql
-- Fix: adding a friend by email failed with "No Tabby account found" because the
-- profiles SELECT policy only exposes profiles that share an active group.
--  1. Exact-email lookup via SECURITY DEFINER RPC (no open profile enumeration)
--  2. Friends can read each other's profiles (names/avatars in friend lists)
--  3. Backfill profiles for any auth users missing one

-- ============================================================================
-- 1. EXACT EMAIL LOOKUP
-- ============================================================================
CREATE OR REPLACE FUNCTION public.find_profile_by_email(p_email TEXT)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.email
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND lower(trim(p.email)) = lower(trim(p_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_profile_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_profile_by_email(TEXT) TO authenticated;

-- ============================================================================
-- 2. FRIENDS CAN READ EACH OTHER'S PROFILES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.are_friends(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id_1 = LEAST(p_user_a, p_user_b)
      AND user_id_2 = GREATEST(p_user_a, p_user_b)
      AND status = 'accepted'
  );
$$;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_active_group(auth.uid(), id)
    OR public.are_friends(auth.uid(), id)
    OR email = (auth.jwt() ->> 'email')
  );

-- ============================================================================
-- 3. BACKFILL MISSING PROFILES
-- ============================================================================
INSERT INTO public.profiles (id, display_name, avatar_url, email)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1),
    'User'
  ),
  u.raw_user_meta_data ->> 'avatar_url',
  u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Fill emails on profiles that were created without one
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR trim(p.email) = '')
  AND u.email IS NOT NULL;
