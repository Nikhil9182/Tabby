-- 20261023000002_direct_expense_rls.sql
-- Fix: direct (friend) expenses showed "0 participants", never appeared on the
-- friend page, and could not be edited or deleted. Every expense_splits policy
-- and the group_expenses write policies only checked group membership, and a
-- direct expense has group_id = NULL, so they always failed for both friends.
-- These policies are additive: Postgres ORs them with the existing group ones.

-- ============================================================================
-- HELPERS (SECURITY DEFINER to avoid recursive policy evaluation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_friendship_member(p_friendship_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE id = p_friendship_id
      AND (user_id_1 = p_user_id OR user_id_2 = p_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_direct_expense(p_expense_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_expenses e
    JOIN public.friendships f ON f.id = e.friendship_id
    WHERE e.id = p_expense_id
      AND e.context_type = 'direct'
      AND (f.user_id_1 = p_user_id OR f.user_id_2 = p_user_id)
  );
$$;

-- ============================================================================
-- EXPENSE SPLITS: both friends can read and manage splits of their direct expenses
-- ============================================================================
DROP POLICY IF EXISTS "expense_splits_direct_select" ON public.expense_splits;
CREATE POLICY "expense_splits_direct_select"
  ON public.expense_splits
  FOR SELECT
  TO authenticated
  USING (public.can_access_direct_expense(group_expense_id, auth.uid()));

DROP POLICY IF EXISTS "expense_splits_direct_insert" ON public.expense_splits;
CREATE POLICY "expense_splits_direct_insert"
  ON public.expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_direct_expense(group_expense_id, auth.uid()));

DROP POLICY IF EXISTS "expense_splits_direct_update" ON public.expense_splits;
CREATE POLICY "expense_splits_direct_update"
  ON public.expense_splits
  FOR UPDATE
  TO authenticated
  USING (public.can_access_direct_expense(group_expense_id, auth.uid()))
  WITH CHECK (public.can_access_direct_expense(group_expense_id, auth.uid()));

DROP POLICY IF EXISTS "expense_splits_direct_delete" ON public.expense_splits;
CREATE POLICY "expense_splits_direct_delete"
  ON public.expense_splits
  FOR DELETE
  TO authenticated
  USING (public.can_access_direct_expense(group_expense_id, auth.uid()));

-- ============================================================================
-- GROUP EXPENSES: write access for direct expenses (either friend)
-- ============================================================================
DROP POLICY IF EXISTS "group_expenses_direct_insert" ON public.group_expenses;
CREATE POLICY "group_expenses_direct_insert"
  ON public.group_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    context_type = 'direct'
    AND created_by = auth.uid()
    AND public.is_friendship_member(friendship_id, auth.uid())
  );

DROP POLICY IF EXISTS "group_expenses_direct_update" ON public.group_expenses;
CREATE POLICY "group_expenses_direct_update"
  ON public.group_expenses
  FOR UPDATE
  TO authenticated
  USING (
    context_type = 'direct'
    AND public.is_friendship_member(friendship_id, auth.uid())
  )
  WITH CHECK (
    context_type = 'direct'
    AND public.is_friendship_member(friendship_id, auth.uid())
  );

DROP POLICY IF EXISTS "group_expenses_direct_delete" ON public.group_expenses;
CREATE POLICY "group_expenses_direct_delete"
  ON public.group_expenses
  FOR DELETE
  TO authenticated
  USING (
    context_type = 'direct'
    AND public.is_friendship_member(friendship_id, auth.uid())
  );
