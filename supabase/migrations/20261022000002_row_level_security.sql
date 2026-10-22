-- 20261022000002_row_level_security.sql
-- Enable Row Level Security (RLS) on all public tables and define strict policies

-- ============================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid recursive policy evaluation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_group_role(p_group_id UUID, p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.group_members
  WHERE group_id = p_group_id
    AND user_id = p_user_id
    AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_admin_group(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

-- Helper to check if two users share at least one active group
CREATE OR REPLACE FUNCTION public.shares_active_group(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members m1
    JOIN public.group_members m2 ON m1.group_id = m2.group_id
    WHERE m1.user_id = p_user_a
      AND m2.user_id = p_user_b
      AND m1.status = 'active'
      AND m2.status = 'active'
  );
$$;

-- Helper to retrieve group_id from a group_expense_id
CREATE OR REPLACE FUNCTION public.get_expense_group_id(p_expense_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id FROM public.group_expenses WHERE id = p_expense_id LIMIT 1;
$$;

-- Helper to retrieve group_id from a settlement_id
CREATE OR REPLACE FUNCTION public.get_settlement_group_id(p_settlement_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT group_id FROM public.settlements WHERE id = p_settlement_id LIMIT 1;
$$;

-- ============================================================================
-- 1. PROFILES RLS
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile, or profiles of users in groups they share
CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.shares_active_group(auth.uid(), id)
    OR email = (auth.jwt() ->> 'email')
  );

-- Users can only insert their own profile
CREATE POLICY "profiles_insert_policy"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Users can only update their own profile fields
CREATE POLICY "profiles_update_policy"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================================
-- 2. GROUPS RLS
-- ============================================================================
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Active members of a group can read the group
CREATE POLICY "groups_select_policy"
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(id, auth.uid()));

-- Any authenticated user can create a group
CREATE POLICY "groups_insert_policy"
  ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Group owners and admins can update the group
CREATE POLICY "groups_update_policy"
  ON public.groups
  FOR UPDATE
  TO authenticated
  USING (public.can_admin_group(id, auth.uid()))
  WITH CHECK (public.can_admin_group(id, auth.uid()));

-- Only group owners can delete or archive a group
CREATE POLICY "groups_delete_policy"
  ON public.groups
  FOR DELETE
  TO authenticated
  USING (public.get_group_role(id, auth.uid()) = 'owner');

-- ============================================================================
-- 3. GROUP MEMBERS RLS
-- ============================================================================
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Active members can see memberships in their groups
CREATE POLICY "group_members_select_policy"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id, auth.uid())
  );

-- Group admins can add members, or creator adds themselves as owner on group creation
CREATE POLICY "group_members_insert_policy"
  ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Creator adding self as owner on group creation
    (user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.groups g WHERE g.id = group_id AND g.created_by = auth.uid()
    ))
    -- Or an admin of the group adding someone
    OR public.can_admin_group(group_id, auth.uid())
  );

-- Group admins can update roles; users can update their own status (e.g. accepting invitation)
CREATE POLICY "group_members_update_policy"
  ON public.group_members
  FOR UPDATE
  TO authenticated
  USING (
    public.can_admin_group(group_id, auth.uid())
    OR user_id = auth.uid()
  )
  WITH CHECK (
    -- Only existing admins can change roles to owner/admin
    (public.can_admin_group(group_id, auth.uid()))
    -- A regular user can only update their own status (not promote themselves)
    OR (user_id = auth.uid() AND role = 'member')
  );

-- Group admins can remove members; users can remove themselves (leave group)
CREATE POLICY "group_members_delete_policy"
  ON public.group_members
  FOR DELETE
  TO authenticated
  USING (
    public.can_admin_group(group_id, auth.uid())
    OR user_id = auth.uid()
  );

-- ============================================================================
-- 4. GROUP INVITATIONS RLS
-- ============================================================================
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations; invitee can view by email or token
CREATE POLICY "group_invitations_select_policy"
  ON public.group_invitations
  FOR SELECT
  TO authenticated
  USING (
    public.can_admin_group(group_id, auth.uid())
    OR invited_by = auth.uid()
    OR invited_email = (auth.jwt() ->> 'email')
  );

-- Only admins/owners can create invitations
CREATE POLICY "group_invitations_insert_policy"
  ON public.group_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_admin_group(group_id, auth.uid())
    AND invited_by = auth.uid()
  );

-- Admins can revoke invitations; invitee can accept
CREATE POLICY "group_invitations_update_policy"
  ON public.group_invitations
  FOR UPDATE
  TO authenticated
  USING (
    public.can_admin_group(group_id, auth.uid())
    OR invited_email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    public.can_admin_group(group_id, auth.uid())
    OR invited_email = (auth.jwt() ->> 'email')
  );

