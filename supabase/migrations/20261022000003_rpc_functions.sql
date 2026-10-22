-- 20261022000003_rpc_functions.sql
-- Atomic RPC functions for groups, expenses with splits, invitation acceptance, and Realtime publication

-- ============================================================================
-- 1. ATOMIC GROUP CREATION (Group + Owner membership in single transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_group_with_owner(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_currency VARCHAR(3) DEFAULT 'USD',
  p_image_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_group_id UUID;
  v_group JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Group name cannot be empty';
  END IF;

  -- 1. Insert the group
  INSERT INTO public.groups (name, description, default_currency, image_url, created_by)
  VALUES (trim(p_name), p_description, upper(trim(p_currency)), p_image_url, v_user_id)
  RETURNING id INTO v_group_id;

  -- 2. Insert creator as owner
  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (v_group_id, v_user_id, 'owner', 'active');

  -- 3. Return created group object
  SELECT to_jsonb(g) INTO v_group FROM public.groups g WHERE g.id = v_group_id;
  RETURN v_group;
END;
$$;

-- ============================================================================
-- 2. ATOMIC EXPENSE WITH SPLITS CREATION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_group_expense_with_splits(
  p_group_id UUID,
  p_description TEXT,
  p_notes TEXT,
  p_category_id UUID,
  p_paid_by UUID,
  p_amount_minor BIGINT,
  p_currency VARCHAR(3),
  p_reporting_currency VARCHAR(3),
  p_exchange_rate NUMERIC,
  p_exchange_rate_date DATE,
  p_exchange_rate_source TEXT,
  p_reporting_amount_minor BIGINT,
  p_split_type TEXT,
  p_expense_date TIMESTAMPTZ,
  p_splits JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_expense_id UUID;
  v_split RECORD;
  v_sum_splits BIGINT := 0;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user is active group member
  IF NOT public.is_group_member(p_group_id, v_user_id) THEN
    RAISE EXCEPTION 'You are not an active member of this group';
  END IF;

  -- Verify payer is active group member
  IF NOT public.is_group_member(p_group_id, p_paid_by) THEN
    RAISE EXCEPTION 'Payer is not an active member of this group';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- 1. Insert Group Expense
  INSERT INTO public.group_expenses (
    group_id, description, notes, category_id, paid_by,
    amount_minor, currency, reporting_currency,
    exchange_rate, exchange_rate_date, exchange_rate_source,
    reporting_amount_minor, split_type, expense_date, created_by
  )
  VALUES (
    p_group_id, trim(p_description), p_notes, p_category_id, p_paid_by,
    p_amount_minor, upper(trim(p_currency)), upper(trim(p_reporting_currency)),
    COALESCE(p_exchange_rate, 1.0), COALESCE(p_exchange_rate_date, CURRENT_DATE),
    COALESCE(p_exchange_rate_source, 'identity'),
    COALESCE(p_reporting_amount_minor, p_amount_minor),
    p_split_type, COALESCE(p_expense_date, now()), v_user_id
  )
  RETURNING id INTO v_expense_id;

  -- 2. Insert Splits and validate sum
  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_splits) AS x(
    user_id UUID,
    share_minor BIGINT,
    weight NUMERIC,
    percentage_basis_points INTEGER
  )
  LOOP
    IF NOT public.is_group_member(p_group_id, v_split.user_id) THEN
      RAISE EXCEPTION 'Split participant % is not an active member of this group', v_split.user_id;
    END IF;

    IF v_split.share_minor < 0 THEN
      RAISE EXCEPTION 'Split share cannot be negative';
    END IF;

    v_sum_splits := v_sum_splits + v_split.share_minor;

    INSERT INTO public.expense_splits (
      group_expense_id, user_id, share_minor, weight, percentage_basis_points
    )
    VALUES (
      v_expense_id, v_split.user_id, v_split.share_minor, v_split.weight, v_split.percentage_basis_points
    );
  END LOOP;

  IF v_sum_splits != p_amount_minor THEN
    RAISE EXCEPTION 'Sum of split shares (%) does not equal total amount (%)', v_sum_splits, p_amount_minor;
  END IF;

  -- 3. Return full expense and its splits
  SELECT jsonb_build_object(
    'expense', to_jsonb(e),
    'splits', (
      SELECT jsonb_agg(to_jsonb(s))
      FROM public.expense_splits s
      WHERE s.group_expense_id = v_expense_id
    )
  ) INTO v_result
  FROM public.group_expenses e
  WHERE e.id = v_expense_id;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. SECURE INVITATION ACCEPTANCE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_group_invitation(
  p_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_invitation RECORD;
  v_group JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;

  -- Find invitation by token
  SELECT * INTO v_invitation
  FROM public.group_invitations
  WHERE token = trim(p_token)
  LIMIT 1;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF v_invitation.status != 'pending' THEN
    RAISE EXCEPTION 'This invitation is %', v_invitation.status;
  END IF;

  IF v_invitation.expires_at < now() THEN
    UPDATE public.group_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  -- If an email was specified on the invitation, ensure it matches the user
  IF v_invitation.invited_email IS NOT NULL AND trim(v_invitation.invited_email) != '' THEN
    IF lower(trim(v_invitation.invited_email)) != lower(trim(v_user_email)) THEN
      RAISE EXCEPTION 'This invitation was sent to a different email address';
    END IF;
  END IF;

  -- Upsert membership
  INSERT INTO public.group_members (group_id, user_id, role, status, joined_at)
  VALUES (v_invitation.group_id, v_user_id, v_invitation.role, 'active', now())
  ON CONFLICT (group_id, user_id) DO UPDATE SET
    status = 'active',
    role = CASE
      WHEN public.group_members.role = 'owner' THEN 'owner'
      ELSE EXCLUDED.role
    END;

  -- Update invitation record
  UPDATE public.group_invitations
  SET status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  WHERE id = v_invitation.id;

  -- Return group details
  SELECT to_jsonb(g) INTO v_group FROM public.groups g WHERE g.id = v_invitation.group_id;
  RETURN v_group;
END;
$$;

-- ============================================================================
-- 4. REALTIME PUBLICATION CONFIGURATION
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expenses;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settlements;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
