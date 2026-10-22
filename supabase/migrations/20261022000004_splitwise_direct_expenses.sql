-- 20261022000004_splitwise_direct_expenses.sql
-- Splitwise-style Architecture: Independent Direct Friend Expenses and Group Expenses

-- 1. FRIENDSHIPS TABLE
-- Explicit 1-to-1 canonical relationship between two registered Tabby users
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'blocked')),
  action_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_friendship_canonical UNIQUE (user_id_1, user_id_2),
  CONSTRAINT chk_friendship_canonical_order CHECK (user_id_1 < user_id_2)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON public.friendships(user_id_1);
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON public.friendships(user_id_2);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

-- Helper function to get or create canonical friendship between any two users
CREATE OR REPLACE FUNCTION public.get_or_create_friendship(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_u1 UUID;
  v_u2 UUID;
  v_friendship_id UUID;
BEGIN
  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create friendship with oneself';
  END IF;

  v_u1 := LEAST(p_user_a, p_user_b);
  v_u2 := GREATEST(p_user_a, p_user_b);

  SELECT id INTO v_friendship_id
  FROM public.friendships
  WHERE user_id_1 = v_u1 AND user_id_2 = v_u2;

  IF v_friendship_id IS NULL THEN
    INSERT INTO public.friendships (user_id_1, user_id_2, status, action_user_id)
    VALUES (v_u1, v_u2, 'accepted', auth.uid())
    ON CONFLICT (user_id_1, user_id_2) DO UPDATE
      SET updated_at = now()
    RETURNING id INTO v_friendship_id;
  END IF;

  RETURN v_friendship_id;
END;
$$;

-- 2. EVOLVE EXPENSES: ADD CONTEXT (Direct vs Group)
-- Safe, additive migration preserving existing data
ALTER TABLE public.group_expenses ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.group_expenses 
  ADD COLUMN IF NOT EXISTS context_type VARCHAR(10) NOT NULL DEFAULT 'group' 
  CHECK (context_type IN ('direct', 'group'));

ALTER TABLE public.group_expenses 
  ADD COLUMN IF NOT EXISTS friendship_id UUID 
  REFERENCES public.friendships(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_group_expenses_context ON public.group_expenses(context_type);
CREATE INDEX IF NOT EXISTS idx_group_expenses_friendship ON public.group_expenses(friendship_id);

-- 3. EVOLVE SETTLEMENTS: ADD CONTEXT (Direct vs Group)
ALTER TABLE public.settlements ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.settlements 
  ADD COLUMN IF NOT EXISTS context_type VARCHAR(10) NOT NULL DEFAULT 'group' 
  CHECK (context_type IN ('direct', 'group'));

ALTER TABLE public.settlements 
  ADD COLUMN IF NOT EXISTS friendship_id UUID 
  REFERENCES public.friendships(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_settlements_context ON public.settlements(context_type);
CREATE INDEX IF NOT EXISTS idx_settlements_friendship ON public.settlements(friendship_id);

-- 4. ATOMIC RPC: CREATE DIRECT EXPENSE WITH SPLITS
CREATE OR REPLACE FUNCTION public.create_direct_expense_with_splits(
  p_friend_id UUID,
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
  v_friendship_id UUID;
  v_expense_id UUID;
  v_split RECORD;
  v_sum_splits BIGINT := 0;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_user_id <> p_paid_by AND p_friend_id <> p_paid_by THEN
    RAISE EXCEPTION 'Payer must be one of the two direct participants';
  END IF;

  -- Ensure or create friendship record
  v_friendship_id := public.get_or_create_friendship(v_user_id, p_friend_id);

  -- Validate total amount
  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero';
  END IF;

  -- Insert the direct expense header
  INSERT INTO public.group_expenses (
    context_type,
    friendship_id,
    group_id,
    description,
    notes,
    category_id,
    paid_by,
    amount_minor,
    currency,
    reporting_currency,
    exchange_rate,
    exchange_rate_date,
    exchange_rate_source,
    reporting_amount_minor,
    split_type,
    expense_date,
    created_by
  ) VALUES (
    'direct',
    v_friendship_id,
    NULL,
    p_description,
    p_notes,
    p_category_id,
    p_paid_by,
    p_amount_minor,
    p_currency,
    p_reporting_currency,
    p_exchange_rate,
    p_exchange_rate_date,
    p_exchange_rate_source,
    p_reporting_amount_minor,
    p_split_type,
    p_expense_date,
    v_user_id
  )
  RETURNING id INTO v_expense_id;

  -- Insert individual participant splits
  FOR v_split IN SELECT * FROM jsonb_to_recordset(p_splits) AS (
    user_id UUID,
    share_minor BIGINT,
    weight NUMERIC,
    percentage_basis_points INTEGER
  )
  LOOP
    IF v_split.user_id <> v_user_id AND v_split.user_id <> p_friend_id THEN
      RAISE EXCEPTION 'Direct expense participant % does not belong to direct pair', v_split.user_id;
    END IF;

    INSERT INTO public.expense_splits (
      group_expense_id,
      user_id,
      share_minor,
      weight,
      percentage_basis_points
    ) VALUES (
      v_expense_id,
      v_split.user_id,
      v_split.share_minor,
      v_split.weight,
      v_split.percentage_basis_points
    );

    v_sum_splits := v_sum_splits + v_split.share_minor;
  END LOOP;

  -- Verify total allocation
  IF v_sum_splits <> p_amount_minor THEN
    RAISE EXCEPTION 'Sum of split shares (%) does not match expense amount (%)', v_sum_splits, p_amount_minor;
  END IF;

  -- Build response
  SELECT jsonb_build_object(
    'expense', (SELECT row_to_json(e) FROM public.group_expenses e WHERE e.id = v_expense_id),
    'splits', (SELECT jsonb_agg(row_to_json(s)) FROM public.expense_splits s WHERE s.group_expense_id = v_expense_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 5. ATOMIC RPC: RECORD DIRECT SETTLEMENT
CREATE OR REPLACE FUNCTION public.record_direct_settlement(
  p_friend_id UUID,
  p_amount_minor BIGINT,
  p_currency VARCHAR(3),
  p_settlement_date TIMESTAMPTZ,
  p_notes TEXT,
  p_payer_id UUID,
  p_recipient_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_friendship_id UUID;
  v_settlement_id UUID;
  v_result JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;

  IF p_payer_id = p_recipient_id THEN
    RAISE EXCEPTION 'Payer and recipient cannot be the same user';
  END IF;

  -- Ensure caller is one of the participants
  IF v_user_id <> p_payer_id AND v_user_id <> p_recipient_id THEN
    RAISE EXCEPTION 'Caller must be either the payer or recipient in a direct settlement';
  END IF;

  -- Ensure friendship exists
  v_friendship_id := public.get_or_create_friendship(v_user_id, p_friend_id);

  INSERT INTO public.settlements (
    context_type,
    friendship_id,
    group_id,
    from_user_id,
    to_user_id,
    amount_minor,
    currency,
    settlement_date,
    notes,
    created_by
  ) VALUES (
    'direct',
    v_friendship_id,
    NULL,
    p_payer_id,
    p_recipient_id,
    p_amount_minor,
    p_currency,
    p_settlement_date,
    p_notes,
    v_user_id
  )
  RETURNING id INTO v_settlement_id;

  SELECT row_to_json(s)::jsonb INTO v_result
  FROM public.settlements s
  WHERE s.id = v_settlement_id;

  RETURN v_result;
END;
$$;

-- 6. ROW LEVEL SECURITY POLICIES FOR FRIENDSHIPS & DIRECT CONTEXT
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'friendships_select'
  ) THEN
    CREATE POLICY friendships_select ON public.friendships
      FOR SELECT
      USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'friendships_insert'
  ) THEN
    CREATE POLICY friendships_insert ON public.friendships
      FOR INSERT
      WITH CHECK (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'friendships_update'
  ) THEN
    CREATE POLICY friendships_update ON public.friendships
      FOR UPDATE
      USING (auth.uid() = user_id_1 OR auth.uid() = user_id_2);
  END IF;
END $$;

-- Update Group Expenses SELECT Policy to permit direct friend expenses
DROP POLICY IF EXISTS group_expenses_select ON public.group_expenses;
CREATE POLICY group_expenses_select ON public.group_expenses
  FOR SELECT
  USING (
    (context_type = 'group' AND public.is_group_member(group_id, auth.uid()))
    OR
    (context_type = 'direct' AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.id = group_expenses.friendship_id
        AND (f.user_id_1 = auth.uid() OR f.user_id_2 = auth.uid())
    ))
  );

-- Update Settlements SELECT Policy to permit direct friend settlements
DROP POLICY IF EXISTS settlements_select ON public.settlements;
CREATE POLICY settlements_select ON public.settlements
  FOR SELECT
  USING (
    (context_type = 'group' AND public.is_group_member(group_id, auth.uid()))
    OR
    (context_type = 'direct' AND (from_user_id = auth.uid() OR to_user_id = auth.uid()))
  );

-- Enable Realtime on friendships
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;