-- ============================================================================
-- 5. PERSONAL EXPENSES RLS
-- ============================================================================
ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personal_expenses_all_policy"
  ON public.personal_expenses
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ============================================================================
-- 6. GROUP EXPENSES RLS
-- ============================================================================
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- Active members of the group can view expenses
CREATE POLICY "group_expenses_select_policy"
  ON public.group_expenses
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

-- Active members of the group can create expenses
CREATE POLICY "group_expenses_insert_policy"
  ON public.group_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_member(group_id, auth.uid())
    AND created_by = auth.uid()
  );

-- Expense creator or group admins can update the expense
CREATE POLICY "group_expenses_update_policy"
  ON public.group_expenses
  FOR UPDATE
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
    AND (created_by = auth.uid() OR public.can_admin_group(group_id, auth.uid()))
  )
  WITH CHECK (
    public.is_group_member(group_id, auth.uid())
  );

-- Expense creator or group admins can delete the expense
CREATE POLICY "group_expenses_delete_policy"
  ON public.group_expenses
  FOR DELETE
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
    AND (created_by = auth.uid() OR public.can_admin_group(group_id, auth.uid()))
  );

-- ============================================================================
-- 7. EXPENSE SPLITS RLS
-- ============================================================================
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Group members can view splits
CREATE POLICY "expense_splits_select_policy"
  ON public.expense_splits
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(public.get_expense_group_id(group_expense_id), auth.uid()));

-- Group members can insert splits for their group's expenses
CREATE POLICY "expense_splits_insert_policy"
  ON public.expense_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_group_member(public.get_expense_group_id(group_expense_id), auth.uid()));

-- Group members can update splits for their group's expenses
CREATE POLICY "expense_splits_update_policy"
  ON public.expense_splits
  FOR UPDATE
  TO authenticated
  USING (public.is_group_member(public.get_expense_group_id(group_expense_id), auth.uid()))
  WITH CHECK (public.is_group_member(public.get_expense_group_id(group_expense_id), auth.uid()));

-- Group members can delete splits for their group's expenses
CREATE POLICY "expense_splits_delete_policy"
  ON public.expense_splits
  FOR DELETE
  TO authenticated
  USING (public.is_group_member(public.get_expense_group_id(group_expense_id), auth.uid()));

-- ============================================================================
-- 8. SETTLEMENTS RLS
-- ============================================================================
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Group members can view settlements
CREATE POLICY "settlements_select_policy"
  ON public.settlements
  FOR SELECT
  TO authenticated
  USING (public.is_group_member(group_id, auth.uid()));

-- Group members can record settlements if they are involved or created it
CREATE POLICY "settlements_insert_policy"
  ON public.settlements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_group_member(group_id, auth.uid())
    AND created_by = auth.uid()
    AND (from_user_id = auth.uid() OR public.can_admin_group(group_id, auth.uid()))
  );

-- Settlement creator or admins can update
CREATE POLICY "settlements_update_policy"
  ON public.settlements
  FOR UPDATE
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
    AND (created_by = auth.uid() OR public.can_admin_group(group_id, auth.uid()))
  )
  WITH CHECK (
    public.is_group_member(group_id, auth.uid())
  );

-- Settlement creator or admins can delete
CREATE POLICY "settlements_delete_policy"
  ON public.settlements
  FOR DELETE
  TO authenticated
  USING (
    public.is_group_member(group_id, auth.uid())
    AND (created_by = auth.uid() OR public.can_admin_group(group_id, auth.uid()))
  );

-- ============================================================================
-- 9. SETTLEMENT ALLOCATIONS RLS
-- ============================================================================
ALTER TABLE public.settlement_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settlement_allocations_all_policy"
  ON public.settlement_allocations
  FOR ALL
  TO authenticated
  USING (public.is_group_member(public.get_settlement_group_id(settlement_id), auth.uid()))
  WITH CHECK (public.is_group_member(public.get_settlement_group_id(settlement_id), auth.uid()));

-- ============================================================================
-- 10. CATEGORIES RLS
-- ============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read system categories, or their own, or their groups
CREATE POLICY "categories_select_policy"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (
    is_system = true
    OR owner_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  );

-- Users can create custom categories for themselves or groups they administer
CREATE POLICY "categories_insert_policy"
  ON public.categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_admin_group(group_id, auth.uid()))
  );

-- Users can update their own categories
CREATE POLICY "categories_update_policy"
  ON public.categories
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_admin_group(group_id, auth.uid()))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_admin_group(group_id, auth.uid()))
  );

-- Users can delete their own categories
CREATE POLICY "categories_delete_policy"
  ON public.categories
  FOR DELETE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR (group_id IS NOT NULL AND public.can_admin_group(group_id, auth.uid()))
  );

-- ============================================================================
-- 11. CURRENCY RATES CACHE RLS
-- ============================================================================
ALTER TABLE public.currency_rates_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read cached exchange rates
CREATE POLICY "rates_cache_select_policy"
  ON public.currency_rates_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert newly fetched exchange rates
CREATE POLICY "rates_cache_insert_policy"
  ON public.currency_rates_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
